/* Shared helpers for the admin API (Cloudflare Pages Functions). This file exports no onRequest* handler, so it is not a route. */
const enc = new TextEncoder();
const COLLECTIONS = ["breaking", "markets", "lead", "news", "ads", "social", "jobs"];

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function b64url(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))));
}
export function timingEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/* Owner accounts: ADMIN_USERS = "salam:pass1, ali:pass2" (split on the first ":"; no commas in passwords).
   Fallback: ADMIN_USERNAME (default "admin") + ADMIN_PASSWORD. Owners can create/delete staff accounts from the site.
   Staff accounts live (salted PBKDF2 hashes only) in private/users.json on GitHub; that path is blocked from the public web. */
export const USERS_PATH = "private/users.json";
export const MESSAGES_PATH = "private/messages.json";
export function accounts(env) {
  const m = new Map();
  String(env.ADMIN_USERS || "").split(",").forEach(x => {
    const k = x.indexOf(":"); if (k < 1) return;
    const u = x.slice(0, k).trim().toLowerCase(), p = x.slice(k + 1).trim(); if (u && p) m.set(u, p);
  });
  if (env.ADMIN_PASSWORD) m.set((env.ADMIN_USERNAME || "admin").trim().toLowerCase(), env.ADMIN_PASSWORD);
  return m;
}
export function hasAccounts(env) { return accounts(env).size > 0; }

/* ---- staff password hashing ---- */
function hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function pbkdf2(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const k = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, k, 256)));
}
export async function makeHash(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pbkdf2(password, salt) };
}

/* ---- staff file on GitHub ---- */
export async function readUsers(env) {
  const r = await fetch(fileUrl(env, USERS_PATH), { headers: gh(env) });
  if (r.status === 404) return { users: {}, sha: null };
  if (!r.ok) throw new Error("github-users-" + r.status);
  const m = await r.json();
  let users = {}; try { users = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m.content.replace(/\s/g, "")), c => c.charCodeAt(0)))); } catch (e) {}
  return { users, sha: m.sha };
}
export async function changeUsers(env, mutate, who) {
  const c = cfg(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { users, sha } = await readUsers(env);
    const err = mutate(users); if (err) return err;
    const body = { message: "Update staff accounts" + (who ? " (by " + who.replace(/[^\w.-]/g, "") + ")" : ""), content: b64(JSON.stringify(users, null, 1)), branch: c.branch };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${USERS_PATH}`, { method: "PUT", headers: { ...gh(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return null;
    if (r.status !== 409 && r.status !== 422) throw new Error("github-put-" + r.status);
  }
  throw new Error("github-conflict");
}
/* ---- generic private JSON file on GitHub (e.g. private/messages.json) ---- */
export async function readJsonFile(env, path, fallback) {
  const r = await fetch(fileUrl(env, path), { headers: gh(env) });
  if (r.status === 404) return { data: fallback, sha: null };
  if (!r.ok) throw new Error("github-get-" + r.status);
  const m = await r.json();
  let data = fallback; try { data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m.content.replace(/\s/g, "")), c => c.charCodeAt(0)))); } catch (e) {}
  return { data, sha: m.sha };
}
/* mutate(data) changes data in place and returns null, or returns an error string to abort.
   "[CF-Pages-Skip]" in the commit message stops Cloudflare Pages from rebuilding the site for this commit. */
export async function changeJsonFile(env, path, fallback, mutate, message) {
  const c = cfg(env);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, sha } = await readJsonFile(env, path, JSON.parse(JSON.stringify(fallback)));
    const err = mutate(data); if (err) return err;
    const body = { message: message + " [CF-Pages-Skip]", content: b64(JSON.stringify(data, null, 1)), branch: c.branch };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${path}`, { method: "PUT", headers: { ...gh(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return null;
    if (r.status !== 409 && r.status !== 422) throw new Error("github-put-" + r.status);
  }
  throw new Error("github-conflict");
}
/* Resolve a username to { owner, secret, rec } or null. secret signs the session, so changing a password or deleting the user ends their sessions. */
async function findUser(env, u) {
  const acc = accounts(env);
  if (acc.has(u)) return { owner: true, secret: acc.get(u) };
  if (!env.GITHUB_TOKEN) return null;
  try { const rec = (await readUsers(env)).users[u]; return rec ? { owner: false, secret: rec.hash, rec } : null; } catch (e) { return null; }
}
/* returns the username on success, else null */
export async function checkLogin(env, user, given) {
  if (typeof given !== "string" || given.length > 200) return null;
  const u = String(user || "").trim().toLowerCase();
  const f = await findUser(env, u);
  if (!f) { await pbkdf2("x", "00".repeat(16)); return null; }
  if (f.owner) return timingEq(await hmac("cmp", given), await hmac("cmp", f.secret)) ? u : null;
  return timingEq(await pbkdf2(given, f.rec.salt), f.rec.hash) ? u : null;
}
function sessionKey(env, u, secret) { return u + "|" + secret + "|" + (env.SESSION_SECRET || ""); }
export async function sessionCookie(env, u) {
  const f = await findUser(env, u); if (!f) throw new Error("no-user");
  const exp = Date.now() + 30 * 864e5, uu = b64url(enc.encode(u));
  const sig = await hmac(sessionKey(env, u, f.secret), "admin." + uu + "." + exp);
  return `nabda_admin=${uu}.${exp}.${sig}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`;
}
export function clearCookie() { return "nabda_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"; }
/* { name, owner } when the session is valid, else null */
export async function session(request, env) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)nabda_admin=([\w-]+)\.(\d+)\.([\w-]+)/);
  if (!m || Number(m[2]) < Date.now()) return null;
  let u; try { u = new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))); } catch (e) { return null; }
  const f = await findUser(env, u); if (!f) return null;
  return timingEq(await hmac(sessionKey(env, u, f.secret), "admin." + m[1] + "." + m[2]), m[3]) ? { name: u, owner: f.owner } : null;
}
export async function adminUser(request, env) { const s = await session(request, env); return s ? s.name : null; }
export async function isAdmin(request, env) { return !!(await session(request, env)); }
export function sameOrigin(request) {
  const o = request.headers.get("Origin"); if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

/* ---------- GitHub ---------- */
function cfg(env) { return { repo: env.GITHUB_REPO || "nabdaonline001-code/nabdanews", branch: env.GITHUB_BRANCH || "main", path: env.DATA_PATH || "data/site.json" }; }
function gh(env, accept) { return { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nabda-admin" }; }
function fileUrl(env, path) { const c = cfg(env); return `https://api.github.com/repos/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`; }
function url(env) { return fileUrl(env, cfg(env).path); }
export async function fetchData(env) {
  const r = await fetch(url(env), { headers: gh(env, "application/vnd.github.raw+json") });
  if (!r.ok) throw new Error("github-get-" + r.status);
  return r.json();
}
async function fetchSha(env) {
  const r = await fetch(url(env), { headers: gh(env) });
  if (!r.ok) throw new Error("github-sha-" + r.status);
  return (await r.json()).sha;
}
function b64(str) {
  const b = enc.encode(str); let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function applyOp(root, o) {
  const c = (root[o.c] = root[o.c] || {});
  if (o.t === "set") c[o.id] = o.d;
  else if (o.t === "update") c[o.id] = Object.assign({}, c[o.id] || {}, o.d);
  else if (o.t === "del") delete c[o.id];
}
export function validOps(ops) {
  if (!Array.isArray(ops) || !ops.length || ops.length > 50) return false;
  return ops.every(o => o && COLLECTIONS.includes(o.c) && ["set", "update", "del"].includes(o.t) &&
    typeof o.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(o.id) &&
    (o.t === "del" || (o.d && typeof o.d === "object" && !Array.isArray(o.d))));
}
export async function commitOps(env, ops, who) {
  const c = cfg(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [root, sha] = await Promise.all([fetchData(env), fetchSha(env)]);
    ops.forEach(o => applyOp(root, o));
    const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${c.path}`, {
      method: "PUT", headers: { ...gh(env), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update site content" + (who ? " (by " + who.replace(/[^\w.-]/g, "") + ")" : ""), content: b64(JSON.stringify(root)), sha, branch: c.branch })
    });
    if (r.ok) return true;
    if (r.status !== 409 && r.status !== 422) throw new Error("github-put-" + r.status);
  }
  throw new Error("github-conflict");
}

/* Commit a binary file (e.g. an uploaded short video) to the repository. */
export async function putFile(env, path, bytes, message) {
  const c = cfg(env);
  const parts = [];
  for (let i = 0; i < bytes.length; i += 0x6000) { // multiple of 3 so chunks concatenate into valid base64
    let bin = ""; const end = Math.min(i + 0x6000, bytes.length);
    for (let j = i; j < end; j += 0x2000) bin += String.fromCharCode.apply(null, bytes.subarray(j, Math.min(j + 0x2000, end)));
    parts.push(btoa(bin));
  }
  const body = `{"message":${JSON.stringify(message)},"branch":${JSON.stringify(c.branch)},"content":"` + parts.join("") + `"}`;
  const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${path}`, { method: "PUT", headers: { ...gh(env), "Content-Type": "application/json" }, body });
  if (!r.ok) throw new Error("github-put-" + r.status);
}

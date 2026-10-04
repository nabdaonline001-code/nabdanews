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
/* Accounts: ADMIN_USERS = "salam:pass1, ali:pass2" (split on the first ":" so passwords may contain ":"; no commas in passwords).
   Fallback: ADMIN_USERNAME (default "admin") + ADMIN_PASSWORD. */
export function accounts(env) {
  const m = new Map();
  String(env.ADMIN_USERS || "").split(",").forEach(x => {
    const k = x.indexOf(":"); if (k < 1) return;
    const u = x.slice(0, k).trim().toLowerCase(), p = x.slice(k + 1).trim(); if (u && p) m.set(u, p);
  });
  if (env.ADMIN_PASSWORD) m.set((env.ADMIN_USERNAME || "admin").trim().toLowerCase(), env.ADMIN_PASSWORD);
  return m;
}
export async function checkLogin(env, user, given) {
  const acc = accounts(env); if (!acc.size || typeof given !== "string") return null;
  const u = String(user || "").trim().toLowerCase();
  const want = acc.get(u) ?? "\u0000no-such-user";
  const ok = timingEq(await hmac("cmp", given), await hmac("cmp", want)) && acc.has(u);
  return ok ? u : null;
}
function sessionKey(env, u, pw) { return u + "|" + pw + "|" + (env.SESSION_SECRET || ""); }
export async function sessionCookie(env, u) {
  const exp = Date.now() + 30 * 864e5, uu = b64url(enc.encode(u));
  const sig = await hmac(sessionKey(env, u, accounts(env).get(u)), "admin." + uu + "." + exp);
  return `nabda_admin=${uu}.${exp}.${sig}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`;
}
export function clearCookie() { return "nabda_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"; }
/* returns the username when the session is valid, else null */
export async function adminUser(request, env) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)nabda_admin=([\w-]+)\.(\d+)\.([\w-]+)/);
  if (!m || Number(m[2]) < Date.now()) return null;
  let u; try { u = new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))); } catch (e) { return null; }
  const pw = accounts(env).get(u); if (!pw) return null;
  return timingEq(await hmac(sessionKey(env, u, pw), "admin." + m[1] + "." + m[2]), m[3]) ? u : null;
}
export async function isAdmin(request, env) { return !!(await adminUser(request, env)); }
export function sameOrigin(request) {
  const o = request.headers.get("Origin"); if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

/* ---------- GitHub ---------- */
function cfg(env) { return { repo: env.GITHUB_REPO || "nabdaonline001-code/nabdanews", branch: env.GITHUB_BRANCH || "main", path: env.DATA_PATH || "data/site.json" }; }
function gh(env, accept) { return { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nabda-admin" }; }
function url(env) { const c = cfg(env); return `https://api.github.com/repos/${c.repo}/contents/${c.path}?ref=${encodeURIComponent(c.branch)}`; }
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

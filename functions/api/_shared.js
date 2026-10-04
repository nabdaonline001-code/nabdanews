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
export async function passwordOk(env, given) {
  if (!env.ADMIN_PASSWORD || typeof given !== "string") return false;
  return timingEq(await hmac("cmp", given), await hmac("cmp", env.ADMIN_PASSWORD));
}
function sessionKey(env) { return env.ADMIN_PASSWORD + "|" + (env.SESSION_SECRET || ""); }
export async function sessionCookie(env) {
  const exp = Date.now() + 30 * 864e5;
  const sig = await hmac(sessionKey(env), "admin." + exp);
  return `nabda_admin=${exp}.${sig}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`;
}
export function clearCookie() { return "nabda_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"; }
export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)nabda_admin=(\d+)\.([\w-]+)/);
  if (!m || Number(m[1]) < Date.now()) return false;
  return timingEq(await hmac(sessionKey(env), "admin." + m[1]), m[2]);
}
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
export async function commitOps(env, ops) {
  const c = cfg(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [root, sha] = await Promise.all([fetchData(env), fetchSha(env)]);
    ops.forEach(o => applyOp(root, o));
    const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${c.path}`, {
      method: "PUT", headers: { ...gh(env), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update site content", content: b64(JSON.stringify(root)), sha, branch: c.branch })
    });
    if (r.ok) return true;
    if (r.status !== 409 && r.status !== 422) throw new Error("github-put-" + r.status);
  }
  throw new Error("github-conflict");
}

import { json, session, sameOrigin, accounts, readUsers, changeUsers, makeHash, PERMS, cleanPerms } from "./_shared.js";
const NAME = /^[a-z0-9._-]{2,30}$/;
export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  try {
    const { users } = await readUsers(env);
    return json({ users: Object.keys(users).sort().map(u => ({ username: u, created: users[u].created || null, perms: cleanPerms(users[u].perms) || PERMS.slice(), legacy: !Array.isArray(users[u].perms) })), all: PERMS, owners: [...accounts(env).keys()] });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
/* POST { action: "add" | "password" | "delete" | "perms", username, password?, perms? } */
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  let b = {}; try { b = await request.json(); } catch (e) {}
  const u = String(b.username || "").trim().toLowerCase();
  if (!NAME.test(u)) return json({ error: "bad-username" }, 400);
  if (accounts(env).has(u)) return json({ error: "reserved" }, 400);
  const act = b.action;
  if (!["add", "password", "delete", "perms"].includes(act)) return json({ error: "bad-request" }, 400);
  let rec = null, perms = null;
  if (act === "add" || act === "perms") { perms = cleanPerms(b.perms); if (!perms) return json({ error: "bad-request" }, 400); }
  if (act === "add" || act === "password") {
    const p = b.password;
    if (typeof p !== "string" || p.length < 8 || p.length > 200) return json({ error: "weak-password" }, 400);
    rec = await makeHash(p); rec.perms = perms; rec.created = new Date().toISOString().slice(0, 10);
  }
  try {
    const err = await changeUsers(env, users => {
      if (act === "add") { if (users[u]) return "exists"; rec.perms = perms; users[u] = rec; }
      else if (act === "perms") { if (!users[u]) return "missing"; users[u].perms = perms; }
      else if (act === "password") { if (!users[u]) return "missing"; rec.created = users[u].created; if (Array.isArray(users[u].perms)) rec.perms = users[u].perms; else delete rec.perms; users[u] = rec; }
      else { if (!users[u]) return "missing"; delete users[u]; }
      return null;
    }, s.name);
    if (err) return json({ error: err }, 409);
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

import { json, adminUser, sameOrigin, validOps, commitOps } from "./_shared.js";
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const who = await adminUser(request, env);
  if (!who) return json({ error: "auth" }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: "not-configured" }, 500);
  const text = await request.text();
  if (text.length > 900000) return json({ error: "too-large" }, 413);
  let body = {}; try { body = JSON.parse(text); } catch (e) {}
  if (!validOps(body.ops)) return json({ error: "bad-request" }, 400);
  try { await commitOps(env, body.ops, who); return json({ ok: true }); }
  catch (e) { return json({ error: String(e.message || e) }, 502); }
}

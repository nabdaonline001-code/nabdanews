import { json, passwordOk, sessionCookie, sameOrigin } from "./_shared.js";
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) return json({ error: "not-configured" }, 500);
  let body = {}; try { body = await request.json(); } catch (e) {}
  if (!(await passwordOk(env, body.password))) { await new Promise(r => setTimeout(r, 500)); return json({ error: "bad-password" }, 401); }
  return json({ ok: true }, 200, { "Set-Cookie": await sessionCookie(env) });
}

/* Owner switch for "maintenance mode" (site hidden from the public, visible to logged-in accounts).
   GET  -> { maintenance: bool }
   POST { on: bool } -> writes private/status.json; the site redeploys and the change applies within about a minute. */
import { json, session, sameOrigin, readJsonFile, changeJsonFile, STATUS_PATH } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  try {
    const { data } = await readJsonFile(env, STATUS_PATH, { maintenance: false });
    return json({ maintenance: !!(data && data.maintenance), owner: s.owner });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  let b = {}; try { b = await request.json(); } catch (e) {}
  const on = !!b.on;
  try {
    await changeJsonFile(env, STATUS_PATH, { maintenance: false }, d => { d.maintenance = on; return null; },
      (on ? "Hide site from the public (maintenance on)" : "Open site to the public (maintenance off)") + " by " + s.name.replace(/[^\w.-]/g, ""), true);
    return json({ ok: true, maintenance: on });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

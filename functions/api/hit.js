/* POST /api/hit  body {k:"pv"} or {k:"read", id:"<news id>|lead"}  -> 204. Sent by shim.js for non-admin visitors. */
import { sameOrigin } from "./_shared.js";
import { record, ID_RE } from "./_stats.js";

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (!env.STATS || !sameOrigin(request)) return done();
  let b = {}; try { b = JSON.parse((await request.text()).slice(0, 400)); } catch (e) {}
  const k = b && b.k, id = String((b && b.id) || "");
  const work = (async () => {
    if (k === "pv") return record(env, request, "pv");
    if (k === "read" && ID_RE.test(id)) {
      if (id !== "lead") { /* only count real news items */
        try { const r = await env.ASSETS.fetch(new URL("/data/site.json", request.url)); const s = r.ok ? await r.json() : null; if (!s || !s.news || !s.news[id]) return; } catch (e) { return; }
      }
      return record(env, request, "read", id);
    }
  })();
  if (typeof ctx.waitUntil === "function") ctx.waitUntil(work); else await work;
  return done();
}

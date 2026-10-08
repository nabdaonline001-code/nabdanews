/* GET /api/top (logged-in admin only) -> { list:[{id,title}] }: the most-read news of today (Beirut day), at most 5. Empty while statistics are off. */
import { json, session } from "./_shared.js";
import { beirutDay } from "./_stats.js";

export async function onRequestGet({ request, env }) {
  const hdr = { "Cache-Control": "private, no-store" };
  if (!(await session(request, env))) return json({ error: "auth" }, 401);
  if (!env.STATS) return json({ list: [] }, 200, hdr);
  try {
    const day = beirutDay(), tally = {}; let cursor;
    for (let i = 0; i < 10; i++) {
      const r = await env.STATS.list({ prefix: "a:" + day + ":", cursor, limit: 1000 });
      for (const k of r.keys) { const p = k.name.split(":"); const id = p.slice(2, -1).join(":"); tally[id] = (tally[id] || 0) + (Number(k.metadata && k.metadata.n) || 0); }
      if (r.list_complete) break; cursor = r.cursor;
    }
    let news = {}, lead = "";
    try { const r = await env.ASSETS.fetch(new URL("/data/site.json", request.url)); const j = r.ok ? await r.json() : {}; news = j.news || {}; lead = (j.lead && j.lead.main && j.lead.main.title) || ""; } catch (e) {}
    const list = Object.entries(tally).sort((a, b) => b[1] - a[1])
      .map(([id]) => ({ id, title: id === "lead" ? lead : (news[id] && news[id].title) || "", sec: news[id] && news[id].section }))
      .filter(x => x.title && x.sec !== "video" && x.sec !== "shorts")
      .slice(0, 5).map(({ id, title }) => ({ id, title }));
    return json({ list }, 200, hdr);
  } catch (e) { return json({ list: [] }, 200, hdr); }
}

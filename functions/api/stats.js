/* GET /api/stats  (owner only) -> { enabled, days:[{d,pv,uv,rd}] (last 30 days, oldest first), top7:[{id,title,n}], top30:[...] } */
import { json, session } from "./_shared.js";
import { beirutDay } from "./_stats.js";

async function listAll(kv, prefix) {
  const out = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await kv.list({ prefix, cursor, limit: 1000 });
    out.push(...r.keys);
    if (r.list_complete) break; cursor = r.cursor;
  }
  return out;
}
export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  if (!env.STATS) return json({ enabled: false });
  try {
    const days = []; for (let i = 29; i >= 0; i--) days.push(beirutDay(Date.now() - i * 86400000));
    const idx = {}; days.forEach((d, i) => idx[d] = i);
    const rows = days.map(d => ({ d, pv: 0, uv: 0, rd: 0 }));
    const day7 = new Set(days.slice(-7)), art7 = {}, art30 = {};
    const [cs, as] = await Promise.all([listAll(env.STATS, "c:"), listAll(env.STATS, "a:")]);
    for (const k of cs) { const p = k.name.split(":"); const i = idx[p[1]]; if (i == null || !(["pv", "uv", "rd"].includes(p[2]))) continue; rows[i][p[2]] += Number(k.metadata && k.metadata.n) || 0; }
    for (const k of as) {
      const p = k.name.split(":"); if (idx[p[1]] == null) continue;
      const id = p.slice(2, -1).join(":"), n = Number(k.metadata && k.metadata.n) || 0;
      art30[id] = (art30[id] || 0) + n; if (day7.has(p[1])) art7[id] = (art7[id] || 0) + n;
    }
    let news = {}, lead = null;
    try { const r = await env.ASSETS.fetch(new URL("/data/site.json", request.url)); const j = r.ok ? await r.json() : {}; news = j.news || {}; lead = j.lead && j.lead.main && j.lead.main.title; } catch (e) {}
    const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ id, n, title: id === "lead" ? (lead ? "الخبر الرئيسي: " + lead : "الخبر الرئيسي") : ((news[id] && news[id].title) || "(خبر محذوف)") }));
    return json({ enabled: true, days: rows, top7: top(art7), top30: top(art30) });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

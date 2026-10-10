/* Today's NNA headlines (Beirut day), for the 08:00 newspapers message on Telegram.
   NNA refuses GitHub's servers, so the morning script reads them through the site. Cached 5 minutes. */
import { parseNnaDay } from "./ticker.js";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/xml,text/xml,*/*", "Accept-Language": "ar" };
export async function onRequestGet({ request, waitUntil }) {
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(request.url).origin + "/api/press?d=" + day + "&h=" + new Date().getUTCHours());
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(9000) }); if (!r.ok) throw new Error(u.split("/").slice(-2).join("/") + " " + r.status); return r.text(); };
  let items = [], err = "";
  try {
    const idx = await get("https://nna-leb.gov.lb/ar/sitemap/news.xml");
    const cats = [...idx.matchAll(/\/sitemap\/cat\/(\d+)<\/loc>/g)].map(m => m[1]).slice(0, 40);
    await Promise.all(cats.map(async c => { try { items.push(...parseNnaDay(await get(`https://nna-leb.gov.lb/ar/sitemap/n/${c}?date=${day}`))); } catch (e) {} }));
  } catch (e) { err = String(e.message || e); }
  const res = new Response(JSON.stringify({ day, items: items.map(i => ({ title: i.title, ts: i.ts })), err }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  if (cache && items.length) { const p = cache.put(key, res.clone()); if (waitUntil) waitUntil(p); else await p; }
  return res;
}

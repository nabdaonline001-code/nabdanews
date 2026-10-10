/* The owner's breaking Telegram channels, read for the site's breaking bar (/api/ticker pulls this).
   A separate endpoint so its ~19 page reads do not use up the ticker's own sub-request budget. Cached for one minute. */
import { channelItems } from "./_channels.js";

export async function onRequestGet({ request, waitUntil }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(request.url).origin + "/api/tgfeed?v=1");
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  let data = { items: [], used: {} };
  try { data = await channelItems(Date.now(), 120); } catch (e) { data.err = String(e && e.message || e); }
  const res = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } });
  if (cache) { const p = cache.put(key, res.clone()); if (waitUntil) waitUntil(p); else await p; }
  return res;
}

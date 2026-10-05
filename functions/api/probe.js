// TEMPORARY diagnostic: tests which public feed URLs are reachable from Cloudflare. Removed after use.
const OK = /^https:\/\/(www\.)?(mtv\.com\.lb|nbn\.com\.lb|almayadeen\.net|alhadath\.net|alarabiya\.net|lbci\.com|annahar\.com)\//;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "accept": "application/rss+xml,application/xml,text/xml,text/html;q=0.8,*/*;q=0.5", "accept-language": "ar,en;q=0.8" };
export async function onRequestGet({ request }) {
  const urls = new URL(request.url).searchParams.getAll("u").filter(u => OK.test(u)).slice(0, 14);
  const out = await Promise.all(urls.map(async u => {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(6000) });
      const t = await r.text();
      return { u, status: r.status, url: r.url, type: r.headers.get("content-type"), len: t.length, items: (t.match(/<item[\s>]/g) || []).length, urls: (t.match(/<url>/g) || []).length, entries: (t.match(/<entry[\s>]/g) || []).length, head: t.slice(0, 260).replace(/\s+/g, " ") };
    } catch (e) { return { u, err: String(e.name || e.message) }; }
  }));
  return new Response(JSON.stringify(out, null, 1), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

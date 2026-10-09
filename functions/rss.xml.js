/* /rss.xml: the latest published news (newest first, max 50) as RSS 2.0, built from data/site.json.
   Feeds search engines and AI assistants; every item links to its own crawlable /n/<id> page. */
const CANON = "https://nabdanews.org";
const SEC = { local: "محلي", world: "دولي", sports: "رياضة", economy: "اقتصاد", culture: "ثقافة", art: "فن", read: "اقرأ" };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; };

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  let site = {};
  try { const r = await ctx.env.ASSETS.fetch(new URL("/data/site.json", url.origin)); if (r.ok) site = await r.json(); } catch (e) {}
  const items = Object.entries(site.news || {})
    .map(([id, n]) => ({ id, n }))
    .filter(x => x.n && x.n.title && x.n.section !== "video" && x.n.section !== "shorts" && !/نص تجريبي/.test(x.n.full || "") && Number(x.n.order) > 1e12)
    .sort((a, b) => Number(b.n.order) - Number(a.n.order)).slice(0, 50);
  const last = items[0] ? new Date(Number(items[0].n.order)).toUTCString() : new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n` +
    `<title>نبضة | NABDA</title><link>${CANON}/</link><description>موقع إخباري لبناني عربي: أخبار محلية ودولية ورياضة واقتصاد وثقافة وفن</description><language>ar</language><lastBuildDate>${last}</lastBuildDate>\n` +
    `<atom:link href="${CANON}/rss.xml" rel="self" type="application/rss+xml"/>\n` +
    items.map(({ id, n }) => {
      const link = CANON + "/n/" + encodeURIComponent(id);
      return `<item><title>${esc(n.title)}</title><link>${esc(link)}</link><guid isPermaLink="true">${esc(link)}</guid><pubDate>${new Date(Number(n.order)).toUTCString()}</pubDate>` +
        (SEC[n.section] ? `<category>${esc(SEC[n.section])}</category>` : "") + `<description>${esc(cut(n.summary || n.full || n.title, 300))}</description></item>`;
    }).join("\n") + `\n</channel></rss>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

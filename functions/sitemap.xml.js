/* /sitemap.xml: the home page, the current lead story and every published news item (newest first, max 500). Built from data/site.json. */
const CANON = "https://nabdanews.org";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  let site = {};
  try { const r = await ctx.env.ASSETS.fetch(new URL("/data/site.json", url.origin)); if (r.ok) site = await r.json(); } catch (e) {}
  const rows = [];
  rows.push({ loc: CANON + "/", last: null, freq: "hourly", pr: "1.0" });
  if (((site.lead || {}).main || {}).title) rows.push({ loc: CANON + "/n/lead", last: null, freq: "daily", pr: "0.9" });
  Object.entries(site.news || {})
    .map(([id, n]) => ({ id, n }))
    .filter(x => x.n && x.n.title && x.n.section !== "video" && x.n.section !== "shorts" && !/نص تجريبي/.test(x.n.full || "") && Number(x.n.order) > 1e12)
    .sort((a, b) => Number(b.n.order) - Number(a.n.order)).slice(0, 500)
    .forEach(x => rows.push({ loc: CANON + "/n/" + encodeURIComponent(x.id), last: new Date(Number(x.n.order)).toISOString(), freq: "monthly", pr: "0.7" }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    rows.map(r => `<url><loc>${esc(r.loc)}</loc>${r.last ? `<lastmod>${r.last}</lastmod>` : ""}<changefreq>${r.freq}</changefreq><priority>${r.pr}</priority></url>`).join("\n") + `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}

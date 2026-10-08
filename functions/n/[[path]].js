/* Crawlable, share-friendly article pages: /n/<id> (HTML with real <title>, description, Open Graph and NewsArticle data)
   and /n/<id>.jpg (the article photo). Content comes from data/site.json, the same file the site itself reads.
   /n/lead is the current "أهم خبر". The in-page app keeps using #news/<id>; these URLs are for Google and for link previews. */
const CANON = "https://nabdanews.org";
const SEC = { local: "محلي", world: "دولي", sports: "رياضة", economy: "اقتصاد", culture: "ثقافة", art: "فن", read: "اقرأ" };

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = s => String(s || "").replace(/\s+/g, " ").trim();
const cut = (s, n) => { s = plain(s); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };

async function loadSite(env, url) {
  const r = await env.ASSETS.fetch(new URL("/data/site.json", url.origin));
  if (!r.ok) throw new Error("data");
  return r.json();
}
function pick(site, id) {
  if (id === "lead") {
    const m = (site.lead || {}).main || {};
    if (!m.title) return null;
    return { id: "lead", section: "", title: m.title, summary: m.body || "", full: m.full || "", image: ((site.lead || {}).image || {}).data || "", order: 0, lead: true };
  }
  const n = (site.news || {})[id];
  if (!n || !n.title || n.section === "video" || n.section === "shorts") return null;
  return { id, section: n.section, title: n.title, summary: n.summary || "", full: n.full || "", by: String(n.by || "").slice(0, 80), image: n.image || "", order: Number(n.order) || 0 };
}
function bytes(dataUri) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri || "");
  if (!m) return null;
  const bin = atob(m[2]), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return { type: "image/" + m[1], data: u };
}
function dateAr(ts) {
  try { return new Date(ts).toLocaleDateString("ar-LB-u-nu-latn", { timeZone: "Asia/Beirut", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; }
}

function page(it, hasImg) {
  const url = CANON + "/n/" + encodeURIComponent(it.id);
  const desc = cut(it.summary || it.full || it.title, 180);
  const img = hasImg ? url + ".jpg" : CANON + "/og-image.png";
  const iso = it.order > 1e12 ? new Date(it.order).toISOString() : null;
  const ld = {
    "@context": "https://schema.org", "@type": "NewsArticle", headline: cut(it.title, 110), description: desc, inLanguage: "ar",
    mainEntityOfPage: url, image: [img],
    ...(iso ? { datePublished: iso, dateModified: iso } : {}),
    author: { "@type": "Organization", name: "نبضة | NABDA", url: CANON },
    publisher: { "@type": "Organization", name: "نبضة | NABDA", url: CANON, logo: { "@type": "ImageObject", url: CANON + "/og-image.png" } },
  };
  const paras = String(it.full || "").split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => "<p>" + esc(t) + "</p>").join("");
  const tag = it.lead ? "أهم خبر" : (SEC[it.section] || "");
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(it.title)} | نبضة</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="نبضة | NABDA"><meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${esc(it.title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}">
${iso ? `<meta property="article:published_time" content="${iso}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(it.title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
:root{--g:#5a7567;--ink:#2b3a33;--line:#cfd9d4}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:18px/1.9 "Noto Naskh Arabic","Source Serif 4",Georgia,serif}
header{border-bottom:1px solid var(--line);padding:14px 20px}header a{color:var(--g);font:800 1.4rem "Noto Kufi Arabic","Segoe UI",Tahoma,sans-serif;text-decoration:none}
main{max-width:780px;margin:0 auto;padding:26px 20px 60px}
.tag{display:inline-block;border:1px solid var(--g);color:var(--g);padding:0 10px;font:.85rem "Noto Kufi Arabic","Segoe UI",Tahoma,sans-serif}
h1{margin:.4em 0 .2em;font:800 clamp(1.5rem,4vw,2.2rem)/1.5 "Noto Kufi Arabic","Segoe UI",Tahoma,sans-serif;color:var(--g)}
time{display:block;color:#6b8478;font:.9rem "Noto Kufi Arabic","Segoe UI",Tahoma,sans-serif;margin-bottom:16px}
img{display:block;width:100%;height:auto;margin:0 0 18px}.sum{font-weight:700}
.more{display:inline-block;margin-top:24px;border:1px solid var(--g);color:var(--g);padding:6px 18px;text-decoration:none;font:700 .95rem "Noto Kufi Arabic","Segoe UI",Tahoma,sans-serif}
.more:hover{background:var(--g);color:#fff}
</style></head><body>
<header><a href="/">نبضة | NABDA</a></header>
<main><article>
${tag ? `<span class="tag">${esc(tag)}</span>` : ""}
<h1>${esc(it.title)}</h1>
${iso ? `<time datetime="${iso}">${esc(dateAr(it.order))}</time>` : ""}
${hasImg ? `<img src="/n/${encodeURIComponent(it.id)}.jpg" alt="${esc(it.title)}" width="900" height="600">` : ""}
${it.summary ? `<p class="sum">${esc(it.summary)}</p>` : ""}
${paras}
${it.by ? `<p class="by" style="font-weight:700;border-top:1px solid #ccc;padding-top:12px">بقلم: ${esc(it.by)}</p>` : ""}
</article>
<a class="more" href="/">المزيد من الأخبار على نبضة</a></main></body></html>`;
}

function notFound() {
  return new Response(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>الخبر غير موجود | نبضة</title></head><body style="font:18px/1.8 sans-serif;padding:40px"><h1>الخبر غير موجود</h1><p>ربما حُذف هذا الخبر أو تغيّر رابطه.</p><p><a href="/">العودة إلى نبضة</a></p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  let id = decodeURIComponent(url.pathname.replace(/^\/n\//, "").replace(/\/+$/, ""));
  const wantImg = /\.jpg$/i.test(id);
  if (wantImg) id = id.replace(/\.jpg$/i, "");
  if (!id || /[\/]/.test(id)) return notFound();
  let site;
  try { site = await loadSite(ctx.env, url); } catch (e) { return new Response("temporarily unavailable", { status: 503, headers: { "Retry-After": "300" } }); }
  const it = pick(site, id);
  if (!it) return notFound();
  const b = bytes(it.image);
  if (wantImg) {
    if (!b) return notFound();
    return new Response(b.data, { headers: { "Content-Type": b.type, "Cache-Control": "public, max-age=3600" } });
  }
  return new Response(page(it, !!b), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

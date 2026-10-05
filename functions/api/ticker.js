/* Automatic breaking-news ticker: reads each channel's RSS (or Google News RSS for sites without one), applies the
   house rules (word policy, no questions / "watch the video" teasers / petty crime), keeps only recent items (60 min,
   widened up to 4 h when the news is quiet), and is edge-cached for 5 minutes. Public, read-only. */
const BROWSER = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/rss+xml,application/xml,text/xml,*/*", "Accept-Language": "ar,en;q=0.8" };
const bing = site => `https://www.bing.com/news/search?q=${encodeURIComponent("site:" + site)}&format=rss&setlang=ar&qft=sortbydate%3D%221%22`;
const gnews = site => `https://news.google.com/rss/search?q=site:${site}+when:2d&hl=ar&gl=LB&ceid=LB:ar`;
export const SOURCES = [
  { id: "jazeera", urls: ["https://www.aljazeera.net/rss"], skipLink: /\/(opinions|lifestyle|blogs|culture|features|health|programs)\// },
  { id: "jadeed", urls: ["https://www.aljadeed.tv/Rss/latest-news/ar"] },
  { id: "lbci", urls: ["https://www.lbcgroup.tv/Rss/latest-news/ar"] },
  { id: "annahar", urls: ["https://www.annahar.com/rss"], skipLink: /\/(articles|opinion|opinions|lifestyle|style|entertainment|people|fun|tech|technology|health|culture|cinema|tv|stars|fashion|food|travel|cars|science|women|society|blogs)\//i },
  { id: "mtv", html: { url: "https://www.mtv.com.lb/", parse: (h, now) => parseMtv(h, now) }, urls: [bing("mtv.com.lb"), gnews("mtv.com.lb")] },
  { id: "hadath", html: { url: "https://www.alhadath.net/", parse: (h, now) => parseHadath(h, now) }, urls: ["https://www.alarabiya.net/feed/rss2/ar/last-page.xml", bing("alhadath.net")] },
  { id: "nna", custom: now => fetchNna(now), urls: [] },
  { id: "nbn", urls: [bing("nbn.com.lb"), gnews("nbn.com.lb")] }
];

/* ---------- parsing ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeOnce(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch (x) { return m; } }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function decode(s) {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // some feeds double-encode (&amp;quot;): decode up to 3 times until stable
  for (let i = 0; i < 3; i++) { const n = decodeOnce(s); if (n === s) break; s = n; }
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tag(block, name) { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : ""; }
export function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tag(b, "title"), link = tag(b, "link"), when = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published");
    const ts = Date.parse(when);
    if (title && isFinite(ts)) out.push({ title, link, ts });
  }
  return out;
}

/* ---------- house rules ---------- */
const MEDIA = /بالفيديو|بالصور|بالصورة|(?<!\p{L})صورة(?!\p{L})|(?<!\p{L})فيديو(?!\p{L})|شاهد|شاهدوا|إليكم|تفاصيل|تابعوا|\(صور|لقطات|بالأرقام/u;
const SOFT = /\.{2,}|…|عُثر عليه جثة|عثر عليه جثة|عارضة أزياء|ظهور مفاجئ|يعترف|مسلسل|فيلم|الفنانة|الفنان|نجمة|نجوم|هوليوود|عرض أزياء|رحلة الحب|زواج|طلاق|مخدّرات|مخدرات|مروّج|مروجي|مداهمات|تاجر أسلحة|أسرار الصحف|مقدمات نشرات|عناوين الصحف|الصحف الصادرة|حفل تكريم|أقامت حفل|احتفلت|التحكم المروري|سرعة المشي|ترتبط بانخفاض|ترتبط بارتفاع|دراسة جديدة|حادثي سير|حادث سير|جرحى في حادث|شكراً لكل معلم|شكرا لكل معلم|يوم المعلم|هكذا|أولى لحظات|تتحدث عن|تتحدّث عن|التنمر|يُهدّد البشر|يهدد البشر|وهب الأعضاء|لكلّ محاربة|لكل محاربة|لستِ وحدكِ|لست وحدك|كارداشيان|مربيات|مربية|فاميلي|يحققان حلمهما|عرض حي|حفل زفاف|حفلة|يثير الجدل|تبكي|على المسرح|خلال تكريمها|خلال تكريمه|عساف|منى واصف/;
const MINOR = /بالجرم المشهود|سرقة|سارق|سطو|مشاجرة|إشكال|حادث سير|حادث سيارة|ضبطت قوى الأمن|ضبط مخدرات|ضبط كمية|توقيف شخص|توقيف مطلوب|نصائح|فوائد|وصفة|حظك|برجك|الطقس|حالة الطقس/;
const LEB = /لبنان|اللبناني|الجنوب|بنت جبيل|النبطية|مرجعيون|حاصبيا|الضاحية|البقاع|بعلبك|الهرمل|ميفدون|الخيام|الناقورة|مارون الراس|عيتا|كفرشوبا|شبعا|عيترون|الطيبة|الليطاني|صيدا|(?<!\p{L})صور(?!\p{L})/u;
const ECON = /اقتصاد|الاقتصاد|البورصة|بورصة|الأسهم|الدولار|الليرة|مصرف|المصارف|البنك|بنك|النفط|برنت|الذهب|الفضة|الأسعار|التضخم|الموازنة|الضريبة|صندوق النقد|الصادرات|الواردات|الفائدة|المحروقات|البنزين|المازوت|الودائع|سندات|ناتج محلي|عملة/;
const SPORT = /رياضة|الرياضة|مباراة|المباراة|كأس|منتخب|الفيفا|(?<!\p{L})(?:ال)?(?:دوري|نادي|أندية|مدرب|لاعب(?:ون|ين|ة)?|هدف|أهداف)(?!\p{L})|بطولة|كرة القدم|كرة السلة|ريال مدريد|برشلونة|رونالدو|ميسي|الأولمبي|التنس|الاتحاد الدولي لكرة/u;
export function clean(t, link) {
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^(عاجل|خاص|حصري)\s*[|:\-–—]\s*/, "").replace(/^عاجل\s+/, "");
  if (!t || /[؟?]/.test(t) || MEDIA.test(t) || MINOR.test(t) || SOFT.test(t)) return null;
  if (t.length < 18 || t.length > 190) return null;
  // word policy
  t = t.replace(/م[ي]?ل[ي]?ش[ي]?ات/g, "فصائل");
  t = t.replace(/(?:ال)?م[ي]?ل[ي]?ش[ي]?ا(?:وي|وية)?\s*/g, "");
  if (!LEB.test(t)) {
    t = t.replace(/(?:ال)?عدو\s+(?=(?:ال)?إسرائيل)/g, "");
    t = t.replace(/العدوان/g, "الهجوم").replace(/عدوان/g, "هجوم");
  }
  t = t.replace(/\s+/g, " ").trim();
  return t.length >= 12 ? t : null;
}
export function catOf(t) { return ECON.test(t) ? "economy" : SPORT.test(t) ? "sports" : "politics"; }
const words = s => new Set(s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2));
const similar = (a, b) => { const A = words(a), B = words(b); let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.min(A.size, B.size || 1) >= 0.6 && Math.min(A.size, B.size) >= 4; };
const norm = s => s.replace(/[^\p{L}\p{N}]/gu, "");

/* ---------- HTML front pages (sites with no usable RSS) ---------- */
// MTV: article links are /News/<section>/<id>/<slug> with the headline in div.news-title. Ids grow with time, so the
// distance from the newest id gives a time estimate (about 4 minutes per id); only the newest ~45 ids are kept.
export function parseMtv(html, now = Date.now()) {
  const found = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href="(\/News\/[^"]*?\/(\d{5,})\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[3].match(/class="news-title"[^>]*>([\s\S]*?)<\/div>/i);
    if (!t) continue;
    const title = decode(t[1]);
    if (!title) continue;
    let sec = ""; try { sec = decodeURIComponent(decode(m[1]).split("/")[2] || ""); } catch (e) {}
    if (/^(فن|منوعات|ناس|رياضة)/.test(sec)) continue;
    found.set(+m[2], { title, link: "https://www.mtv.com.lb" + decode(m[1]), id: +m[2] });
  }
  const max = Math.max(0, ...found.keys());
  return [...found.values()].filter(x => max - x.id <= 45).map(x => ({ title: x.title, link: x.link, ts: now - (max - x.id) * 4 * 60000 - 60000 }));
}
// Al Hadath: article links carry the date (/2026/10/05/slug) and the headline in the title attribute. The page has no
// times, so today's stories are spread over the last hour in page order and yesterday's sit just before midnight.
export function parseHadath(html, now = Date.now()) {
  const day = ms => new Date(ms + 3 * 3600000).toISOString().slice(0, 10).replace(/-/g, "/");
  const today = day(now), yest = day(now - 86400000), midnight = Date.parse(today.replace(/\//g, "-") + "T00:00:00Z") - 3 * 3600000;
  const out = [], seen = new Set(); let a = 0, b = 0;
  for (const m of html.matchAll(/<a\b[^>]*?href="((?:\/[a-z]+)?\/(20\d\d\/\d\d\/\d\d)\/[^"]+)"[^>]*?title="([^"]+)"/gi)) {
    if (/^\/videos\//.test(m[1]) || seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = decode(m[3]); if (!title) continue;
    const d = m[2];
    if (d === today) out.push({ title, link: "https://www.alhadath.net" + m[1], ts: now - 60000 * (5 + 4 * a++) });
    else if (d === yest) out.push({ title, link: "https://www.alhadath.net" + m[1], ts: midnight - 60000 * (5 + 4 * b++) });
  }
  return out;
}

// National News Agency: its RSS is frozen on old items, so read the news sitemaps instead. news.xml lists one sitemap
// per section with its last-update time; each section has a per-day sitemap whose urls carry the headline as the slug
// and the update time as lastmod.
export function parseNnaDay(xml) {
  const out = [];
  for (const m of xml.matchAll(/<loc>[^<]*?\/news\/(\d+)\/([^<\/]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    let slug = m[2]; try { slug = decodeURIComponent(slug); } catch (e) { continue; }
    const title = slug.replace(/-+/g, " ").replace(/\s+/g, " ").trim(), ts = Date.parse(m[3]);
    if (title && ts) out.push({ title, link: "https://nna-leb.gov.lb/ar/news/" + m[1], ts });
  }
  return out;
}
async function fetchNna(now) {
  const get = async u => { const r = await fetch(u, { headers: { ...BROWSER, Accept: "application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(9000) }); if (!r.ok) throw new Error("http-" + r.status); return r.text(); };
  const idx = await get("https://nna-leb.gov.lb/ar/sitemap/news.xml");
  const cats = [...idx.matchAll(/\/sitemap\/cat\/(\d+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].filter(m => now - Date.parse(m[2]) < 30 * 3600000).slice(0, 8).map(m => m[1]);
  const b = new Date(now + 3 * 3600000), day = d => d.toISOString().slice(0, 10);
  const days = [day(b)]; if (b.getUTCHours() < 4) days.push(day(new Date(b.getTime() - 86400000)));
  const out = [];
  await Promise.all(cats.flatMap(c => days.map(async d => { try { out.push(...parseNnaDay(await get(`https://nna-leb.gov.lb/ar/sitemap/n/${c}?date=${d}`))); } catch (e) {} })));
  return out;
}

/* ---------- fetching ---------- */
async function fetchFeed(src) {
  let last = "no-url";
  if (src.custom) {
    try { const items = await src.custom(Date.now()); if (items.length) return { items, via: "custom" }; last = "custom-empty"; } catch (e) { last = "custom-" + String(e.name || e.message || e); }
  }
  if (src.html) {
    try {
      const r = await fetch(src.html.url, { headers: { ...BROWSER, Accept: "text/html,*/*;q=0.5" }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const items = src.html.parse(await r.text(), Date.now()); if (items.length) return { items, via: src.html.url }; last = "html-empty"; } else last = "html-http-" + r.status;
    } catch (e) { last = "html-" + String(e.name || e.message || e); }
  }
  for (const u of src.urls) {
    try {
      const r = await fetch(u, { headers: BROWSER, signal: AbortSignal.timeout(4000) });
      if (!r.ok) { last = "http-" + r.status; continue; }
      const items = parseFeed(await r.text()); if (!items.length) { last = "empty"; continue; }
      return { items, via: u };
    } catch (e) { last = String(e.name || e.message || e); }
  }
  return { items: [], err: last };
}
function stripSource(t) { const i = t.lastIndexOf(" - "); return i > 12 ? t.slice(0, i) : t; }

export async function build(now = Date.now()) {
  const res = await Promise.all(SOURCES.map(s => fetchFeed(s).then(r => ({ s, r }))));
  const status = {}, cand = [];
  for (const { s, r } of res) {
    const mine = [];
    for (const it of r.items) {
      if (s.skipLink && s.skipLink.test(it.link)) continue;
      if (it.ts > now + 600000) continue;
      const text = clean(/news\.google\./.test(r.via || "") ? stripSource(it.title) : it.title, it.link);
      if (text) mine.push({ text, ts: it.ts, src: s.id });
    }
    mine.sort((a, b) => b.ts - a.ts);
    status[s.id] = r.err ? { ok: false, err: r.err } : { ok: true, feed: r.items.length, usable: mine.length, newest: mine[0] ? Math.round((now - mine[0].ts) / 60000) + "m" : null };
    cand.push(...mine);
  }
  let windowMin = 60, picked = [];
  for (const w of [60, 120, 240, 720, 1440]) {
    windowMin = w; picked = [];
    const per = {}, seen = new Set();
    for (const c of cand.slice().sort((a, b) => b.ts - a.ts)) {
      if (now - c.ts > w * 60000) continue;
      const k = norm(c.text), k2 = k.slice(0, 28);
      if (seen.has(k) || seen.has(k2) || picked.some(p => similar(p.text, c.text))) continue;
      if ((per[c.src] = (per[c.src] || 0) + 1) > 3) continue;
      seen.add(k); seen.add(k2); picked.push(c);
    }
    if (picked.length >= (w <= 120 ? 8 : 6)) break;
  }
  picked = picked.slice(0, 16).map(c => ({ text: c.text, cat: catOf(c.text), ts: c.ts }));
  return { items: picked, windowMin, updated: new Date(now).toISOString(), sources: status };
}

export async function onRequestGet({ request, waitUntil }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(request.url).origin + "/api/ticker");
  if (cache && !new URL(request.url).searchParams.has("fresh")) { const hit = await cache.match(key); if (hit) return hit; }
  const data = await build();
  const res = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": data.items.length ? "public, max-age=300" : "public, max-age=60" } });
  if (cache) { const p = cache.put(key, res.clone()); if (waitUntil) waitUntil(p); else await p; }
  return res;
}

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
  { id: "mtv", urls: [bing("mtv.com.lb"), gnews("mtv.com.lb")] },
  { id: "mayadeen", urls: ["https://www.almayadeen.net/rss", bing("almayadeen.net"), gnews("almayadeen.net")] },
  { id: "hadath", urls: [bing("alhadath.net"), "https://www.alarabiya.net/feed/rss2/ar/last-page.xml"] },
  { id: "nbn", urls: [bing("nbn.com.lb"), gnews("nbn.com.lb")] }
];

/* ---------- parsing ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch (x) { return m; } }
    return ENT[e.toLowerCase()] ?? m;
  }).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
const SOFT = /\.{2,}|…|عُثر عليه جثة|عثر عليه جثة|عارضة أزياء|ظهور مفاجئ|يعترف|مسلسل|فيلم|الفنانة|الفنان|نجمة|نجوم|هوليوود|عرض أزياء|رحلة الحب|زواج|طلاق/;
const MINOR = /بالجرم المشهود|سرقة|سارق|سطو|مشاجرة|إشكال|حادث سير|حادث سيارة|ضبطت قوى الأمن|ضبط مخدرات|ضبط كمية|توقيف شخص|توقيف مطلوب|نصائح|فوائد|وصفة|حظك|برجك|الطقس|حالة الطقس/;
const LEB = /لبنان|اللبناني|الجنوب|بنت جبيل|النبطية|مرجعيون|حاصبيا|الضاحية|البقاع|بعلبك|الهرمل|ميفدون|الخيام|الناقورة|مارون الراس|عيتا|كفرشوبا|شبعا|عيترون|الطيبة|الليطاني|صيدا|(?<!\p{L})صور(?!\p{L})/u;
const ECON = /اقتصاد|الاقتصاد|البورصة|بورصة|الأسهم|الدولار|الليرة|مصرف|المصارف|البنك|بنك|النفط|برنت|الذهب|الفضة|الأسعار|التضخم|الموازنة|الضريبة|صندوق النقد|الصادرات|الواردات|الفائدة|المحروقات|البنزين|المازوت|الودائع|سندات|ناتج محلي|عملة/;
const SPORT = /رياضة|الرياضة|مباراة|المباراة|كأس|دوري|منتخب|الفيفا|لاعب|نادي|بطولة|كرة القدم|كرة السلة|ريال مدريد|برشلونة|رونالدو|ميسي|هدف|مدرب|الأولمبي|التنس|الاتحاد الدولي لكرة/;
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
const norm = s => s.replace(/[^\p{L}\p{N}]/gu, "");

/* ---------- fetching ---------- */
async function fetchFeed(src) {
  let last = "no-url";
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
      if (seen.has(k) || seen.has(k2)) continue;
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

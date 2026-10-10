/* Breaking news for the Telegram channel comes ONLY from the stations' own breaking-news Telegram channels
   (the owner: «يبدو أنك تأخذ الأخبار وليس فقط العواجل» → switch to real breaking streams).
   Each outlet lists candidate public usernames (`trusted`: usernames the owner confirmed as the real channel); the first one whose public page (t.me/s/<name>) has posts is used,
   the others are ignored. Every post then goes through the site's own wording rules (clean() in ticker.js). */
import { clean, houthiFix } from "../functions/api/ticker.js";

/* the owner's own list of breaking channels (2026-10-10). `trusted` = confirmed by the owner, so no blue tick is needed.
   `fix`: outlets whose loaded vocabulary must not reach the channel (Houthi / Iranian / Al-Alam): same rule as the site («مرتزقة», «العدوان السعودي», «الكيان الصهيوني»…). */
const T = n => ({ names: [n], trusted: [n] });
export const CHANNELS = [
  { id: "lbci",       ...T("LBCI_NEWS") },
  { id: "jadeed",     ...T("ALJADEED_NEWS") },
  { id: "mtv",        ...T("MTVLebanonNews") },
  { id: "akhbar",     ...T("alakhbar_news") },
  { id: "bintjbeil",  ...T("bintjbeilnews") },
  { id: "lebdebate",  ...T("lebanondebate") },
  { id: "jazeera",    ...T("AjaNews") },
  { id: "arabiya",    ...T("Alarabiya") },
  { id: "araby",      ...T("AlarabyTelevision") },
  { id: "mayadeen",   ...T("almayadeen") },
  { id: "mamlaka",    ...T("almamlakatvbreaking") },
  { id: "quds",       ...T("QudsN") },
  { id: "lebnow",     ...T("lebanonNewsNow") },
  { id: "ksanews",    ...T("ksanewstoday") },
  { id: "arabemerg",  ...T("alarabemergency") },
  { id: "roseaalym",  ...T("roseaalym") },
  { id: "alalam",     ...T("alalamarabic"), fix: true },
  { id: "masirah",    ...T("almasirah2"), fix: true },
  { id: "fars",       ...T("arabic_farsnews"), fix: true }
];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rlm: "", lrm: "", zwj: "", zwnj: "", shy: "", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? " "));

/* the first real line of a post, without labels, hashtags, links, mentions or the station's signature */
export function firstLine(html) {
  const txt = decode(decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")));
  for (let line of txt.split(/\n+/)) {
    line = line.replace(/https?:\/\/\S+|t\.me\/\S+|@\w+/g, " ").replace(/#[\p{L}\p{N}_]+/gu, " ")
      .replace(/^[\p{Extended_Pictographic}️‍\s•▪️◾️🔸🔹⭕️|:\-–—]*/u, "")
      .replace(/^(?:خبر\s+)?عاجل(?:ة)?\s*[|:\-–—،]*\s*/u, "")
      .replace(/^(?:ورد\s+الآن|ورد\s+للتو|الآن|الان|الآن\s+عاجل|متابعة|تحديث|مباشر|أخبار عاجلة|خبر عاجل|هام|مهم|عاجل\s+جدا|عاجل\s+جداً)\s*[|:\-–—،]+\s*/u, "")
      .replace(/^[\p{Extended_Pictographic}️‍\s|:\-–—]*/u, "")
      .replace(/[\p{Extended_Pictographic}️‍]+/gu, " ")
      .replace(/\s+/g, " ").trim();
    if (/\p{L}{2,}.*\p{L}{2,}/u.test(line)) return line;
  }
  return "";
}

export function parseChannel(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g)) {
    const block = m[0];
    if (/tgme_widget_message_forwarded_from/.test(block)) continue;          /* reposts of other channels */
    if (/tgme_widget_message_link_preview/.test(block)) continue;              /* post with an article link preview */
    const bodyHtml = (block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
    if (/<a\b[^>]*href="(?!https?:\/\/t\.me\/|\?q=)/i.test(bodyHtml) || /https?:\/\/(?!t\.me\/)\S+|www\.\S+/i.test(bodyHtml.replace(/<[^>]+>/g, " "))) continue;   /* «اقرأ المزيد: رابط» — the owner wants no linked news */
    const body = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const time = block.match(/<time[^>]*datetime="([^"]+)"/);
    const post = block.match(/data-post="([^"]+)"/);
    if (!body || !time) continue;
    const ts = Date.parse(time[1]);
    const text = firstLine(body[1]);
    if (text && ts) out.push({ text, ts, post: post ? post[1] : "" });
  }
  return out;
}

const LEB = /لبنان|اللبناني|اللبنانية|بيروت|الضاحية|جنوب لبنان|الجنوب|البقاع|بعلبك|الهرمل|النبطية|صيدا|(?<!\p{L})صور(?!\p{L})|طرابلس|عكار|بنت جبيل|مرجعيون|حاصبيا|كفركلا|الخيام|الناقورة|اليونيفيل|حزب الله|الرئيس عون|الرئيس بري|نواف سلام|الرئيس سلام/u;

async function page(name, trusted) {
  try {
    const r = await fetch(`https://t.me/s/${name}`, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ar" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const h = await r.text();
    if (!/tgme_widget_message_wrap/.test(h)) return null;
    /* fake look-alike channels: use a page only when Telegram marks it verified (blue tick) or the owner confirmed it */
    const head = (h.match(/<div class="tgme_channel_info_header[\s\S]*?<\/div>\s*<\/div>/) || h.match(/<div class="tgme_header_title[\s\S]*?<\/div>/) || [""])[0];
    if (!trusted && !/verified-icon/.test(head)) { console.log("skipped (not verified):", name); return null; }
    return h;
  } catch (e) { return null; }
}

/* all fresh posts from every outlet, already in Nabda's wording; `used` reports which username answered for each outlet */
export async function channelItems(now = Date.now(), freshMin = 30) {
  const items = [], used = {};
  await Promise.all(CHANNELS.map(async ch => {
    for (const name of ch.names) {
      const h = await page(name, (ch.trusted || []).map(x => x.toLowerCase()).includes(name.toLowerCase()));
      if (!h) continue;
      used[ch.id] = name;
      for (const p of parseChannel(h)) {
        if (now - p.ts > freshMin * 60000 || p.ts - now > 5 * 60000) continue;
        const t = clean(ch.fix ? houthiFix(p.text) : p.text, "", false);
        if (t) items.push({ text: t, ts: p.ts, src: ch.id, leb: LEB.test(t) ? 1 : 0 });
      }
      break;
    }
  }));
  return { items, used };
}

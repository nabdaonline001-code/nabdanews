/* Sends the site's breaking news to the Telegram channel, automatically (GitHub Actions, every 5 minutes).
   Needs two repository secrets: TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the channel, e.g. @your_channel).
   What is sent: the owner's manual breaking items (data/site.json) and the stations' own breaking-news Telegram channels (tg-channels.mjs), no sports, Lebanese ones first; never the same story twice
   (same one-source rule as the site's bar), at most MAX_PER_RUN per run and MAX_PER_HOUR per hour.
   Memory between runs is a tiny JSON file kept in the Actions cache (.tg-state/sent.json). The first run only records what is
   already on the bar (nothing is posted), so the channel is not flooded. TG_TEST=1 sends one test message; TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";
import { similar, isOfficial, JUNK, BAIT, VAGUE } from "../functions/api/ticker.js";
import { channelItems } from "../functions/api/_channels.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", CHAT = process.env.TELEGRAM_CHAT_ID || "";
const DRY = !!process.env.TG_DRY, TEST = !!process.env.TG_TEST;
/* steady flow, not bursts: at most 10 items per one-minute pass (owner: «على الأقل 10») (the rest wait for the next pass, most important first),
   and a high hourly ceiling so the channel does not fall silent mid-hour («تأتي بسرعة ورا بعضها وتقف فجأة») */
const MAX_PER_RUN = 10, MAX_PER_HOUR = 400, FRESH_MIN = 30;
const STATE = path.join(".tg-state", "sent.json");
const norm = s => String(s || "").replace(/^هيئة عمليات التجارة البحرية البريطانية\s*[:：]\s*/, "").replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!DRY && (!TOKEN || !CHAT)) { console.log("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set yet: nothing to do."); process.exit(0); }

async function send(text) {
  if (DRY) { console.log("[dry] " + text); return true; }
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return true;
    if (r.status === 429) { await sleep(((j.parameters && j.parameters.retry_after) || 5) * 1000 + 500); continue; }
    console.error("Telegram error:", r.status, j.description || ""); return false;
  }
  return false;
}

if (TEST) { const ok = await send("✅ نبضة: تم ربط البوت بالقناة بنجاح. ستصل العواجل إلى هنا تلقائياً."); console.log(ok ? "test sent" : "test failed"); process.exit(ok ? 0 : 1); }

let st = { keys: [], texts: [], times: [], seeded: false };
try { st = { ...st, ...JSON.parse(fs.readFileSync(STATE, "utf8")) }; } catch (e) {}
const now = Date.now();
st.times = st.times.filter(t => now - t < 3600000);
st.texts = st.texts.filter(x => now - x.t < 3 * 3600000);

/* candidates: manual items first, then the automatic bar */
const cand = [];
try {
  const site = JSON.parse(fs.readFileSync("data/site.json", "utf8"));
  for (const [id, b] of Object.entries(site.breaking || {})) if (b && b.text && b.order > 1e12 && now - b.order <= FRESH_MIN * 60000) cand.push({ text: String(b.text).trim(), ts: b.order, man: 1, off: 1 });
} catch (e) { console.error("site.json:", e.message); }
/* the channel is public: no site names/taglines, no teasers or analysis titles, no clickbait/entertainment, no sport («كل خبر ليس واضحاً لا أريده», «لا أريد رياضة») */
const TG_SPORT = /رياض[ةي]|الرياضة|مباراة|المباراة|مباريات|كأس|منتخب|فيفا|الفيفا|يويفا|(?<!\p{L})(?:ال)?(?:دوري|نادي|أندية|مدرب|مدربة|لاعب|لاعبة|لاعبون|لاعبين|هدف|أهداف|ملعب|الملعب|حكم المباراة|ركلة|بطولة|بطل العالم|نهائي|ميدالية|ميداليات)(?!\p{L})|كرة القدم|كرة السلة|كرة اليد|كرة الطائرة|التنس|الأولمبي|الأولمبية|أولمبياد|فورمولا|سباق|رالي|ملاكمة|المصارعة|الجودو|السباحة|ألعاب القوى|ماراثون|ريال مدريد|برشلونة|ليفربول|مانشستر|بايرن|يوفنتوس|باريس سان جيرمان|الزمالك|النادي الأهلي|ميسي|رونالدو|صلاح|انتقالات|سوق الانتقالات|الاتحاد اللبناني لكرة|الاتحاد الدولي لكرة/u;
const publishable = (t, src) => { if (TG_SPORT.test(t)) return false; const w = t.split(/\s+/).filter(x => /\p{L}{2,}/u.test(x)); return w.length >= 5 && t.replace(/[^\p{L}]/gu, "").length >= 22 && !JUNK.test(t) && !BAIT.test(t) && !VAGUE.test(t); };
let data = { items: [], used: {} };
try { data = await channelItems(now, FRESH_MIN); } catch (e) { console.error("channels failed:", e.message); }
console.log("breaking channels in use:", JSON.stringify(data.used), "| fresh posts:", data.items.length);
for (const it of data.items) if (publishable(it.text, it.src)) cand.push({ text: it.text, ts: it.ts, man: 0, leb: it.leb, off: isOfficial(it.src, it.text, "") ? 1 : 0 });
/* decision-makers' statements and speeches come first (owner: «الأولوية للخطابات السياسية… وكل من له وزن في صناعة القرار») */
const LEADERS = /نعيم قاسم|الشيخ قاسم|أمين عام حزب الله|الأمين العام لحزب الله|نتنياهو|ترامب|البيت الأبيض|بزشكيان|الرئيس الإيراني|خامنئي|المرشد الإيراني|المرشد الأعلى|عراقجي|الرئيس السوري|أحمد الشرع|(?<!\p{L})الشرع(?!\p{L})|محمد بن سلمان|ولي العهد السعودي|الملك سلمان|العاهل السعودي|السيسي|الرئيس المصري|الملك عبدالله|العاهل الأردني|محمد بن زايد|رئيس الإمارات|أمير قطر|تميم بن حمد|أردوغان|الرئيس التركي|بوتين|الكرملين|ماكرون|الإليزيه|ستارمر|ميرتس|زيلينسكي|شي جين بينغ|الرئيس الصيني|روبيو|فانس|ويتكوف|غوتيريش|الأمين العام للأمم المتحدة|الرئيس عون|جوزاف عون|الرئيس اللبناني|الرئيس بري|نبيه بري|رئيس مجلس النواب|نواف سلام|الرئيس سلام|رئيس الحكومة اللبنانية|عبد الملك الحوثي|السوداني|رئيس الوزراء العراقي|كاتس|وزير الدفاع الإسرائيلي|رئيس الأركان الإسرائيلي|أبو عبيدة|حماس|عباس|الرئيس الفلسطيني/u;
for (const c of cand) c.lead = LEADERS.test(c.text) ? 1 : 0;
cand.sort((a, b) => (b.man - a.man) || (b.lead - a.lead) || ((b.leb || 0) - (a.leb || 0)) || (b.ts - a.ts));   /* manual, then decision-makers, then Lebanon, then newest */   /* manual first, then Lebanon, then newest */

let sent = 0;
for (const c of cand) {
  const k = norm(c.text);
  if (!k || st.keys.includes(k)) continue;
  if (st.texts.some(x => x.off === c.off && similar(x.text, c.text))) { st.keys.push(k); continue; }   /* same story already sent (same class: official / report) */
  if (!st.seeded || !st.ch) { st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); continue; }
  if (sent >= MAX_PER_RUN || st.times.length >= MAX_PER_HOUR) break;
  if (await send("🔴 <b>عاجل |</b> " + c.text.replace(/ترم[\u064E\u0652]?[بپ]|ترامپ/g, "ترامب").replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200d\u20e3]+/gu, " ").replace(/\s+/g, " ").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))) { sent++; st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); st.times.push(Date.now()); await sleep(2000); }
}
if (!st.seeded || !st.ch) console.log("first run: recorded " + st.keys.length + " current items without posting");
st.seeded = true; st.ch = true; st.keys = st.keys.slice(-400); st.texts = st.texts.slice(-80);
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st));
console.log("sent " + sent + " message(s)");

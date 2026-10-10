/* Sends the site's breaking news to the Telegram channel, automatically (GitHub Actions, every 5 minutes).
   Needs two repository secrets: TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the channel, e.g. @your_channel).
   What is sent: the owner's manual breaking items (data/site.json) and the stations' own breaking-news Telegram channels (tg-channels.mjs), no sports, Lebanese ones first; never the same story twice
   (same one-source rule as the site's bar), at most MAX_PER_RUN per run and MAX_PER_HOUR per hour.
   Memory between runs is a tiny JSON file kept in the Actions cache (.tg-state/sent.json). The first run only records what is
   already on the bar (nothing is posted), so the channel is not flooded. TG_TEST=1 sends one test message; TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";
import { similar, isOfficial } from "../functions/api/ticker.js";
import { channelItems } from "./tg-channels.mjs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", CHAT = process.env.TELEGRAM_CHAT_ID || "";
const DRY = !!process.env.TG_DRY, TEST = !!process.env.TG_TEST;
const MAX_PER_RUN = 15, MAX_PER_HOUR = 60, FRESH_MIN = 30;
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
const JUNK = /^(?:(?:أحدث|احدث|آخر|اخر|أهم|اهم|أبرز|ابرز|جديد|كل|متابعة|تغطية|موجز|نشرة|ملخص|عناوين|تحديثات|مباشر)(?!\p{L})|(?:ال)?أخبار(?!\p{L}))|أخبار\s+\S+\s+والعالم|لحظة بلحظة|على مدار الساعة|الموقع الرسمي|اشترك|تابعونا|حمّل التطبيق|حمل التطبيق|المزيد|اقرأ أيضا|اقرأ أيضاً/u;
const BAIT = /يشعل|تشعل|أشعل|أشعلت|غضب|يثير|تثير|أثار|أثارت|يفجّر جدلاً|تفجّر جدلاً|يفجر جدلا|جدل|جدلا|جدلاً|صفعة|ضربة موجعة|ضربة قاسية|زلزال سياسي|يقلب|تقلب|الطاولة|كابوس|معركة كسر|رسالة إلى|رسائل إلى|بالتفاصيل|خفايا|كواليس|تقرير|دراسة|تحقيق صحفي|صحيفة|صحف|مقال|افتتاحية|غامض|غامضة|مثير|مثيرة|صادم|صادمة|مفاجأة|مفاجئة|مفاجئ|لن تصدق|يكشف سر|تكشف سر|كواليس|رسالة من|رسالة جديدة|تغريدة|منشور|يعلق على|تعلق على|يرد على|ترد على|تركي آل الشيخ|آل الشيخ|هيئة الترفيه|موسم الرياض/u;
const VAGUE = /^(?:هذا|هذه|هكذا|إليك|اليكم|إليكم|تعرف|تعرّف|ما الذي|ماذا|من هو|من هي|كيف|لماذا|هل)(?!\p{L})|…|\.\.\.|تعرف على|تعرّف على|السبب وراء|سر |أسرار|بالتفاصيل|التفاصيل الكاملة|ما حدث|ما جرى|مسارات|سيناريوهات|سيناريو|قراءة في|تحليل|ما بعد|ماذا بعد|أبعاد|دلالات|رسائل|حسابات|خيارات|تداعيات|مستقبل|إلى أين|الى أين|بين التصعيد|التصعيد والتهدئة|ملف |حدود |معادلة|لعبة |ما قاله|ما قالته|في ظروف|حقيقة /u;
const TG_SPORT = /رياض[ةي]|الرياضة|مباراة|المباراة|مباريات|كأس|منتخب|فيفا|الفيفا|يويفا|(?<!\p{L})(?:ال)?(?:دوري|نادي|أندية|مدرب|مدربة|لاعب|لاعبة|لاعبون|لاعبين|هدف|أهداف|ملعب|الملعب|حكم المباراة|ركلة|بطولة|بطل العالم|نهائي|ميدالية|ميداليات)(?!\p{L})|كرة القدم|كرة السلة|كرة اليد|كرة الطائرة|التنس|الأولمبي|الأولمبية|أولمبياد|فورمولا|سباق|رالي|ملاكمة|المصارعة|الجودو|السباحة|ألعاب القوى|ماراثون|ريال مدريد|برشلونة|ليفربول|مانشستر|بايرن|يوفنتوس|باريس سان جيرمان|الزمالك|النادي الأهلي|ميسي|رونالدو|صلاح|انتقالات|سوق الانتقالات|الاتحاد اللبناني لكرة|الاتحاد الدولي لكرة/u;
const publishable = (t, src) => { if (TG_SPORT.test(t)) return false; const w = t.split(/\s+/).filter(x => /\p{L}{2,}/u.test(x)); return w.length >= 5 && t.replace(/[^\p{L}]/gu, "").length >= 22 && !JUNK.test(t) && !BAIT.test(t) && !VAGUE.test(t); };
let data = { items: [], used: {} };
try { data = await channelItems(now, FRESH_MIN); } catch (e) { console.error("channels failed:", e.message); }
console.log("breaking channels in use:", JSON.stringify(data.used), "| fresh posts:", data.items.length);
for (const it of data.items) if (publishable(it.text, it.src)) cand.push({ text: it.text, ts: it.ts, man: 0, leb: it.leb, off: isOfficial(it.src, it.text, "") ? 1 : 0 });
cand.sort((a, b) => (b.man - a.man) || ((b.leb || 0) - (a.leb || 0)) || (b.ts - a.ts));   /* manual first, then Lebanon, then newest */

let sent = 0;
for (const c of cand) {
  const k = norm(c.text);
  if (!k || st.keys.includes(k)) continue;
  if (st.texts.some(x => x.off === c.off && similar(x.text, c.text))) { st.keys.push(k); continue; }   /* same story already sent (same class: official / report) */
  if (!st.seeded || !st.ch) { st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); continue; }
  if (sent >= MAX_PER_RUN || st.times.length >= MAX_PER_HOUR) break;
  if (await send("🔴 <b>عاجل |</b> " + c.text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200d\u20e3]+/gu, " ").replace(/\s+/g, " ").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))) { sent++; st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); st.times.push(Date.now()); await sleep(2000); }
}
if (!st.seeded || !st.ch) console.log("first run: recorded " + st.keys.length + " current items without posting");
st.seeded = true; st.ch = true; st.keys = st.keys.slice(-400); st.texts = st.texts.slice(-80);
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st));
console.log("sent " + sent + " message(s)");

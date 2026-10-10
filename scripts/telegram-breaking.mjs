/* Sends the site's breaking news to the Telegram channel, automatically (GitHub Actions, every 5 minutes).
   Needs two repository secrets: TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the channel, e.g. @your_channel).
   What is sent: the owner's manual breaking items (data/site.json) and every bar item except sports, Lebanese ones first; never the same story twice
   (same one-source rule as the site's bar), at most MAX_PER_RUN per run and MAX_PER_HOUR per hour.
   Memory between runs is a tiny JSON file kept in the Actions cache (.tg-state/sent.json). The first run only records what is
   already on the bar (nothing is posted), so the channel is not flooded. TG_TEST=1 sends one test message; TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";
import { build, similar } from "../functions/api/ticker.js";

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
let data = { items: [] };
try { data = await build(); } catch (e) { console.error("ticker build failed:", e.message); }
/* the channel is public: automatic items pass a stricter gate than the site bar — a real headline (6+ words, 30+ letters),
   never a site name / tagline / section title */
const JUNK = /^(?:(?:أحدث|احدث|آخر|اخر|أهم|اهم|أبرز|ابرز|جديد|كل|متابعة|تغطية|موجز|نشرة|ملخص|عناوين|تحديثات|مباشر)(?!\p{L})|(?:ال)?أخبار(?!\p{L}))|أخبار\s+\S+\s+والعالم|لحظة بلحظة|على مدار الساعة|الموقع الرسمي|اشترك|تابعونا|حمّل التطبيق|حمل التطبيق|المزيد|اقرأ أيضا|اقرأ أيضاً/u;
/* clickbait and celebrity/entertainment figures are never breaking news on the channel */
const BAIT = /غامض|غامضة|مثير|مثيرة|صادم|صادمة|مفاجأة|مفاجئة|مفاجئ|لن تصدق|يكشف سر|تكشف سر|كواليس|رسالة من|رسالة جديدة|تغريدة|منشور|يعلق على|تعلق على|يرد على|ترد على|تركي آل الشيخ|آل الشيخ|هيئة الترفيه|موسم الرياض/u;
/* «كل خبر ليس واضحاً لا أريده»: a channel item must say who did what — a concrete event word — and must not be vague,
   teaser-style or from a broad aggregated feed (Egyptian portals, the open regional search) */
const TG_SKIP_SRC = new Set(["egypt", "region_topic"]);
const CLEAR = /غار[ةا]|قصف|استهداف|استهدف|يستهدف|انفجار|تفجير|نسف|اغتيال|مقتل|قتلى|قتيل|شهيد|شهداء|جريح|جرحى|إصاب|اشتباك|هجوم|صاروخ|صواريخ|مسيّر|مسير|اعتراض|إنذار|صفارات|توغل|اقتحام|اعتقال|اعتقل|أسر |يعلن|أعلن|تعلن|أعلنت|بيان|يستقبل|استقبل|تستقبل|يلتقي|التقى|تلتقي|اجتماع|يجتمع|زيارة|يزور|زار|قرار|يقرر|قرر|يقر|أقر|أقرّ|مرسوم|انتخاب|استقال|توقيع|وقّع|وقع على|اتفاق|مفاوضات|محادثات|عقوبات|يدين|أدان|تدين|يحذر|حذر|حذّر|يطالب|طالب|دعا|يدعو|تدعو|وصل|يصل|غادر|تعيين|عيّن|يعين|تشكيل|جلسة|قمة|اتصالا?\s*هاتفي|يؤكد|أكد|أكّد|تؤكد|ينفي|نفى|تنفي|ارتفاع|انخفاض|يرتفع|ينخفض|تراجع|سعر|أسعار|الدولار|النفط|الذهب|البورصة|مصرف|فائدة|تضخم|موازنة|إغلاق|يغلق|فتح|إخلاء|نزوح|حريق|زلزال|وفاة|توفي|رحيل/u;
const VAGUE = /^(?:هذا|هذه|هكذا|إليك|اليكم|إليكم|تعرف|تعرّف|ما الذي|ماذا|من هو|من هي|كيف|لماذا|هل)(?!\p{L})|…|\.\.\.|تعرف على|تعرّف على|السبب وراء|سر |أسرار|بالتفاصيل|التفاصيل الكاملة|ما حدث|ما جرى|ما قاله|ما قالته|في ظروف|حقيقة /u;
const publishable = (t, src) => { if (TG_SKIP_SRC.has(src)) return false; const w = t.split(/\s+/).filter(x => /\p{L}{2,}/u.test(x)); return w.length >= 6 && t.replace(/[^\p{L}]/gu, "").length >= 30 && !JUNK.test(t) && !BAIT.test(t) && !VAGUE.test(t) && CLEAR.test(t); };
for (const it of data.items) if (now - it.ts <= FRESH_MIN * 60000 && it.cat !== "sports" && publishable(it.text, it.src)) cand.push({ text: it.text, ts: it.ts, man: 0, leb: it.pri ? 1 : 0, off: it.off ? 1 : 0 });
cand.sort((a, b) => (b.man - a.man) || ((b.leb || 0) - (a.leb || 0)) || (b.ts - a.ts));   /* manual first, then Lebanon, then newest */

let sent = 0;
for (const c of cand) {
  const k = norm(c.text);
  if (!k || st.keys.includes(k)) continue;
  if (st.texts.some(x => x.off === c.off && similar(x.text, c.text))) { st.keys.push(k); continue; }   /* same story already sent (same class: official / report) */
  if (!st.seeded) { st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); continue; }
  if (sent >= MAX_PER_RUN || st.times.length >= MAX_PER_HOUR) break;
  if (await send("🔴 <b>عاجل |</b> " + c.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))) { sent++; st.keys.push(k); st.texts.push({ text: c.text, off: c.off, t: now }); st.times.push(Date.now()); await sleep(1200); }
}
if (!st.seeded) console.log("first run: recorded " + st.keys.length + " current items without posting");
st.seeded = true; st.keys = st.keys.slice(-400); st.texts = st.texts.slice(-80);
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st));
console.log("sent " + sent + " message(s)");

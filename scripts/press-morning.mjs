/* Every day at 08:00 Beirut: the Lebanese newspapers' headlines, as one message on the Telegram channel.
   Source: the morning press review the Lebanese news channels post on Telegram (each paper's front-page headline, word for word). TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", CHAT = process.env.TELEGRAM_CHAT_ID || "", DRY = !!process.env.TG_DRY;
const STATE = path.join(".press-state", "sent.json");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", Accept: "application/xml,text/xml,*/*", "Accept-Language": "ar" };
const PAPERS = ["النهار", "الأخبار", "نداء الوطن", "الجمهورية", "اللواء", "البناء", "الديار", "الشرق", "الأنباء", "الأنوار", "المدن", "النداء", "البيرق", "الشرق الأوسط"];
const RX = new RegExp("^(?:[«\"“]\\s*)?(" + PAPERS.join("|") + ")(?:\\s*[»\"”])?\\s*[:：]\\s*(.{12,})$", "u");
const note = m => { console.log(m); if (process.env.GITHUB_ACTIONS) console.log("::notice title=press::" + m.replace(/\n/g, " ")); };

const beirut = new Date(Date.now() + 3 * 3600000), day = beirut.toISOString().slice(0, 10);
let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) {}
if (st.day === day && !DRY) { note("already sent today"); process.exit(0); }

/* wait for 08:00 Beirut (GitHub may start the job a little early or late) */
const target = Date.parse(day + "T05:00:00Z");
if (!DRY && Date.now() < target) await new Promise(r => setTimeout(r, Math.min(target - Date.now(), 25 * 60000)));

/* the real front-page headlines (المانشيت): Lebanese news channels post a morning press review every day, one line per paper
   («النهار: …»، «• الأخبار | …»). Read the owner's channels, take today's post that names the most papers, keep each line
   word for word. No guessing: a paper missing from the review is left out, and fewer than 3 papers means nothing is sent. */
const CH = ["lebanonNewsNow", "lebanondebate", "LBCI_NEWS", "ALJADEED_NEWS", "MTVLebanonNews", "alakhbar_news", "bintjbeilnews", "almayadeen", "AjaNews", "Alarabiya", "AlarabyTelevision", "ksanewstoday", "alarabemergency", "roseaalym", "QudsN", "almamlakatvbreaking"];
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rlm: "", lrm: "" };
const dec = x => x.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? " "));
const LINE = new RegExp("^[\\p{Extended_Pictographic}\\uFE0F\\u200d\\s•▪◾●○*\\-–—·\\d.)]*(?:(?:مانشيت|عنوان|عناوين|عنونت|كتبت|صحيفة|جريدة)\\s+)?[«\"“*]*(" + PAPERS.join("|") + ")[»\"”*]*\\s*(?:[:：|\\-–—]|عنونت|كتبت)\\s*(.{10,})$", "u");
const startOfDay = Date.parse(day + "T00:00:00Z") - 3 * 3600000 + 4 * 3600000;   /* 04:00 Beirut */
let best = {}, from = "";
for (const name of CH) {
  let h = "";
  try { const r = await fetch(`https://t.me/s/${name}`, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ar" }, signal: AbortSignal.timeout(15000) }); if (r.ok) h = await r.text(); } catch (e) {}
  for (const m of h.matchAll(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g)) {
    const blk = m[0], tm = blk.match(/<time[^>]*datetime="([^"]+)"/), body = blk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!tm || !body || Date.parse(tm[1]) < startOfDay) continue;
    const txt = dec(dec(body[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")));
    const got = {};
    for (const raw of txt.split(/\n+/)) {
      const x = raw.replace(/https?:\/\/\S+|@\w+|#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/g, " ").trim();
      const mm = x.match(LINE); if (!mm || got[mm[1]]) continue;
      const head = mm[2].replace(/^[«"“\s]+|[»"”\s.]+$/g, "").replace(/[\p{Extended_Pictographic}️‍]+/gu, " ").replace(/\s+/g, " ").trim();
      if (head.length >= 10) got[mm[1]] = head;
    }
    if (Object.keys(got).length > Object.keys(best).length) { best = got; from = name; }
  }
}
note(`press review source: ${from || "none"}`);
/* fixed layout, the same every morning, so readers know it at a glance:
     صحف لبنان | الأحد 11 تشرين الأول 2026
     ▪ النهار: «…»
     ▪ الأخبار: «…»
     ———
     نبضة | جولة الصحف الصباحية */
const esc = x => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lines = PAPERS.filter(p => best[p]).map(p => `▪ <b>${p}:</b> «${esc(best[p])}»`);
note(`papers found ${lines.length}: ${Object.keys(best).join("، ")}`);
if (lines.length < 3) { note("too few newspaper headlines yet; nothing sent"); process.exit(0); }
const dateAr = new Intl.DateTimeFormat("ar-LB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Beirut" }).format(new Date()).replace(/،/g, "");
const text = `🗞 <b>صحف لبنان |</b> ${dateAr}\n\n` + lines.join("\n\n") + `\n\n———\n<i>نبضة | جولة الصحف الصباحية</i>`;
if (DRY) { console.log(text); for (const l of lines) note(l.replace(/<[^>]+>/g, "")); process.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }) });
const j = await r.json().catch(() => ({}));
if (!j.ok) { note("Telegram error " + r.status + " " + (j.description || "")); process.exit(1); }
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ day }));
note("sent " + lines.length + " papers");

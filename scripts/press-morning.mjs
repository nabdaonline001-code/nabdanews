/* Every day at 08:00 Beirut: the Lebanese newspapers' headlines, as one message on the Telegram channel.
   Source: each paper's own overnight stories via Google News (the National News Agency refuses automated readers).
   The lines pass through the site's wording rules (loadedWords / houseNames / tidy). TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";
import { loadedWords, houseNames, tidy, parseFeed } from "../functions/api/ticker.js";

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

/* each paper's own stories from the last night, via Google News (NNA refuses automated readers);
   per paper: its first story published since 22:00 Beirut — the overnight edition's lead — written in Nabda's words */
const SITES = { "النهار": "annahar.com", "الأخبار": "al-akhbar.com", "نداء الوطن": "nidaalwatan.com", "الجمهورية": "aljoumhouria.com", "اللواء": "aliwaa.com.lb", "البناء": "al-binaa.com", "الديار": "addiyar.com", "الشرق": "alsharqonline.com", "الأنباء": "anbaaonline.com" };
const since = Date.parse(day + "T00:00:00Z") - 3 * 3600000 - 2 * 3600000;   /* 22:00 Beirut, the night before */
const best = {};
await Promise.all(Object.entries(SITES).map(async ([paper, site]) => {
  try {
    const u = `https://news.google.com/rss/search?q=${encodeURIComponent("site:" + site + " when:1d")}&hl=ar&gl=LB&ceid=LB:ar`;
    const xml = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) })).text();
    const its = parseFeed(xml).map(i => ({ title: i.title.replace(/\s+-\s+[^-]{2,40}$/, "").trim(), ts: i.ts })).filter(i => i.ts >= since && i.title.length >= 15 && !/^(?:رأي|مقال|كاريكاتير|افتتاحية)/.test(i.title)).sort((a, b) => a.ts - b.ts);
    if (!its.length) return;
    let line = houseNames(tidy(loadedWords(its[0].title)));
    if (line.length > 160) line = line.slice(0, line.lastIndexOf(" ", 157)) + "…";
    if (line.length >= 12) best[paper] = line;
  } catch (e) {}
}));
const lines = PAPERS.filter(p => best[p]).map(p => `<b>${p}:</b> ${best[p].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`);
note(`papers found ${lines.length}: ${Object.keys(best).join("، ")}`);
if (lines.length < 3) { note("too few newspaper headlines yet; nothing sent"); process.exit(0); }

const dateAr = new Intl.DateTimeFormat("ar-LB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Beirut" }).format(new Date());
const text = `<b>عناوين الصحف اللبنانية |</b> ${dateAr}\n\n` + lines.join("\n\n");
if (DRY) { console.log(text); process.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }) });
const j = await r.json().catch(() => ({}));
if (!j.ok) { note("Telegram error " + r.status + " " + (j.description || "")); process.exit(1); }
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ day }));
note("sent " + lines.length + " papers");

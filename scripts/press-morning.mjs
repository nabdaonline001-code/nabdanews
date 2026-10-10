/* Every day at 08:00 Beirut: the Lebanese newspapers' headlines, as one message on the Telegram channel.
   Source: the National News Agency, which publishes each paper's lead story every morning («النهار: …», «الأخبار: …»).
   The lines pass through the site's wording rules (loadedWords / houseNames / tidy). TG_DRY=1 prints instead of sending. */
import fs from "node:fs";
import path from "node:path";
import { parseNnaDay, loadedWords, houseNames, tidy } from "../functions/api/ticker.js";

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

const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(u + " " + r.status); return r.text(); };
const idx = await get("https://nna-leb.gov.lb/ar/sitemap/news.xml");
const cats = [...idx.matchAll(/\/sitemap\/cat\/(\d+)<\/loc>/g)].map(m => m[1]);
const items = [];
await Promise.all(cats.map(async c => { try { items.push(...parseNnaDay(await get(`https://nna-leb.gov.lb/ar/sitemap/n/${c}?date=${day}`))); } catch (e) {} }));

/* one headline per paper (its earliest one today = the morning press review), in a fixed order */
const best = {};
for (const it of items.sort((a, b) => a.ts - b.ts)) {
  const m = it.title.match(RX); if (!m) continue;
  const paper = m[1]; if (best[paper]) continue;
  let line = houseNames(tidy(loadedWords(m[2].replace(/\s+/g, " ").trim())));
  if (line.length > 160) line = line.slice(0, line.lastIndexOf(" ", 157)) + "…";
  if (line.length >= 12) best[paper] = line;
}
const lines = PAPERS.filter(p => best[p]).map(p => `<b>${p}:</b> ${best[p].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`);
note(`NNA sections ${cats.length}, items today ${items.length}, papers found ${lines.length}`);
if (lines.length < 3) { note("too few newspaper headlines yet; nothing sent"); process.exit(0); }

const dateAr = new Intl.DateTimeFormat("ar-LB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Beirut" }).format(new Date());
const text = `<b>عناوين الصحف اللبنانية |</b> ${dateAr}\n\n` + lines.join("\n\n");
if (DRY) { console.log(text); process.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }) });
const j = await r.json().catch(() => ({}));
if (!j.ok) { note("Telegram error " + r.status + " " + (j.description || "")); process.exit(1); }
fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ day }));
note("sent " + lines.length + " papers");

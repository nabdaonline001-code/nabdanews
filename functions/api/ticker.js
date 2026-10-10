/* Automatic breaking-news ticker: reads each channel's RSS (or Google News RSS for sites without one), applies the
   house rules (word policy, no questions / "watch the video" teasers / petty crime), keeps only recent items (60 min,
   widened up to 4 h when the news is quiet), and is edge-cached for 5 minutes. Public, read-only. */
import { isLebName } from "./_leb.js";
import { beirutDay } from "./_stats.js";
const BROWSER = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/rss+xml,application/xml,text/xml,*/*", "Accept-Language": "ar,en;q=0.8" };
const bing = site => `https://www.bing.com/news/search?q=${encodeURIComponent("site:" + site)}&format=rss&setlang=ar&qft=sortbydate%3D%221%22`;
const gnews = site => `https://news.google.com/rss/search?q=site:${site}+when:2d&hl=ar&gl=LB&ceid=LB:ar`;
/* topic searches (any outlet): catch the big stories no single channel feed carries in time */
const gq = (q, when = "6h") => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:" + when)}&hl=ar&gl=LB&ceid=LB:ar`;
const bq = q => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=ar&qft=sortbydate%3D%221%22`;
/* publishers never used for topic searches (not news outlets); Israeli outlets are allowed: their events and the army's statements are news */
const BLOCKPUB = /ويكيبيديا|(?<![A-Za-z])X(?![A-Za-z])|Facebook|فيسبوك|YouTube|يوتيوب|Telegram|تيليغرام/iu;
/* Israeli sources: the event and the army's statement are taken, not the loaded vocabulary (as with the Sanaa-side sources) */
const ISR_LOADED = /مخرب|إرهاب|ارهاب|يهودا والسامرة|الكيان|ما يسمى|المعادي|الأعداء/;
const gnewsAny = sites => `https://news.google.com/rss/search?q=${encodeURIComponent("(" + sites.map(x => "site:" + x).join(" OR ") + ") when:2d")}&hl=ar&gl=LB&ceid=LB:ar`;
/* Pages Functions allow ~50 subrequests per call: count every fetch and refuse beyond the limit (first tries always
   go out before any fallback, so fallbacks are what gets dropped when many feeds are down) */
let used = 0;
const LIMIT = 46;
const tf = (u, o) => (++used > LIMIT ? Promise.reject(new Error("budget")) : fetch(u, o));
/* Sanaa-side (Houthi) outlets: the news is taken from them but their loaded vocabulary is not (no "Saudi aggression",
   "aggression coalition", "mercenaries", "Zionist entity"…); a headline that still carries such a word is dropped */
export const houthiFix = t => {
  t = t.replace(/(?:ال)?تحالف\s+(?:ال)?عدوان(?:\s+(?:ال)?(?:سعودي|أمريكي|امريكي|إسرائيلي|بريطاني)){0,3}/g, "التحالف");
  t = t.replace(/(?:ال)?عدوان\s+(?:ال)?(?:أمريكي\s+(?:ال)?)?سعودي(?:\s+(?:ال)?(?:أمريكي|امريكي))?/g, "السعودية");
  t = t.replace(/للكيان\s+(?:ال)?صهيوني/g, "لإسرائيل").replace(/([وبف]?)(?:ال)?كيان\s+(?:ال)?صهيوني/g, "$1إسرائيل");
  t = t.replace(/(?:ال)?صهيوني(?:ة)?/g, m => /ة$/.test(m) ? "الإسرائيلية" : "الإسرائيلي").replace(/(?:ال)?عدو\s+(?=(?:ال)?إسرائيل)/g, "");
  return /عدوان|مرتزق|الغزاة|عملاء|خونة|الخونة|الأعداء|(?<!\p{L})(?:لل|ال|ب|ل|و)?عدو(?!\p{L})/u.test(t) ? "" : t;
};
/* `agency`: official news agencies are named in front of their headlines («سانا: …»); every other outlet is never named.
   `cap`: most headlines taken from this source (several sites share one query in the grouped sources) */
export const SOURCES = [
  { id: "jazeera", urls: ["https://www.aljazeera.net/rss"], skipLink: /\/(opinions|lifestyle|blogs|culture|features|health|programs)\// },
  { id: "jazeera_sport", sport: true, html: { url: "https://www.aljazeera.net/sport", parse: (h, now) => parseJazeeraSport(h, now) }, urls: [] },
  { id: "jadeed", urls: ["https://www.aljadeed.tv/Rss/latest-news/ar"] },
  { id: "lbci", urls: ["https://www.lbcgroup.tv/Rss/latest-news/ar"] },
  { id: "annahar", urls: ["https://www.annahar.com/rss"], skipLink: /\/(articles|opinion|opinions|lifestyle|style|entertainment|people|fun|tech|technology|health|culture|cinema|tv|stars|fashion|food|travel|cars|science|women|society|blogs)\//i },
  { id: "mtv", html: { url: "https://www.mtv.com.lb/", parse: (h, now) => parseMtv(h, now) }, urls: [bing("mtv.com.lb"), gnews("mtv.com.lb")] },
  { id: "hadath", html: { url: "https://www.alhadath.net/", parse: (h, now) => parseHadath(h, now) }, urls: ["https://www.alarabiya.net/feed/rss2/ar/last-page.xml", bing("alhadath.net")] },
  { id: "nna", custom: now => fetchNna(now), urls: [] },
  { id: "nbn", urls: [bing("nbn.com.lb"), gnews("nbn.com.lb")] },
  { id: "france24", urls: ["https://www.france24.com/ar/rss", gnews("france24.com/ar"), bing("france24.com/ar")], skipLink: /\/(culture|sport|video|tv-shows|programmes|reportage|magazine)\//i },
  { id: "alaraby", urls: ["https://www.alaraby.com/rss", gnews("alaraby.com")], skipLink: /\/(opinion|culture|lifestyle|sport|programs|tv-guide)\//i },
  { id: "axiosar", urls: ["https://www.axiosar.com/feed", "https://axiosar.com/feed/", gnews("axiosar.com"), bing("axiosar.com")] },
  { id: "shams", custom: () => fetchYouTube("@Shamsnewstv"), urls: [], fix: t => t.replace(/\s*[|｜]\s*(?:قناة\s*)?شمس.*$/i, "").replace(/#\S+/g, "").trim() },
  { id: "skynews", urls: [gnews("skynewsarabia.com"), bing("skynewsarabia.com")], skipLink: /\/(varieties|lifestyle|sport|video|programs)\//i },
  { id: "mayadeen_alalam", cap: 8, urls: [gnewsAny(["almayadeen.net", "alalam.ir", "almanar.com.lb"]), bing("almayadeen.net")] },
  { id: "rt", urls: ["https://arabic.rt.com/rss/", gnews("arabic.rt.com")] },
  { id: "asharq", urls: [gnewsAny(["asharq.com", "bbc.com/arabic"])] },
  { id: "ikhbariya_sumaria", cap: 8, urls: [gnewsAny(["alikhbariah.com", "alsumaria.tv"])] },
  { id: "egypt", cap: 8, urls: [gnewsAny(["youm7.com", "ahram.org.eg"])] },
  { id: "sana", agency: "سانا", lebActivityOnly: true, urls: ["https://sana.sy/feed/", gnews("sana.sy")] },
  { id: "wafa", agency: "وفا", urls: [gnews("wafa.ps")] },
  { id: "suna", agency: "سونا", urls: [gnews("suna-sd.net")] },
  { id: "saba", agency: "سبأ", urls: [gnews("sabanew.net")] },
  { id: "irna", agency: "إرنا", urls: [gnews("ar.irna.ir")] },
  { id: "masirah", cap: 6, fix: houthiFix, urls: [gnews("almasirah.net.ye"), bing("almasirah.net.ye")] },
  { id: "saba_sanaa", agency: "سبأ (صنعاء)", cap: 5, fix: houthiFix, urls: [gnews("saba.ye"), bing("saba.ye")] },
  { id: "econ_ar", cap: 6, urls: [gnewsAny(["cnbcarabia.com", "asharqbusiness.com"])] },
  { id: "leb_topic", topic: true, cap: 10, urls: [gq('("جنوب لبنان" OR "الجنوب اللبناني" OR "الضاحية الجنوبية" OR "حزب الله" OR "اليونيفيل" OR "الجيش اللبناني" OR "البقاع")'), bq("جنوب لبنان")] },
  { id: "leb_sec", topic: true, cap: 8, urls: [gq('لبنان (غارة OR صاروخ OR مسيّرة OR "صفارات الإنذار" OR "القبة الحديدية" OR "صاروخ اعتراضي" OR قصف)', "3h"), bq("لبنان صاروخ اعتراضي غارة")] },
  { id: "idf", topic: true, cap: 8, skipText: ISR_LOADED, urls: [gq('("الجيش الإسرائيلي" OR "المتحدث باسم الجيش الإسرائيلي" OR "أدرعي" OR "سلاح الجو الإسرائيلي") (يعلن OR أعلن OR بيان OR اعتراض OR "ينذر" OR "إنذار")', "3h"), bq("الجيش الإسرائيلي يعلن")] },
  { id: "israel_media", topic: true, cap: 6, skipText: ISR_LOADED, urls: [gnewsAny(["i24news.tv/ar", "makan.org.il"])] },
  { id: "maritime", topic: true, cap: 6, fix: t => t.replace(/^UKMTO\s*[:：\-–]\s*/i, "هيئة عمليات التجارة البحرية البريطانية: ").replace(/\s*\(?UKMTO\)?/gi, "").trim(), urls: [gq('("هيئة عمليات التجارة البحرية" OR UKMTO OR "التجارة البحرية البريطانية")', "6h"), bq("هيئة عمليات التجارة البحرية البريطانية")] },
  { id: "region_topic", topic: true, cap: 8, urls: [gq('(إسرائيل OR غزة OR إيران OR سوريا OR اليمن OR العراق) (عاجل OR "وقف إطلاق النار" OR هجوم OR غارة)', "3h")] },
  { id: "sport_ar", sport: true, cap: 8, urls: [gnewsAny(["beinsports.com/ar", "arabia.sport360.com", "filgoal.com"])] }
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
  if (!out.length) { /* Atom (e.g. YouTube channel feeds) */
    for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
      const b = m[0], lm = b.match(/<link[^>]*href="([^"]+)"/i);
      const title = tag(b, "title"), ts = Date.parse(tag(b, "published") || tag(b, "updated"));
      if (title && isFinite(ts)) out.push({ title, link: lm ? decode(lm[1]) : "", ts });
    }
  }
  return out;
}

/* ---------- house rules ---------- */
const MEDIA = /بالفيديو|بالصور|بالصورة|(?<!\p{L})صورة(?!\p{L})|(?<!\p{L})فيديو(?!\p{L})|شاهد|شاهدوا|إليكم|تفاصيل|تابعوا|\(صور|لقطات|بالأرقام/u;
const SOFT = /\.{2,}|…|عُثر عليه جثة|عثر عليه جثة|عارضة أزياء|ظهور مفاجئ|يعترف|مسلسل|فيلم|الفنانة|الفنان|نجمة|نجوم|هوليوود|عرض أزياء|رحلة الحب|زواج|(?<![إا])طلاق|مخدّرات|مخدرات|مروّج|مروجي|مداهمات|تاجر أسلحة|أسرار الصحف|مقدمات نشرات|عناوين الصحف|الصحف الصادرة|حفل تكريم|أقامت حفل|احتفلت|التحكم المروري|سرعة المشي|ترتبط بانخفاض|ترتبط بارتفاع|دراسة جديدة|حادثي سير|حادث سير|جرحى في حادث|شكراً لكل معلم|شكرا لكل معلم|يوم المعلم|هكذا|أولى لحظات|تتحدث عن|تتحدّث عن|التنمر|يُهدّد البشر|يهدد البشر|وهب الأعضاء|لكلّ محاربة|لكل محاربة|لستِ وحدكِ|لست وحدك|كارداشيان|مربيات|مربية|فاميلي|يحققان حلمهما|عرض حي|حفل زفاف|حفلة|يثير الجدل|تبكي|على المسرح|خلال تكريمها|خلال تكريمه|عساف|منى واصف|ملحم زين|ثناء|غنائه|غنائها|أغنيته|أغنيتها|مقدمة النشرة|مقدمة نشرة|ستالون|الأوسكار|بالطول والعرض|مراسلون :|إيقاق العالم|إيقاع العالم|كشاشي|تكريمات عالمية|بحاجة ماسّة|بحاجة ماسة|وحدات دم|حلقة اليوم|أبرز محطات حلقة|شمس الصباح|Avengers|Avatar|Endgame|شباك التذاكر|إيرادات الأفلام|مباشر مع|نافذة|الجزء الثاني|الجزء الأول|حلقة|بودكاست/;
/* entertainment / celebrity / lifestyle / obituary-of-a-writer: never breaking news */
const SHOWBIZ = /(?<!\p{L})(?:مغنّ?ي|مغنية|مطرب|مطربة|ممثل|ممثلة|ألبوم|أغنية|أغنيتها|أغنيته|كليب|إطلالة|تتألق|مهرجان|غرامي|ملكة جمال|موضة|رشاقة|ريجيم|حمية|أبراج|حظك|عيد ميلاد|خطوبة|خطبتها|يكشف سر|تكشف سر|مفاجأة صادمة|يثير الجدل|تثير الجدل|بالصور|وفاة الكاتب|وفاة الفنان|وفاة الفنانة|وفاة الممثل|وفاة المغني)(?!\p{L})/u;
const TAGLINE = /^(?:(?:أحدث|احدث|آخر|اخر|أهم|اهم|أبرز|ابرز|جديد|كل|متابعة|تغطية|موجز|نشرة|ملخص)\s+(?:ال)?أخبار|أخبار\s+\S+\s+والعالم|(?:ال)?أخبار\s+(?:العاجلة|اليوم|لحظة بلحظة))|(?:لحظة بلحظة|على مدار الساعة|الموقع الرسمي|الصفحة الرئيسية)\s*$/u;
const MINOR = /بالجرم المشهود|سرقة|سارق|سطو|مشاجرة|إشكال|حادث سير|حادث سيارة|ضبطت قوى الأمن|ضبط مخدرات|ضبط كمية|توقيف شخص|توقيف مطلوب|نصائح|فوائد|وصفة|حظك|برجك|الطقس|حالة الطقس/;
const LEB = /لبنان|اللبناني|الجنوب|بنت جبيل|النبطية|مرجعيون|حاصبيا|الضاحية|البقاع|بعلبك|الهرمل|ميفدون|الخيام|الناقورة|مارون الراس|عيتا|كفرشوبا|شبعا|عيترون|الطيبة|الليطاني|صيدا|(?<!\p{L})صور(?!\p{L})/u;
const ECON = /اقتصاد|الاقتصاد|البورصة|بورصة|الأسهم|الدولار|الليرة|مصرف|المصارف|البنك|بنك|النفط|برنت|الذهب|الفضة|الأسعار|التضخم|الموازنة|الضريبة|صندوق النقد|الصادرات|الواردات|الفائدة|المحروقات|البنزين|المازوت|الودائع|سندات|ناتج محلي|عملة/;
const SPORT = /رياضة|فورمولا|جائزة سنغافورة|جائزة .{1,20} الكبرى|بوتاس|الرياضة|مباراة|المباراة|كأس|منتخب|الفيفا|(?<!\p{L})(?:ال)?(?:دوري|نادي|أندية|مدرب|لاعب(?:ون|ين|ة)?)(?!\p{L})|(?<!\p{L})(?:سجّ?ل|يسجّ?ل|سجّ?لت|تسجّ?ل|أحرز|أحرزت)\s+(?:هدف|هدفا|هدفاً|هدفين|أهداف|ثلاثية)(?!\p{L})|بطولة|كرة القدم|كرة السلة|ريال مدريد|برشلونة|رونالدو|ميسي|الأولمبي|التنس|الاتحاد الدولي لكرة/u;
/* allow-list: a headline is kept only when it speaks the language of hard news (politics, security, diplomacy,
   economy, sport results). Anything else is dropped even if no deny-list word matches. */
const NEWS = /نوبل|قتيل|قتيلا|قتيلاً|جريح|جريحا|جريحاً|مصرع|إصابات|التجارة البحرية|الملاحة|سفينة|سفن|ناقلة|ناقلات|رأس الخيمة|غارة|غارات|قصف|هجوم|هجمات|استهداف|استهدف|صاروخ|صواريخ|مسيّرة|مسيرة|طائرة|اشتباك|معارك|معركة|حرب|حروب|هدنة|وقف إطلاق|وقف اطلاق|تصعيد|توتر|جيش|الجيش|قوات|عسكري|عسكرية|قاعدة|دفاع|أمن|امني|أمني|أمنية|مقتل|قتلى|شهداء|شهيد|جرحى|إصابة|حصيلة|ضحايا|انفجار|حريق|اغتيال|اعتقال|اختطاف|احتجاجات|مظاهرات|إضراب|حكومة|الحكومة|وزير|وزارة|رئيس|رئاسة|رئيسا|رئيساً|نائب|النواب|البرلمان|برلمان|مجلس|قمة|مفاوضات|محادثات|اتفاق|اتفاقية|معاهدة|وساطة|عقوبات|حصار|سفير|دبلوماسي|دبلوماسية|الخارجية|الأمم المتحدة|مجلس الأمن|الناتو|الاتحاد الأوروبي|البيت الأبيض|البنتاغون|الكرملين|الكنيست|انتخابات|الانتخابات|استفتاء|دستور|قانون|مرسوم|قرار|قرارات|محكمة|القضاء|قاض|تحقيق|لجنة|مؤتمر|بيان|تصريح|يحذر|يحذّر|تحذير|يهدد|تهديد|يدعو|دعا|أعلن|تعلن|يعلن|أكد|تؤكد|يؤكد|نفى|ينفي|رفض|يرفض|وافق|توافق|يوافق|إيران|ايران|إسرائيل|اسرائيل|فلسطين|غزة|الضفة|لبنان|سوريا|سورية|العراق|اليمن|الحوثي|الحوثيين|السعودية|الإمارات|قطر|الكويت|البحرين|عُمان|مصر|الأردن|ليبيا|السودان|تونس|الجزائر|المغرب|تركيا|روسيا|أوكرانيا|الصين|أميركا|أمريكا|الولايات المتحدة|واشنطن|ترامب|ترمب|بايدن|نتنياهو|بريطانيا|فرنسا|ألمانيا|أوروبا|أوروبي|حزب الله|حماس|الفصائل|مضيق|هرمز|البحر الأحمر|نووي|النووي|اليونيفيل|الاحتلال|المقاومة|لاجئ|نازح|نزوح|مساعدات|إغاثة|زلزال|فيضانات|عاصفة|كارثة|تضخم|ارتفاع أسعار|انخفاض|تراجع|صفقة|مليار|مليون دولار|ميزانية|موازنة|ضريبة|رسوم|جمارك|تصدير|استيراد|صادرات|واردات|أرباح|خسائر|إفلاس|استثمار|مصرف|بنك|فائدة|احتياطي|ديون|دين عام|عجز|نمو|ركود|طاقة|الكهرباء|غاز|وقود|محروقات|سندات|أسهم|بورصة/;
/* a sport headline counts as "breaking" only when it reports a result, a decision or a move, not a feature or opinion */
const SPORT_HARD = /فوز|يفوز|تفوز|فاز|تغلب|يتغلب|تتغلب|يسحق|تسحق|يهزم|تهزم|هزيمة|خسارة|يخسر|تخسر|تعادل|يتأهل|تتأهل|تأهل|يتوج|تتوج|تتويج|لقب|تعيين|يعين|تعين|إقالة|يقيل|تقيل|استقالة|يستقيل|إنهاء عقد|ينهي عقد|تنهي عقد|تجديد عقد|ينتقل|انتقال|صفقة|يضم|تضم|إصابة|إصابته|يغيب|تغيب|عقوبة|إيقاف|يوقف|توقف|غرامة|يودع|تودع|يتصدر|تتصدر|رسميا|رسميًا|الفيفا|الاتحاد الدولي|الاتحاد الأوروبي|الاتحاد الآسيوي|الاتحاد الأفريقي|قرعة|ترتيب|المتأهلين|ثنائية|ثلاثية|ركلة/;
const SPORT_SOFT = /يتوقع نهاية|يتوقع استقالة|نهاية صادمة|موعد|القنوات الناقلة|القناة الناقلة|بث مباشر|قميص|تختفي|يسخر|تسخر|ذكريات|رسالة تحد|رحلة|يرفض الاعتزال|أكبر حكم|يشعل|تشعل|يعلق على|ترد على|يرد على|فيديو|كواليس|طرائف|أغرب|أجمل|أفضل \d|قائمة المرشحين|المرشحين لجائزة/;
/* reporter attributions are dropped: «مراسل الجديد: …» / «مراسلنا في الجنوب: …» / «… بحسب مراسلنا» / «مراسل X يفيد بـ…» */
const REP = "(?:ال)?مراسل(?:ة|ون|و|نا|تنا)?";
export function noReporter(t) {
  const W = "[^\\s:،]+";
  t = t.replace(new RegExp("^(?:(?:بحسب|وفق|وفقاً ل|حسب|نقلاً عن|نقلا عن)\\s+)?" + REP + "(?:\\s+" + W + "){0,4}\\s*[:،]\\s*", "u"), "");
  t = t.replace(new RegExp("^" + REP + "(?:\\s+" + W + "){0,4}\\s+(?:يفيد|يؤكد|يشير|يقول|يتحدث عن|أفاد|أفادت|تفيد|تؤكد)\\s+(?:ب|عن)?(?:أن\\s+)?", "u"), "");
  t = t.replace(new RegExp("\\s*[،\\-–—]?\\s*(?:بحسب|وفق|وفقاً ل|حسب|نقلاً عن|نقلا عن)\\s+" + REP + "(?:\\s+" + W + "){0,3}\\s*$", "u"), "");
  return t.trim();
}
/* house names: the former Syrian regime is never «البائد» (it is «السابق», unless the phrase is a quotation already between «»), and
   «إسرائيل» is always written between quotes (the name only; «الجيش الإسرائيلي» etc. are untouched). Text already inside «…» is left as it is. */
export function houseNames(t) {
  return t.split(/(«[^»]*»)/).map((seg, i) => i % 2 ? seg : seg
    .replace(/(النظام|نظام|الحكم|حكم)(\s+السوري)?\s+البائد/g, (m, a, b) => a + (b || "") + " السابق")
    .replace(/(?<![\p{L}«])((?:[وبلكف]|وب|ول|فب|فل)?)(إسرائيل|اسرائيل)(?![\p{L}»])/gu, (m, p) => p + "«إسرائيل»")).join("");
}
/* loaded labels are never the site's words, whatever the outlet: «مرتزقة العمالقة» → «قوات العمالقة», «المرتزقة» → «القوات»;
   and a non-official outlet named after a source («مصدر يمني للميادين:») is dropped («مصدر يمني:») */
const OUTLET_NAMES = ["الميادين", "الجزيرة", "العربية", "الحدث", "الجديد", "المنار", "المسيرة", "العالم", "سكاي نيوز عربية", "سكاي نيوز", "روسيا اليوم", "RT", "بي بي سي", "BBC", "الشرق", "النهار", "الأخبار", "المدن", "السومرية", "ام تي في", "MTV", "إل بي سي", "LBCI", "رويترز", "فرانس برس", "سبوتنيك", "تسنيم", "فارس"];
const OUTLET_TO = new RegExp("((?:مصدر|مصادر|مسؤول|مسؤولون|قيادي|متحدث|ناطق)(?:\\s+\\p{L}+){0,5}?)\\s+(?:" +
  OUTLET_NAMES.map(n => n.startsWith("ال") ? "ل" + n.slice(1) : "لـ?\\s*" + n).join("|") + ")(?![\\p{L}])", "u");
const LABEL = (stem) => new RegExp("(^|[^\\p{L}])(و|ف|ب|وب)?(ال|لل|ل)?" + stem + "(?![\\p{L}])", "gu");
export function loadedWords(t) {
  const swap = (m, a, p, art) => a + (p || "") + (art === "ال" ? "القوات" : art === "لل" ? "للقوات" : art === "ل" ? "لقوات" : "قوات");
  t = t.replace(LABEL("مرتزق(?:ة|ون|ين|و)"), swap).replace(LABEL("غزاة"), swap);
  t = t.replace(OUTLET_TO, "$1");
  return t;
}
export function clean(t, link, sportSrc = false) {
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^\d{1,2}:\d{2}\s+/, "");
  t = t.replace(/^[\p{Extended_Pictographic}\uFE0F\s]*(?:خبر\s+)?عاجل(?:ة)?\s*[|:\-–—،]*\s*/u, "");   /* «عاجل | …» is the breaking label, not a programme title */
  // "خاص"/"حصري" items and programme titles (نافذة…, مباشر مع…, "A | B") are not breaking news
  if (/^(خاص|حصري)(?!\p{L})/u.test(t) || /^(نافذة|مباشر مع|حلقة|بودكاست)(?!\p{L})/u.test(t) || /\s\|\s/.test(t)) return null;
  t = t.replace(/^عاجل\s*[|:\-–—]?\s*/, "");
  t = noReporter(t);
  if (!t || /مراسل/.test(t)) return null;   /* the bar carries the news itself, never "our reporter says…" */
  t = t.replace(/(?<!\.)\.\.(?!\.)\s*(?=[^\s.])/g, "، "); /* Al Jazeera style "بعد X.. Y" reads as "بعد X، Y" */
  if (!t || /[؟?]/.test(t) || MEDIA.test(t) || MINOR.test(t) || SOFT.test(t) || SHOWBIZ.test(t)) return null;
  if (TAGLINE.test(t)) return null;   /* a feed's own name/tagline («أحدث أخبار مصر والعالم») is not news */
  if (t.length < 14 || t.length > 190) return null;
  if ((sportSrc || SPORT.test(t)) && SPORT_SOFT.test(t)) return null;
  if (sportSrc ? !SPORT_HARD.test(t) : !(NEWS.test(t) || ECON.test(t) || SPORT.test(t))) return null;
  // word policy
  t = t.replace(/م[ي]?ل[ي]?ش[ي]?ات/g, "فصائل");
  t = t.replace(/(?:ال)?م[ي]?ل[ي]?ش[ي]?ا(?:وي|وية)?\s*/g, "");
  if (!LEB.test(t)) {
    t = t.replace(/(?:ال)?عدو\s+(?=(?:ال)?إسرائيل)/g, "");
    t = t.replace(/العدوان/g, "الهجوم").replace(/عدوان/g, "هجوم");
  }
  t = loadedWords(t);
  t = tidy(t);
  t = houseNames(t);
  if (!t || arWords(t) < 3) return null;
  return t;
}
/* typography and stray-noise clean-up so every headline reads like a newsroom headline */
const NUM_OK_BEFORE = /^(إلى|الى|نحو|حوالي|قرابة|بنسبة|عند|حصيلة|مقتل|إصابة|وفاة|رقم|المرتبة|الجولة|يوم|عام|سنة|دقيقة|ساعة|جولة|الدور|المجموعة|الفئة|ب|ل|من|في|على|بين|و)$/;
export function tidy(t) {
  t = t.replace(/[\u200e\u200f\u202a-\u202e\u00a0]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200d\u20e3]+/gu, " ").replace(/\s+/g, " ").trim();   // no emojis/flags anywhere: the site and channel stay neutral («سياستنا لا تشجع أحداً»)
  t = t.replace(/^[\-–—•·|:؛,،\s]+|[\-–—•·|\s]+$/g, "");                       // stray bullets / dashes at the edges
  t = t.replace(/\s*[|｜]\s*(?:قناة\s*)?(?:الجزيرة|العربية|الحدث|الجديد|إل بي سي|ام تي في|MTV|LBCI|النهار|الوكالة الوطنية للإعلام|سكاي نيوز عربية|الميادين|العالم|RT|روسيا اليوم|الشرق|الشرق للأخبار|الإخبارية السورية|السومرية|اليوم السابع|الأهرام|CNBC عربية|الشرق بلومبرغ|beIN SPORTS|سبورت 360|في الجول|العربي الجديد|فرانس 24)\s*$/u, ""); // source suffix
  t = t.replace(/"([^"]{2,}?)"/g, "«$1»").replace(/“([^”]{2,}?)”/g, "«$1»");    // ASCII / curly quotes → «»
  if (/»/.test(t) && !/«/.test(t.split("»")[0])) t = "«" + t;                  // closing « » quote with a lost opening one
  t = t.replace(/\s+([:،؛.!])/g, "$1").replace(/([:،؛])(?=[^\s\d])/g, "$1 ");   // spacing around punctuation
  t = t.replace(/([.!،:؛])\1+/g, "$1");
  const m = t.match(/^(.*\S)\s+(\d{1,2})$/u);                                 // a stray counter glued to the end ("… لا طائل منه 4")
  if (m) { const prev = m[1].split(" ").pop(); if (!NUM_OK_BEFORE.test(prev) && !/\d/.test(prev) && m[1].length > 30) t = m[1]; }
  t = t.replace(/ترمب/g, "ترامب");                                               // one spelling for the same name
  return t.replace(/\s+/g, " ").trim();
}
const arWords = t => (t.match(/[\u0621-\u064A]{2,}/g) || []).length;
export function catOf(t) { return ECON.test(t) ? "economy" : SPORT.test(t) ? "sports" : "politics"; }
const STOP = new Set("هيئة عمليات التجارة البحرية البريطانية في على من إلى الى عن مع بعد قبل أن ان إن التي الذي هذا هذه ذلك كان كانت يكون بين حول خلال أمام ضد لدى ثم أو او لا لم لن قد كل بعض اليوم بأن بان أكد اكد قال قالت يقول وقال يعلن تعلن اعلن غارة غارات سقوط جرحى جريح قتلى قتيل وزير وزيرة مجلس تسفر عن أمام امام رئيس مصدر مصادر بعد يؤكد تؤكد".split(" "));
const fold = s => s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ترمب/g, "ترامب");
const stem = w => w.replace(/(.)\1+/g, "$1").replace(/^(?:وال|بال|فال|كال|لل|ال|و|ل)(?=.{4})/, "").replace(/(?:ون|ين|ات|ان|ا|ي|ه|ن)$/, "").replace(/(?:ي|ا|ن)$/, "");
const STOPS = new Set([...STOP].map(w => stem(fold(w))));
const words = s => new Set(fold(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).map(stem).filter(w => w.length > 2 && !STOP.has(w) && !STOPS.has(w)));
/* two headlines are "the same story" when they share most of their content words (spelling-insensitive, light stemming).
   Synonyms of the same event word collapse to one concept (قصف/غارة/استهداف, اعتراض, صاروخ, مسيّرة, قتل…) and Israel's names
   collapse to one, so "الجيش الإسرائيلي يعلن اعتراض صاروخ" and "إطلاق صاروخ اعتراضي" match; two different named places never do. */
const CONCEPTS = [[/^(?:غار|قصف|قصفت|استهداف|استهدف|يستهدف|تستهدف|تقصف|يقصف|ضرب|تضرب)/, "c_hit"], [/^(?:اعتراض|اعترض|يعترض|تعترض|معترض)/, "c_ict"], [/^(?:صاروخ|صواريخ)/, "c_rkt"], [/^(?:مسير|درون)/, "c_drn"],
  [/^(?:مقتل|قتل|قتلي|استشهاد|شهيد|شهداء)/, "c_kil"], [/^(?:اسرايل|اسراييل|اسرائيل|الاحتلال|احتلال)/, "c_isr"], [/^(?:ترامب|ترمب)/, "c_trp"], [/^(?:انذار|انذر|ينذر|تحذير|يحذر|اخلاء|اخل)/, "c_wrn"]];
const PLACE = /^(?:خيام|نبطي|مرجعيون|حاصبيا|ضاحي|بقاع|بعلبك|هرمل|ميفدون|ناقور|ماروني?راس|كفرشوبا|شبعا|عيترون|طيب|صيدا|بنت|زوطر|بيروت|طرابلس|زحل|جزين|عكار|قنيطر|حداثا|حاريص|منصور|غز|رفح|خانيونس|جباليا|رام|نابلس|جنين|خليل|دمشق|حلب|حمص|درعا|بغداد|صنعاء|عدن|مارب|حديد|طهران|اصفهان|تبريز|لبنان|لبناني|سوري|عراق|ايران|مصر|اردن|سعود|يمن|ليبيا|سودان|فلسطين|تركيا|روسيا|اوكران|قطر|امارات|كويت|عمان|بحرين)/;
const concept = w => { for (const [re, c] of CONCEPTS) if (re.test(w)) return c; return w; };
export const cwords = s => new Set(fold(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).map(w => w.replace(/^(?:وال|بال|فال|كال|لل|ال)(?=.{3})/, "")).filter(w => w.length > 2)
  .map(w => PLACE.test(w) ? "p_" + w.slice(0, 4) : concept(w.replace(/^(?:و|ب|ل)(?=.{4})/, ""))).filter(w => /^[cp]_/.test(w) || (!STOP.has(w) && !STOPS.has(stem(w)))).map(w => /^[cp]_/.test(w) ? w : stem(w)));
const sameWord = (x, y) => x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 4) === y.slice(0, 4));
/* an official statement (the army, a ministry, a spokesperson, an agency) and a media report of the same event are two different items:
   both are published, and the one-source rule applies only inside each class */
export const OFFICIAL = /^(?:هيئة عمليات التجارة البحرية|الجيش|المتحدث|المتحدثة|أدرعي|أفيخاي|قيادة الجيش|مديرية التوجيه|الدفاع المدني|وزارة|الخارجية|الرئاسة|رئاسة|البيت الأبيض|البنتاغون|الكرملين|حزب الله|سلاح الجو|الصليب الأحمر|الأمم المتحدة|اليونيفيل)/;
export const isOfficial = (src, text, pre) => !!pre || src === "idf" || src === "nna" || src === "maritime" || OFFICIAL.test(text);
export const similar = (a, b) => {
  const A = [...cwords(a)], B = [...cwords(b)];
  const inB = w => B.some(v => sameWord(w, v)), inA = w => A.some(v => sameWord(w, v));
  const i = A.filter(inB).length, m = Math.min(A.length, B.length);
  if (!(m >= 3 && i >= 3 && i / m >= 0.6)) return false;
  const pa = A.filter(w => w.startsWith("p_") && !inB(w)), pb = B.filter(w => w.startsWith("p_") && !inA(w));
  return !(pa.length && pb.length);   /* each names a place the other does not: two different events */
};
const norm = s => fold(s).replace(/^هي[يئ][هة] عمليات التجار[هة] البحري[هة] البريطاني[هة]\s*[:：]\s*/, "").replace(/[^\p{L}\p{N}]/gu, "");

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
// Al Jazeera Sport (الجزيرة الرياضية): article links carry the date (/sport/2026/10/5/slug); the page has no times, so
// today's stories are spread over the last hour in page order and yesterday's sit just before midnight (as for Al Hadath).
export function parseJazeeraSport(html, now = Date.now()) {
  const day = ms => { const d = new Date(ms + 3 * 3600000); return d.getUTCFullYear() + "/" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
  const today = day(now), yest = day(now - 86400000);
  const midnight = Math.floor((now + 3 * 3600000) / 86400000) * 86400000 - 3 * 3600000;
  const best = new Map();
  for (const m of html.matchAll(/<a\b[^>]*?href="(?:https?:\/\/www\.aljazeera\.net)?(\/sport\/(\d{4}\/\d{1,2}\/\d{1,2})\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = decode(m[3]).replace(/^["“”]+|["“”]+$/g, "");
    const cur = best.get(m[1]);
    if (title.length >= 18 && (!cur || title.length > cur.title.length)) best.set(m[1], { title, date: m[2], link: "https://www.aljazeera.net" + m[1] });
  }
  const out = []; let a = 0, b = 0;
  for (const x of best.values()) {
    if (x.date === today) out.push({ title: x.title, link: x.link, ts: now - 60000 * (5 + 4 * a++) });
    else if (x.date === yest) out.push({ title: x.title, link: x.link, ts: midnight - 60000 * (5 + 4 * b++) });
  }
  return out;
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
  const get = async u => { const r = await tf(u, { headers: { ...BROWSER, Accept: "application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(9000) }); if (!r.ok) throw new Error("http-" + r.status); return r.text(); };
  const idx = await get("https://nna-leb.gov.lb/ar/sitemap/news.xml");
  const cats = [...idx.matchAll(/\/sitemap\/cat\/(\d+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].filter(m => now - Date.parse(m[2]) < 30 * 3600000).slice(0, 8).map(m => m[1]);
  const b = new Date(now + 3 * 3600000), day = d => d.toISOString().slice(0, 10);
  const days = [day(b)]; if (b.getUTCHours() < 4) days.push(day(new Date(b.getTime() - 86400000)));
  const out = [];
  await Promise.all(cats.flatMap(c => days.map(async d => { try { out.push(...parseNnaDay(await get(`https://nna-leb.gov.lb/ar/sitemap/n/${c}?date=${d}`))); } catch (e) {} })));
  return out;
}

/* ---------- YouTube channel (sources with no website feed) ---------- */
async function fetchYouTube(handle) {
  const r = await tf("https://www.youtube.com/" + handle, { headers: { ...BROWSER, Accept: "text/html,*/*;q=0.5", Cookie: "CONSENT=YES+1; SOCS=CAI" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("yt-page-" + r.status);
  const h = await r.text();
  const m = h.match(/"externalId":"(UC[\w-]{22})"/) || h.match(/"channelId":"(UC[\w-]{22})"/) || h.match(/channel\/(UC[\w-]{22})/);
  if (!m) throw new Error("yt-no-id");
  const f = await tf("https://www.youtube.com/feeds/videos.xml?channel_id=" + m[1], { headers: BROWSER, signal: AbortSignal.timeout(5000) });
  if (!f.ok) throw new Error("yt-feed-" + f.status);
  return parseFeed(await f.text());
}

/* ---------- fetching ---------- */
async function fetchFeed(src) {
  let last = "no-url";
  if (src.custom) {
    try { const items = await src.custom(Date.now()); if (items.length) return { items, via: "custom" }; last = "custom-empty"; } catch (e) { last = "custom-" + String(e.name || e.message || e); }
  }
  if (src.html) {
    try {
      const r = await tf(src.html.url, { headers: { ...BROWSER, Accept: "text/html,*/*;q=0.5" }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const items = src.html.parse(await r.text(), Date.now()); if (items.length) return { items, via: src.html.url }; last = "html-empty"; } else last = "html-http-" + r.status;
    } catch (e) { last = "html-" + String(e.name || e.message || e); }
  }
  for (const u of src.urls) {
    try {
      const r = await tf(u, { headers: BROWSER, signal: AbortSignal.timeout(4000) });
      if (!r.ok) { last = "http-" + r.status; continue; }
      const items = parseFeed(await r.text()); if (!items.length) { last = "empty"; continue; }
      return { items, via: u };
    } catch (e) { last = String(e.name || e.message || e); }
  }
  return { items: [], err: last };
}
function stripSource(t) { const i = t.lastIndexOf(" - "); return i > 12 ? t.slice(0, i) : t; }

/* Lebanese news has priority: Lebanese channels and any headline about Lebanon are picked first (up to LEB_MAX of the
   bar) and shown first (field pri:1; the page sorts by it before time) */
/* "Lebanese news" for the badge and the priority: it names Lebanon or a Lebanese place/party, or it comes from a Lebanese
   channel and is not about another country (the broad LEB list above also matches «الجنوب» / «صور» and is only for the word policy) */
const LEB_STRICT = /لبنان|اللبنان|بيروت|الضاحية الجنوبية|بنت جبيل|النبطية|مرجعيون|حاصبيا|البقاع|بعلبك|الهرمل|ميفدون|الخيام|الناقورة|مارون الراس|كفرشوبا|شبعا|عيترون|الليطاني|حزب الله/;
const FOREIGN = /إيران|الإيراني|طهران|واشنطن|ترامب|روسيا|أوكرانيا|غزة|فلسطين|الفلسطيني|سوريا|السوري|دمشق|اليمن|اليمني|العراق|العراقي|بغداد|السودان|مصر|القاهرة|ليبيا|الصين|أوروبا|الأوروبي|الولايات المتحدة|الأمريكي|بريطانيا|فرنسا|ألمانيا|تركيا|السعودية|الخليج|الدوحة|قطر|الإمارات|الأردن|عمان|أمريكا|الأمريكية|الأميركي|الأميركية|الروسي|الروسية|الصيني|الصينية|الخزانة|البيت الأبيض|الكونغرس|الأوروبية|الهند|اليابان|كوريا|العالمي|عالمي|الأسواق|الاتحاد|بنما|المكسيك|البرازيل|الأرجنتين|كندا|أستراليا|نيوزيلندا|إندونيسيا|باكستان|أفغانستان|بنغلاديش|ماليزيا|الفلبين|تايوان|فيتنام|تايلاند|إسبانيا|إيطاليا|اليونان|بولندا|هولندا|بلجيكا|سويسرا|السويد|النرويج|الدنمارك|فنلندا|إسرائيلي(?=.{0,40}(?:سوريا|غزة|إيران|اليمن))|المغرب|الجزائر|تونس|موريتانيا|الصومال|إثيوبيا|نيجيريا|جنوب أفريقيا|الكويت|البحرين|لندن|باريس|برلين|موسكو|بكين|طوكيو|نيويورك|فلوريدا|كاليفورنيا|تكساس|أمريكي|ناسا|الأطلسي|الناتو/;
/* a Lebanese channel's headline gets the badge only with a local marker (not just "not foreign") */
const LOCAL = /اليونيفيل|اليونيفل|الحشيمي|ميقاتي|جعجع|جنبلاط|باسيل|فرنجية|الراعي|قبلان|عويدات|مجلس الشيوخ اللبناني|رئيس البلدية|اتحاد البلديات|الاحتلال الإسرائيلي|الجيش الإسرائيلي|غارة|غارات|مسيّرة|مسيرة|الحدود|مجلس النواب|مجلس الوزراء|رئيس الحكومة|رئيس الجمهورية|رئيس مجلس النواب|نبيه بري|جوزاف عون|نواف سلام|الحكومة اللبنانية|قوى الأمن|الأمن العام|الدفاع المدني|المحافظ|البلدية|بلدة|قضاء|النائب|النواب|مصرف لبنان|كهرباء لبنان|ساعات التغذية|الجنوب|الجيش/;
const isLeb = (srcId, text) => LEB_STRICT.test(text) || isLebName(text) || (LEB_SRC.has(srcId) && !FOREIGN.test(text) && LOCAL.test(text));
const WAR = /قصف|غارة|غارات|استهداف|استهدف|مسيّرة|مسيرة|صاروخ|صواريخ|اشتباك|هجوم|تفجير|انفجار|شهداء|شهيد|جرحى|إصابة|قتلى/;
const ACTIVITY = /زيارة|يزور|زار|تزور|وفد|وفود|يستقبل|تستقبل|استقبل|يلتقي|تلتقي|التقى|لقاء|اجتماع|يجتمع|مباحثات|محادثات|يبحث|تبحث|بحث|السفير|سفير|ممثل|ممثلي|المبعوث|مبعوث|توقيع|يوقع|اتفاقية|مذكرة تفاهم|تعاون|مؤتمر|منتدى|معرض|مهرجان|يشارك|مشاركة/;
const LEB_SRC = new Set(["jadeed", "lbci", "annahar", "mtv", "nna", "nbn"]);
const LEB_MAX = 24;
const CATCAP = { politics: 26, economy: 7, sports: 7 };
const TARGET = 40;     /* headlines in the bar (about one hour's worth) */
const PER_SOURCE = 6;  /* at most this many from any one channel */
export async function build(now = Date.now()) {
  used = 0;
  const res = await Promise.all(SOURCES.map(s => fetchFeed(s).then(r => ({ s, r }))));
  const status = {}, cand = [];
  for (const { s, r } of res) {
    const mine = [];
    for (const it of r.items) {
      if (s.skipLink && s.skipLink.test(it.link)) continue;
      if (it.ts > now + 600000) continue;
      const raw = s.fix ? s.fix(it.title) : it.title;
      if (s.skipText && s.skipText.test(raw)) continue;
      if (s.topic) { const i = raw.lastIndexOf(" - "); if (i > 12 && BLOCKPUB.test(raw.slice(i + 3))) continue; }
      const text = clean(/news\.google\./.test(r.via || "") ? stripSource(raw) : raw, it.link, !!s.sport);
      if (text && s.lebActivityOnly && isLeb(s.id, text) && (WAR.test(text) || !ACTIVITY.test(text))) continue;   /* from SANA only Lebanon-related activities (visits, delegations, meetings), never war news */
      if (text) mine.push({ text, ts: it.ts, leb: isLeb(s.id, text), src: s.id, topic: !!s.topic, sport: !!s.sport, off: isOfficial(s.id, text, s.agency), pre: s.agency || "", cap: s.cap || PER_SOURCE });
    }
    mine.sort((a, b) => b.ts - a.ts);
    status[s.id] = r.err ? { ok: false, err: r.err } : { ok: true, feed: r.items.length, usable: mine.length, newest: mine[0] ? Math.round((now - mine[0].ts) / 60000) + "m" : null };
    cand.push(...mine);
  }
  let windowMin = 60, picked = [];
  for (const w of [60, 120, 240, 720, 1440]) {
    windowMin = w; picked = [];
    const per = {}, seen = new Set(), nc = {};
    let nleb = 0;
    const order = cand.slice().sort((a, b) => (b.leb - a.leb) || (b.ts - a.ts));
    /* phase 1 keeps room for every section of the bar (general ≤15, economy ≤5, sport ≤5); phase 2 fills what is left */
    for (const phase of [1, 2]) {
      for (const c of order) {
        if (picked.length >= TARGET) break;
        if (picked.includes(c) || now - c.ts > w * 60000) continue;
        if (c.leb && nleb >= LEB_MAX) continue;
        const cc = c.sport ? "sports" : catOf(c.text);
        if (phase === 1 && (nc[cc] || 0) >= CATCAP[cc]) continue;
        const k = norm(c.text), k2 = k.slice(0, 28);
        if (seen.has(k) || seen.has(k2)) continue;
        /* the same story from another source: one source only, and a direct channel is preferred over a topic search */
        const d = picked.findIndex(p => p.off === c.off && similar(p.text, c.text));
        if (d >= 0) { if (picked[d].topic && !c.topic) { picked[d] = c; seen.add(k); seen.add(k2); } continue; }
        if ((per[c.src] = (per[c.src] || 0) + 1) > c.cap) continue;
        seen.add(k); seen.add(k2); picked.push(c); nc[cc] = (nc[cc] || 0) + 1; if (c.leb) nleb++;
      }
    }
    /* aim for about TARGET headlines from the last hour; widen the window only when the hour is too quiet */
    if (picked.length >= (w === 60 ? 20 : w === 120 ? 15 : 8)) break;
  }
  picked = picked.slice(0, TARGET).map(c => ({ text: c.pre ? c.pre + ": " + c.text : c.text, cat: c.sport ? "sports" : catOf(c.text), ts: c.ts, pri: c.leb ? 1 : 0, src: c.src, off: c.off ? 1 : 0 }));
  return { items: picked, windowMin, updated: new Date(now).toISOString(), sources: status };
}

/* The bar's content, cached 5 min at the edge. When the STATS KV is bound, every headline that reaches the bar is also logged once
   (first time seen) under tk:<Beirut day>, so the admin screen (/api/breaking-log) can show what went out and when. */
const KEYV = "/api/ticker?v=13"; /* bump v to drop every cached copy after a logic change */
async function logSeen(env, data) {
  const kv = env && env.STATS; if (!kv || !data.items.length) return;
  try {
    const key = "tk:" + beirutDay(), cur = await kv.get(key), arr = cur ? JSON.parse(cur) : [], have = new Set(arr.map(x => x.k)), seen = Date.now();
    let added = 0;
    for (const it of data.items) { const k = norm(it.text).slice(0, 40); if (!k || have.has(k)) continue; have.add(k); arr.push({ k, text: it.text, cat: it.cat, src: it.src, ts: it.ts, pri: it.pri, seen }); added++; }
    if (added) await kv.put(key, JSON.stringify(arr.slice(-500)), { expirationTtl: 60 * 60 * 24 * 3 });
  } catch (e) { /* logging is best effort */ }
}
export async function liveTicker({ request, env, waitUntil }, fresh) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(request.url).origin + KEYV);
  if (cache && !fresh) { const hit = await cache.match(key); if (hit) return hit; }
  const data = await build();
  const res = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": data.items.length ? "public, max-age=300" : "public, max-age=60" } });
  const jobs = [logSeen(env, data)]; if (cache) jobs.push(cache.put(key, res.clone()));
  const all = Promise.all(jobs); if (waitUntil) waitUntil(all); else await all;
  return res;
}
export async function onRequestGet(ctx) {
  return liveTicker(ctx, new URL(ctx.request.url).searchParams.has("fresh"));
}

/* Public, cached (5 min) live prices: gold & silver (gold-api.com, no key), Brent crude (Yahoo chart, Stooq fallback).
   Day change % comes from Yahoo futures (GC=F, SI=F, BZ=F) when reachable. Any source that fails is simply left out. */
const UA = { "User-Agent": "Mozilla/5.0 (compatible; NabdaNews/1.0)", Accept: "application/json,text/csv,*/*" };
const T = () => AbortSignal.timeout(4000);
const num = x => (typeof x === "number" && isFinite(x) ? x : null);
const round = (x, d) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

async function goldApi(sym) {
  const r = await fetch("https://api.gold-api.com/price/" + sym, { headers: UA, signal: T() });
  if (!r.ok) throw new Error("gold-api " + r.status);
  return num((await r.json()).price);
}
async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA, signal: T() });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const res = (await r.json()).chart.result[0];
  const price = num(res.meta.regularMarketPrice);
  const closes = (res.indicators.quote[0].close || []).filter(x => num(x) != null);
  const prev = closes.length >= 2 ? closes[closes.length - 2] : num(res.meta.chartPreviousClose);
  return { price, pct: price != null && prev ? ((price - prev) / prev) * 100 : null };
}
async function stooq(sym) {
  const r = await fetch(`https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlc&h&e=csv`, { headers: UA, signal: T() });
  if (!r.ok) throw new Error("stooq " + r.status);
  const row = (await r.text()).trim().split(/\r?\n/)[1] || "";
  const c = row.split(","); const open = parseFloat(c[3]), close = parseFloat(c[6]);
  if (!isFinite(close)) throw new Error("stooq-empty");
  return { price: close, pct: isFinite(open) && open ? ((close - open) / open) * 100 : null };
}
const settle = p => p.then(v => v, () => null);

export async function collect() {
  const [gS, sS, gY, sY, bY] = await Promise.all([settle(goldApi("XAU")), settle(goldApi("XAG")), settle(yahoo("GC=F")), settle(yahoo("SI=F")), settle(yahoo("BZ=F"))]);
  let brent = bY && bY.price != null ? bY : await settle(stooq("cb.f"));
  const mk = (spot, fut, d) => {
    const price = spot ?? (fut && fut.price);
    return price == null ? null : { price: round(price, d), pct: fut && fut.pct != null ? round(fut.pct, 2) : null };
  };
  return { gold: mk(gS, gY, 2), silver: mk(sS, sY, 2), brent: brent && brent.price != null ? { price: round(brent.price, 2), pct: round(brent.pct, 2) } : null, updated: new Date().toISOString() };
}

export async function onRequestGet({ request, waitUntil }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(request.url).origin + "/api/markets");
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const data = await collect();
  const ok = data.gold || data.silver || data.brent;
  const res = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": ok ? "public, max-age=300" : "no-store" } });
  if (cache && ok) { const p = cache.put(key, res.clone()); if (waitUntil) waitUntil(p); else await p; }
  return res;
}

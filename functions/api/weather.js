/* Weather for world capitals: /api/weather?c=<id>  (ids from /data/capitals.json)
   Source: MET Norway Locationforecast 2.0 (CC BY 4.0). Cached at the edge for 30 minutes per city. */
const UA = { "User-Agent": "nabdanews.org/1.0 (nabdaonline001@gmail.com)", Accept: "application/json" };
let LIST = null;

async function capitals(request, env) {
  if (LIST) return LIST;
  const u = new URL("/data/capitals.json", request.url);
  const r = env && env.ASSETS ? await env.ASSETS.fetch(u) : await fetch(u);
  if (!r.ok) throw new Error("capitals " + r.status);
  const a = await r.json();
  LIST = new Map(a.map(x => [x.id, x]));
  return LIST;
}
const r1 = x => Math.round(x * 10) / 10;

export function shape(id, j) {
  const ts = j && j.properties && j.properties.timeseries;
  if (!ts || !ts.length) throw new Error("empty");
  const now = ts[0], d = now.data.instant.details;
  const sym = (now.data.next_1_hours || now.data.next_6_hours || now.data.next_12_hours || {}).summary;
  const t0 = Date.parse(now.time);
  const temps = ts.filter(x => Date.parse(x.time) - t0 <= 24 * 3600e3).map(x => x.data.instant.details.air_temperature).filter(x => typeof x === "number");
  if (typeof d.air_temperature !== "number") throw new Error("no-temp");
  const code = (sym && sym.symbol_code) || "cloudy";
  return {
    id, t: r1(d.air_temperature),
    min: temps.length ? r1(Math.min(...temps)) : null,
    max: temps.length ? r1(Math.max(...temps)) : null,
    hum: typeof d.relative_humidity === "number" ? Math.round(d.relative_humidity) : null,
    wind: typeof d.wind_speed === "number" ? Math.round(d.wind_speed * 3.6) : null,
    code: code.replace(/_(day|night|polartwilight)$/, ""),
    night: /_night$/.test(code),
    updated: now.time,
  };
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const id = (url.searchParams.get("c") || "").toLowerCase();
  const J = (o, s, cc) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cc } });
  let city;
  try { city = (await capitals(request, env)).get(id); } catch (e) { return J({ error: "list" }, 502, "no-store"); }
  if (!city) return J({ error: "unknown" }, 404, "no-store");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.origin + "/api/weather?c=" + id);
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  try {
    const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${city.la.toFixed(2)}&lon=${city.lo.toFixed(2)}`, { headers: UA, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 900, cacheEverything: true } });
    if (!r.ok) throw new Error("met " + r.status);
    const out = shape(id, await r.json());
    const res = J(out, 200, "public, max-age=1800");
    if (cache) { const p = cache.put(key, res.clone()); if (waitUntil) waitUntil(p); else await p; }
    return res;
  } catch (e) {
    return J({ error: "upstream" }, 502, "no-store");
  }
}

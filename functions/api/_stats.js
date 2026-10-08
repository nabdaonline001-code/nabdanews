/* First-party visitor statistics (no cookies, no personal data stored).
   Needs one Cloudflare KV namespace bound to the Pages project under the variable name STATS; without it every call is a no-op.
   Counters live in the KEY METADATA of small keys, so the admin page can read a whole month with a few list() calls:
     c:<day>:<pv|uv|rd>:<shard>   page views / unique visitors / news reads
     a:<day>:<newsId>:<shard>     reads of one news item
     u:<day>:<hash>, r:<day>:<hash>:<id>   one-day markers so refreshes and repeat visits are not counted twice
   <day> is the Beirut calendar day. The visitor hash mixes IP + browser + day + a secret, so it cannot be linked across days. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|scrapy/i;
const SHARDS = 4, KEEP = 60 * 60 * 24 * 400;
export const ID_RE = /^[A-Za-z0-9_-]{1,60}$/;

export function beirutDay(t) {
  try { return new Date(t == null ? Date.now() : t).toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }); } catch (e) { return new Date().toISOString().slice(0, 10); }
}
async function visitorHash(env, request, day) {
  const ip = request.headers.get("CF-Connecting-IP") || "", ua = request.headers.get("User-Agent") || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + ua + "|" + day + "|" + (env.SESSION_SECRET || "")));
  return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}
async function bump(kv, key) {
  const cur = await kv.getWithMetadata(key);
  const n = (cur && cur.metadata && Number(cur.metadata.n)) || 0;
  await kv.put(key, "1", { metadata: { n: n + 1 }, expirationTtl: KEEP });
}
/* kind: "pv" (a page was opened) or "read" (a news item was opened, id = its id or "lead"). Never throws. */
export async function record(env, request, kind, id) {
  const kv = env && env.STATS; if (!kv) return;
  try {
    const ua = request.headers.get("User-Agent") || ""; if (!ua || BOT.test(ua)) return;
    const day = beirutDay(), vh = await visitorHash(env, request, day), sh = Math.floor(Math.random() * SHARDS);
    if (kind === "pv") {
      await bump(kv, `c:${day}:pv:${sh}`);
      if (!(await kv.get(`u:${day}:${vh}`))) { await kv.put(`u:${day}:${vh}`, "1", { expirationTtl: 172800 }); await bump(kv, `c:${day}:uv:${sh}`); }
    } else if (kind === "read" && ID_RE.test(id || "")) {
      const mk = `r:${day}:${vh}:${id}`;
      if (await kv.get(mk)) return;
      await kv.put(mk, "1", { expirationTtl: 172800 });
      await bump(kv, `c:${day}:rd:${sh}`); await bump(kv, `a:${day}:${id}:${sh}`);
    }
  } catch (e) { /* statistics must never break the site */ }
}

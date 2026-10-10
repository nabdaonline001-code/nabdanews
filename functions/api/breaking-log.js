/* GET /api/breaking-log (logged-in admin only) -> { now, live:[{text,cat,ts,pri,src}], windowMin, updated, log:[{text,cat,src,ts,pri,seen}], logOn }
   live = what the automatic bar holds right now; log = every automatic headline that reached the bar today (Beirut day), with the
   moment it was first seen. The log needs the STATS KV; without it logOn is false. ?fresh=1 rebuilds the bar first. */
import { json, session } from "./_shared.js";
import { liveTicker } from "./ticker.js";
import { beirutDay } from "./_stats.js";

export async function onRequestGet(ctx) {
  const { request, env } = ctx, hdr = { "Cache-Control": "private, no-store" };
  if (!(await session(request, env))) return json({ error: "auth" }, 401);
  let live = { items: [] };
  try { live = await (await liveTicker(ctx, new URL(request.url).searchParams.has("fresh"))).json(); } catch (e) {}
  let log = [];
  if (env.STATS) { try { const c = await env.STATS.get("tk:" + beirutDay()); if (c) log = JSON.parse(c).map(({ k, ...x }) => x); } catch (e) {} }
  return json({ now: Date.now(), live: live.items || [], windowMin: live.windowMin || 60, updated: live.updated || null, log, logOn: !!env.STATS }, 200, hdr);
}

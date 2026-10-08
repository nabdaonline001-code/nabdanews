/* Admin-only upload of a short video (mp4 / webm, up to 20 MB). The file is committed to videos/ in the repository and
   served as a static file once Cloudflare Pages has redeployed (about a minute). */
import { json, session, permsOf, sameOrigin, putFile } from "./_shared.js";
const MAX = 20 * 1024 * 1024;
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const sess = await session(request, env);
  if (!sess) return json({ error: "auth" }, 401);
  if (!permsOf(sess).some(p => p === "news_video" || p === "news_shorts")) return json({ error: "forbidden" }, 403);
  const who = sess.name;
  if (!env.GITHUB_TOKEN) return json({ error: "not-configured" }, 500);
  const ext = new URL(request.url).searchParams.get("ext");
  if (ext !== "mp4" && ext !== "webm") return json({ error: "bad-type" }, 400);
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX) return json({ error: "too-large" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return json({ error: "empty" }, 400);
  if (bytes.length > MAX) return json({ error: "too-large" }, 413);
  const isMp4 = bytes.length > 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp";
  const isWebm = bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if ((ext === "mp4" && !isMp4) || (ext === "webm" && !isWebm)) return json({ error: "bad-file" }, 400);
  const id = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + [...crypto.getRandomValues(new Uint8Array(5))].map(b => b.toString(16).padStart(2, "0")).join("");
  const path = `videos/${id}.${ext}`;
  try { await putFile(env, path, bytes, "Upload video (by " + String(who).replace(/[^\w.-]/g, "") + ")"); return json({ ok: true, url: "/" + path }); }
  catch (e) { return json({ error: String(e.message || e) }, 502); }
}

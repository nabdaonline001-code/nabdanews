/* Owner-only inbox for messages sent from the contact and advertising forms.
   GET  -> { list: [...] } newest first
   POST { del: "<id>" } -> removes that message */
import { json, session, sameOrigin, readJsonFile, changeJsonFile, MESSAGES_PATH } from "./_shared.js";

async function owner(request, env) { const s = await session(request, env); return s && s.owner ? s : null; }

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  try {
    const { data } = await readJsonFile(env, MESSAGES_PATH, { list: [] });
    const list = Array.isArray(data && data.list) ? data.list.slice().reverse() : [];
    return json({ list });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const s = await owner(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  let b = {}; try { b = await request.json(); } catch (e) {}
  const id = String(b.del || "");
  if (!/^[a-z0-9]{1,40}$/.test(id)) return json({ error: "bad-request" }, 400);
  try {
    await changeJsonFile(env, MESSAGES_PATH, { list: [] }, d => {
      if (!Array.isArray(d.list)) d.list = [];
      d.list = d.list.filter(x => x && x.id !== id);
      return null;
    }, "Delete contact message (by " + s.name.replace(/[^\w.-]/g, "") + ")");
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

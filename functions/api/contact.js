/* Public endpoint for the "تواصل معنا" and "أعلن معنا" forms.
   POST { k: "msg" | "ad", name, email, phone, message, website (honeypot, must stay empty) }
   Messages are kept in private/messages.json on GitHub (blocked from the public web) and read by the owner at /api/messages. */
import { json, sameOrigin, changeJsonFile, MESSAGES_PATH } from "./_shared.js";
const MAX_KEEP = 300;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;
function clean(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max); }

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  if (!env.GITHUB_TOKEN) return json({ error: "not-configured" }, 500);
  const text = await request.text();
  if (text.length > 10000) return json({ error: "too-large" }, 413);
  let b = {}; try { b = JSON.parse(text); } catch (e) {}
  if (b.website) return json({ ok: true }); /* bot filled the hidden field: pretend success, store nothing */
  const k = b.k === "ad" ? "ad" : "msg";
  const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), t: Date.now(), k,
    n: clean(b.name, 60), e: clean(b.email, 100), p: clean(b.phone, 30), m: clean(b.message, 2000) };
  if (rec.e && !EMAIL.test(rec.e)) return json({ error: "bad-email" }, 400);
  if (rec.p && !PHONE.test(rec.p)) return json({ error: "bad-phone" }, 400);
  if (k === "msg" && (!rec.e || !rec.m)) return json({ error: "missing" }, 400);
  if (k === "ad" && !rec.e && !rec.p) return json({ error: "missing" }, 400);
  try {
    await changeJsonFile(env, MESSAGES_PATH, { list: [] }, d => {
      if (!Array.isArray(d.list)) d.list = [];
      d.list.push(rec);
      if (d.list.length > MAX_KEEP) d.list = d.list.slice(-MAX_KEEP);
      return null;
    }, k === "ad" ? "New ad request" : "New contact message");
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

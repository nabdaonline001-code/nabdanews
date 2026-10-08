import { json, session, permsOf } from "./_shared.js";
export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  return json({ admin: !!s, owner: !!(s && s.owner), user: s ? s.name : null, perms: permsOf(s) });
}

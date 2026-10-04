import { json, isAdmin, fetchData } from "./_shared.js";
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  try { return json(await fetchData(env)); } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

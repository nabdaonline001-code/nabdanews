import { json, isAdmin } from "./_shared.js";
export async function onRequestGet({ request, env }) { return json({ admin: await isAdmin(request, env) }); }

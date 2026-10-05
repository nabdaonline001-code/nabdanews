/* Blocks public access to everything under /private/ (staff account hashes live there in the repo). */
export function onRequest() { return new Response("Not found", { status: 404 }); }

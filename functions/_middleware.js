/* Maintenance mode: while private/status.json says { "maintenance": true }, visitors who are not logged in
   get a "back soon" page instead of the site. Logged-in accounts (owner and staff) see the site as usual.
   Only page requests are checked; /api/* and files (images, scripts, data) pass straight through. */
import { session } from "./api/_shared.js";

const PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>NABDA | نبضة — نعود قريباً</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;700;900&display=swap">
<style>
:root{--g:#5a7567;--b:#7A6A58}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#fff;color:var(--g);font-family:"Noto Kufi Arabic",Tahoma,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 20px}
.lat{direction:ltr;font-weight:700;letter-spacing:.6em;padding-left:.6em;font-size:14px}
h1{font-weight:900;font-size:clamp(72px,18vw,140px);line-height:1.15;margin:4px 0 0}
svg{display:block;width:min(420px,86vw);height:auto;margin:6px 0 26px}
p{margin:0 0 8px;font-size:clamp(17px,4.4vw,21px);line-height:1.9;max-width:34em}
.soon{font-weight:700;font-size:clamp(22px,6vw,30px);margin-bottom:12px}
footer{position:fixed;inset-inline:0;bottom:0;padding:12px 16px;display:flex;justify-content:center}
.lg{background:none;border:1px solid var(--g);color:var(--g);font:600 14px "Noto Kufi Arabic",Tahoma,sans-serif;padding:6px 16px;cursor:pointer;border-radius:0;direction:ltr}
form{margin-top:28px;width:min(340px,100%);display:flex;flex-direction:column;gap:8px}
form[hidden]{display:none}
input{width:100%;padding:10px;border:1px solid var(--g);border-radius:0;font:inherit;direction:ltr;color:#2b3a33}
input:focus-visible,.lg:focus-visible,button:focus-visible{outline:3px solid var(--g);outline-offset:2px}
form button{padding:9px;border:1px solid var(--g);background:var(--g);color:#fff;font:inherit;cursor:pointer;border-radius:0}
#st{min-height:1.6em;color:#C8102E;font-size:14px;margin:0}
</style>
</head>
<body>
<main>
  <div class="lat">NABDA</div>
  <h1>نبضة</h1>
  <svg viewBox="0 0 420 70" aria-hidden="true"><polyline points="0,35 180,35 194,35 206,10 224,62 242,4 256,35 420,35" fill="none" stroke="#5a7567" stroke-width="4" stroke-linejoin="miter" stroke-linecap="square"/></svg>
  <p class="soon">نعود قريباً</p>
  <p>نعمل على تجهيز الموقع ليصلكم بأفضل صورة. شكراً لصبركم.</p>
  <form id="f" hidden>
    <label for="u" class="lat" style="letter-spacing:0;padding:0;font-weight:500">اسم المستخدم</label>
    <input id="u" autocomplete="username" required>
    <label for="p" class="lat" style="letter-spacing:0;padding:0;font-weight:500">كلمة المرور</label>
    <input id="p" type="password" autocomplete="current-password" required>
    <button type="submit">دخول</button>
    <p id="st" role="status" aria-live="polite"></p>
  </form>
</main>
<footer><button class="lg" id="lg" type="button">Log in</button></footer>
<script>
var f=document.getElementById("f"),st=document.getElementById("st");
document.getElementById("lg").onclick=function(){ f.hidden=false; document.getElementById("u").focus(); };
f.onsubmit=function(e){
  e.preventDefault(); st.textContent="جارٍ الدخول...";
  fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({username:document.getElementById("u").value,password:document.getElementById("p").value})})
  .then(function(r){ if(r.ok){ location.reload(); } else { st.textContent="اسم المستخدم أو كلمة المرور غير صحيحة."; } })
  .catch(function(){ st.textContent="تعذّر الدخول، حاول مرة أخرى."; });
};
</script>
</body>
</html>`;

function isPage(path) {
  if (path.startsWith("/api/") || path.startsWith("/private/")) return false;
  const last = path.split("/").pop();
  return path === "/" || last === "" || /\.html?$/i.test(last) || !/\.[A-Za-z0-9]+$/.test(last);
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const url = new URL(request.url);
  if (!isPage(url.pathname)) return next();
  let on = false;
  try {
    const r = await env.ASSETS.fetch(new URL("/private/status.json", url.origin));
    if (r.ok) on = !!(await r.json()).maintenance;
  } catch (e) { on = false; }
  if (!on) return next();
  try { if (await session(request, env)) return next(); } catch (e) {}
  return new Response(PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "3600", "X-Robots-Tag": "noindex" } });
}

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
.snd{position:fixed;top:14px;inset-inline-start:14px;width:42px;height:42px;border:1px solid var(--g);background:#fff;color:var(--g);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.snd svg{width:20px;height:20px;margin:0;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.snd .off{display:none}.snd.muted .on{display:none}.snd.muted .off{display:block}
.snd.hint{animation:pl 1.6s ease-in-out infinite}
@keyframes pl{50%{box-shadow:0 0 0 8px rgba(90,117,103,.18)}}
@media (prefers-reduced-motion:reduce){.snd.hint{animation:none}}
body::before{content:"";position:fixed;left:50%;top:44%;width:min(760px,150vw);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(90,117,103,.11),rgba(90,117,103,0) 62%);pointer-events:none;animation:glow 2.8s ease-in-out infinite}
main{position:relative;z-index:1}
.ecg-base{opacity:.16}
.ecg{stroke-dasharray:34 100;stroke-dashoffset:34;animation:run 2.8s cubic-bezier(.45,.05,.4,1) infinite}
.rise{opacity:0;transform:translateY(14px);animation:rise .9s ease-out forwards}
.lat.rise{animation-delay:.1s}.soon.rise{animation-delay:1s}p.rise:not(.soon){animation-delay:1.3s}svg.rise{animation-delay:.7s}
h1.rise{animation:rise .9s ease-out .3s forwards,beat 2.8s ease-in-out 1.4s infinite;transform-origin:50% 60%}
@keyframes rise{to{opacity:1;transform:none}}
@keyframes run{0%{stroke-dashoffset:34;opacity:0}8%{opacity:1}80%{opacity:1}100%{stroke-dashoffset:-100;opacity:0}}
@keyframes beat{0%,100%{transform:scale(1)}46%{transform:scale(1)}52%{transform:scale(1.045)}58%{transform:scale(.995)}64%{transform:scale(1.02)}72%{transform:scale(1)}}
@keyframes glow{0%,100%{opacity:.55;transform:translate(-50%,-50%) scale(.94)}52%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}}
@media (prefers-reduced-motion:reduce){body::before,.ecg,h1.rise{animation:none}.ecg{stroke-dasharray:none;stroke-dashoffset:0}.rise{animation:none;opacity:1;transform:none}}
#st{min-height:1.6em;color:#C8102E;font-size:14px;margin:0}
</style>
</head>
<body>
<button class="snd muted hint" id="snd" type="button" aria-label="تشغيل الموسيقى" title="موسيقى">
  <svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>
  <svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>
</button>
<main>
  <div class="lat rise">NABDA</div>
  <h1 class="rise">نبضة</h1>
  <svg class="rise" viewBox="0 0 420 70" aria-hidden="true"><polyline class="ecg-base" points="0,35 180,35 194,35 206,10 224,62 242,4 256,35 420,35" fill="none" stroke="#5a7567" stroke-width="4" stroke-linejoin="miter" stroke-linecap="square"/><polyline class="ecg" pathLength="100" points="0,35 180,35 194,35 206,10 224,62 242,4 256,35 420,35" fill="none" stroke="#5a7567" stroke-width="4.5" stroke-linejoin="miter" stroke-linecap="round"/></svg>
  <p class="soon rise">نعود قريباً</p>
  <p class="rise">نعمل على تجهيز الموقع ليصلكم بأفضل صورة. شكراً لصبركم.</p>
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

/* calm ambient music, synthesised in the browser (no audio file). Browsers block sound until the visitor taps once,
   so it starts on the first tap anywhere on the page; the round button mutes / unmutes it. */
(function(){
  var AC=window.AudioContext||window.webkitAudioContext, btn=document.getElementById("snd");
  if(!AC){ btn.hidden=true; return; }
  var ctx,master,wet,on=false,started=false,timer,step=0,wanted=true;
  var CH=[[57,60,64,67],[53,57,60,64],[48,52,55,59],[55,59,62,66]];            /* Am7 Fmaj7 Cmaj7 G6 */
  var hz=function(n){return 440*Math.pow(2,(n-69)/12);};
  function tone(n,t,dur,vol,type,out){
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type; o.frequency.value=hz(n); o.detune.value=(Math.random()-.5)*8;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+Math.min(1.6,dur*.4));
    g.gain.linearRampToValueAtTime(0,t+dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t+dur+.1);
  }
  function bar(){
    if(!on) return;
    var c=CH[step%4],t=ctx.currentTime+.05,len=6;
    c.forEach(function(n){ tone(n-12,t,len+1.5,.05,"sine",master); tone(n,t,len+1,.022,"triangle",master); });
    tone(c[0]-24,t,len+1,.07,"sine",master);
    for(var i=0;i<8;i++){ var n=c[(i*3+step)%4]+12+(i%3===2?12:0); tone(n,t+i*(len/8)+.1,2.4,.03,"sine",wet); }
    step++; timer=setTimeout(bar,len*1000-300);
  }
  function build(){
    ctx=new AC(); master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
    wet=ctx.createGain(); wet.gain.value=1; wet.connect(master);
    var d=ctx.createDelay(1.5); d.delayTime.value=.55; var fb=ctx.createGain(); fb.gain.value=.42;
    var lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=1800;
    wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
  }
  function play(){
    if(!ctx) build();
    ctx.resume().then(function(){
      if(ctx.state!=="running") return;
      on=true; btn.classList.remove("muted","hint"); btn.setAttribute("aria-label","إيقاف الموسيقى");
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(.9,ctx.currentTime,1.2);
      if(!started){ started=true; bar(); }
    }).catch(function(){});
  }
  function stop(){
    on=false; started=false; clearTimeout(timer); btn.classList.add("muted"); btn.classList.remove("hint");
    btn.setAttribute("aria-label","تشغيل الموسيقى");
    if(ctx){ master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0,ctx.currentTime,.25); }
  }
  btn.onclick=function(e){ e.stopPropagation(); wanted=false; if(on) stop(); else { wanted=true; play(); } };
  function first(e){ if(e&&e.target&&e.target.closest&&e.target.closest("#snd")) return; if(wanted&&!on) play(); }
  ["pointerdown","keydown","touchstart"].forEach(function(ev){ addEventListener(ev,function h(e){ first(e); if(on) removeEventListener(ev,h); },{passive:true}); });
  try{ play(); }catch(e){}
  document.addEventListener("visibilitychange",function(){ if(!ctx||!on) return; if(document.hidden) ctx.suspend(); else ctx.resume(); });
})();
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

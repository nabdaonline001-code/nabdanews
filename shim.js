/* NABDA static shim.
   Visitors: a read-only "db" served from data/site.json; the two forms become e-mail.
   Admin (owner): open  nabdanews.org/#admin , paste a GitHub token once; then every existing "إدارة" panel works and
   each change is committed to data/site.json on GitHub (the site redeploys itself within about a minute). */
(function(){
  var CFG=Object.assign({repo:"nabdaonline001-code/nabdanews",branch:"main",path:"data/site.json",email:"",web3formsKey:""},window.NABDA_CONFIG||{});
  var TK="nabda_gh_token", token="";
  try{ token=localStorage.getItem(TK)||""; }catch(e){}
  var admin=!!token;
  var store={}, listeners=[], ready=null, queue=[], timer=null, waiters=[];

  /* ---------- small UI helpers ---------- */
  function h(tag,css,txt){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(txt!=null) e.textContent=txt; return e; }
  var toastEl=null, toastT=null;
  function toast(msg,bad){
    function show(){
      if(!toastEl){ toastEl=h("div","position:fixed;inset-inline-start:16px;bottom:56px;z-index:99999;max-width:320px;padding:10px 14px;font:600 14px/1.5 'Noto Kufi Arabic',Tahoma,sans-serif;color:#fff;border-radius:0;box-shadow:0 2px 10px rgba(0,0,0,.25)"); toastEl.setAttribute("role","status"); document.body.appendChild(toastEl); }
      toastEl.style.background=bad?"#C8102E":"#5a7567"; toastEl.textContent=msg; toastEl.hidden=false;
      clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.hidden=true; },bad?9000:4500);
    }
    if(document.body) show(); else document.addEventListener("DOMContentLoaded",show);
  }
  function b64(s){ var b=new TextEncoder().encode(s),bin="",i,CH=0x8000; for(i=0;i<b.length;i+=CH) bin+=String.fromCharCode.apply(null,b.subarray(i,i+CH)); return btoa(bin); }

  /* ---------- GitHub ---------- */
  function ghHeaders(accept){ return {Authorization:"Bearer "+token,Accept:accept||"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}; }
  function ghUrl(){ return "https://api.github.com/repos/"+CFG.repo+"/contents/"+CFG.path; }
  function fetchRaw(){
    return fetch(ghUrl()+"?ref="+encodeURIComponent(CFG.branch)+"&t="+Date.now(),{headers:ghHeaders("application/vnd.github.raw+json"),cache:"no-store"})
      .then(function(r){ if(r.status===401||r.status===403) throw new Error("auth"); if(!r.ok) throw new Error("data"); return r.json(); });
  }
  function fetchSha(){
    return fetch(ghUrl()+"?ref="+encodeURIComponent(CFG.branch)+"&t="+Date.now(),{headers:ghHeaders(),cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error("get"); return r.json(); }).then(function(m){ return m.sha; });
  }
  function applyRoot(root,o){
    var c=root[o.c]=root[o.c]||{};
    if(o.t==="set") c[o.id]=o.d; else if(o.t==="update") c[o.id]=Object.assign({},c[o.id]||{},o.d); else if(o.t==="del") delete c[o.id];
  }
  function flush(){
    var ops=queue.splice(0), ws=waiters.splice(0); if(!ops.length) return;
    var attempt=0;
    function go(){
      return Promise.all([fetchRaw(),fetchSha()]).then(function(a){
        var json=a[0], sha=a[1]; ops.forEach(function(o){ applyRoot(json,o); });
        return fetch(ghUrl(),{method:"PUT",headers:Object.assign({"Content-Type":"application/json"},ghHeaders()),
          body:JSON.stringify({message:"Update site content",content:b64(JSON.stringify(json)),sha:sha,branch:CFG.branch})});
      }).then(function(r){
        if((r.status===409||r.status===422)&&attempt++<2) return go();
        if(!r.ok) throw new Error("put"+r.status);
      });
    }
    go().then(function(){ toast("تم الحفظ على GitHub، ويظهر للزوار خلال دقيقة تقريباً."); ws.forEach(function(w){ w.res(); }); })
        .catch(function(e){ toast("تعذّر الحفظ على GitHub. حدّث الصفحة وحاول مرة أخرى.",true); ws.forEach(function(w){ w.rej(e); }); });
  }
  function enqueue(o){
    queue.push(o);
    return new Promise(function(res,rej){ waiters.push({res:res,rej:rej}); clearTimeout(timer); timer=setTimeout(flush,700); });
  }

  /* ---------- data ---------- */
  function ingest(j){ Object.keys(j).forEach(function(c){ Object.keys(j[c]).forEach(function(id){ store[c+"/"+id]={id:id,data:j[c][id]}; }); }); }
  function loadPublic(){
    return fetch("data/site.json?v="+Math.floor(Date.now()/60000),{cache:"no-cache"}).then(function(r){ if(!r.ok) throw new Error("data"); return r.json(); });
  }
  function load(){
    if(ready) return ready;
    var p=admin?fetchRaw().catch(function(e){
      if(e&&e.message==="auth"){ try{ localStorage.removeItem(TK); }catch(x){} admin=false; token=""; toast("مفتاح GitHub غير صالح، رجعنا لوضع الزائر.",true); }
      return loadPublic();
    }):loadPublic();
    ready=p.then(function(j){ ingest(j); return true; }).catch(function(){ return false; });
    return ready;
  }
  function fire(){ listeners.slice().forEach(function(l){ l(); }); }
  function colDocs(c){ return Object.keys(store).filter(function(k){ return k.indexOf(c+"/")===0 && k.split("/").length===2; }).map(function(k){ return store[k]; }); }
  function snapOf(docs){ return {docs:docs.map(function(d){ return {id:d.id,exists:true,data:function(){ return d.data; }}; }),size:docs.length,empty:!docs.length}; }
  function docSnap(p,id){ var d=store[p]; return {id:id,exists:!!d,data:function(){ return d&&d.data; }}; }
  function sub(f){ listeners.push(f); setTimeout(f,0); return function(){ var i=listeners.indexOf(f); if(i>=0) listeners.splice(i,1); }; }
  function denied(){ return Promise.reject({code:"invalid_argument"}); }
  function rid(){ var s="",a="abcdefghijklmnopqrstuvwxyz0123456789",i; for(i=0;i<20;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }

  /* ---------- forms -> e-mail ---------- */
  function sendMessage(obj){
    var list=(obj&&obj.list)||[], it=list[list.length-1]||{}, who=(obj&&obj.name)||"زائر";
    var subject=(it.k==="ad"?"طلب إعلان":"رسالة من الموقع")+" - "+who;
    var lines=["الاسم: "+who]; if(it.p) lines.push("الهاتف: "+it.p); if(it.e) lines.push("البريد: "+it.e); if(it.m) lines.push("",it.m);
    var body=lines.join("\n");
    if(CFG.web3formsKey){
      return fetch("https://api.web3forms.com/submit",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({access_key:CFG.web3formsKey,subject:subject,name:who,message:body,from_name:"NABDA"})})
        .then(function(r){ return r.json(); }).then(function(j){ if(!j.success) throw new Error("send"); });
    }
    if(CFG.email){ window.location.href="mailto:"+CFG.email+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body); return Promise.resolve(); }
    return Promise.reject(new Error("no-channel"));
  }

  /* ---------- db facade ---------- */
  function mkDoc(p){
    var parts=p.split("/"), c=parts.slice(0,-1).join("/"), id=parts[parts.length-1], isMsg=c==="messages";
    return {
      get:function(){ return Promise.resolve(isMsg?{id:id,exists:false,data:function(){ return null; }}:docSnap(p,id)); },
      set:function(x){
        if(isMsg) return sendMessage(x); if(!admin) return denied();
        store[p]={id:id,data:x}; fire(); return enqueue({t:"set",c:c,id:id,d:x});
      },
      update:function(x){
        if(!admin) return denied();
        store[p]={id:id,data:Object.assign({},store[p]&&store[p].data,x)}; fire(); return enqueue({t:"update",c:c,id:id,d:x});
      },
      delete:function(){ if(!admin) return denied(); delete store[p]; fire(); return enqueue({t:"del",c:c,id:id}); },
      onSnapshot:function(n){ return sub(function(){ n(docSnap(p,id)); }); }
    };
  }
  var db={
    doc:mkDoc,
    collection:function(c){
      function q(order,dir){ return {
        orderBy:function(f,d){ return q(f,d||"asc"); },
        onSnapshot:function(n){ return sub(function(){
          var docs=colDocs(c).slice();
          if(order){ docs.sort(function(a,b){ return (dir==="desc"?-1:1)*((a.data[order]||0)-(b.data[order]||0)); }); }
          n(snapOf(docs)); }); }
      }; }
      var base=q(null,"asc");
      base.add=function(x){
        if(!admin) return denied(); var id=rid();
        store[c+"/"+id]={id:id,data:x}; fire(); return enqueue({t:"set",c:c,id:id,d:x}).then(function(){ return {id:id}; });
      };
      base.doc=function(id){ return mkDoc(c+"/"+id); };
      return base;
    }
  };
  var vid="v"+Math.random().toString(36).slice(2,10);
  var user={
    canEdit:function(){ return Promise.resolve(admin); },
    isOwner:function(){ return Promise.resolve(admin); },
    id:function(){ return Promise.resolve((CFG.web3formsKey||CFG.email)?vid:null); }
  };
  window.claude={use:function(n){
    if(n==="db") return load().then(function(ok){ return ok?db:null; });
    if(n==="user") return Promise.resolve(user);
    return Promise.resolve(null);
  }};

  /* ---------- admin login / status bar ---------- */
  function openLogin(){
    var ov=h("div","position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px");
    var bx=h("div","background:#fff;color:#2b3a33;max-width:460px;width:100%;padding:22px;border-top:8px solid #5a7567;font:15px/1.8 'Noto Kufi Arabic',Tahoma,sans-serif");
    bx.setAttribute("dir","rtl"); bx.setAttribute("lang","ar"); bx.setAttribute("role","dialog"); bx.setAttribute("aria-label","دخول المدير");
    bx.appendChild(h("h2","margin:0 0 8px;font-size:1.2rem;color:#5a7567","دخول المدير"));
    bx.appendChild(h("p","margin:0 0 10px","الصق مفتاح GitHub الخاص بك (Fine-grained token بصلاحية Contents: Read and write على مستودع الموقع). يُحفظ في هذا المتصفح فقط."));
    var inp=h("input","width:100%;box-sizing:border-box;padding:10px;border:1px solid #5a7567;font:inherit;direction:ltr"); inp.type="password"; inp.placeholder="github_pat_..."; inp.autocomplete="off"; inp.setAttribute("aria-label","مفتاح GitHub");
    var st=h("p","min-height:1.6em;margin:8px 0;color:#C8102E;font-size:.9rem"); st.setAttribute("role","status");
    var row=h("div","display:flex;gap:8px");
    var ok=h("button","padding:8px 20px;border:1px solid #5a7567;background:#5a7567;color:#fff;font:inherit;cursor:pointer","دخول");
    var no=h("button","padding:8px 20px;border:1px solid #5a7567;background:#fff;color:#5a7567;font:inherit;cursor:pointer","إلغاء");
    ok.type="button"; no.type="button"; row.appendChild(ok); row.appendChild(no);
    bx.appendChild(inp); bx.appendChild(st); bx.appendChild(row); ov.appendChild(bx); document.body.appendChild(ov); inp.focus();
    function close(){ ov.remove(); if(location.hash==="#admin") history.replaceState(null,"",location.pathname+location.search); }
    no.onclick=close;
    ok.onclick=function(){
      var t=inp.value.trim(); if(!t){ st.textContent="الصق المفتاح أولاً."; return; }
      ok.disabled=true; st.textContent="جارٍ التحقق...";
      fetch("https://api.github.com/repos/"+CFG.repo,{headers:{Authorization:"Bearer "+t,Accept:"application/vnd.github+json"}})
        .then(function(r){ if(!r.ok) throw new Error("bad"); return r.json(); })
        .then(function(j){ if(!j.permissions||!j.permissions.push) throw new Error("perm"); try{ localStorage.setItem(TK,t); }catch(e){ throw new Error("store"); } location.href=location.pathname+location.search; })
        .catch(function(e){ ok.disabled=false; st.textContent=e.message==="perm"?"المفتاح لا يملك صلاحية الكتابة على المستودع.":e.message==="store"?"المتصفح يمنع حفظ المفتاح.":"المفتاح غير صالح أو لا يصل إلى المستودع."; });
    };
    inp.addEventListener("keydown",function(e){ if(e.key==="Enter") ok.click(); if(e.key==="Escape") close(); });
  }
  function adminBar(){
    var b=h("div","position:fixed;inset-inline-start:16px;bottom:12px;z-index:99998;display:flex;gap:8px;align-items:center;background:#5a7567;color:#fff;padding:6px 12px;font:600 13px 'Noto Kufi Arabic',Tahoma,sans-serif");
    b.appendChild(h("span",null,"وضع المدير"));
    var x=h("button","border:1px solid #fff;background:transparent;color:#fff;padding:2px 10px;font:inherit;cursor:pointer","خروج"); x.type="button";
    x.onclick=function(){ try{ localStorage.removeItem(TK); }catch(e){} location.reload(); };
    b.appendChild(x); document.body.appendChild(b);
  }
  function boot(){
    if(admin) adminBar();
    else if(location.hash==="#admin") openLogin();
    window.addEventListener("hashchange",function(){ if(!admin&&location.hash==="#admin") openLogin(); });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();

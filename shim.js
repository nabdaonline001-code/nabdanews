/* NABDA static shim.
   Visitors: a read-only "db" served from data/site.json; the two forms become e-mail.
   Owner: footer link "Log in" (or nabdanews.org/#admin) -> password. A signed HttpOnly cookie is set by /api/login
   (Cloudflare Pages Functions); each change is sent to /api/save, which commits data/site.json to GitHub
   (the site redeploys itself within about a minute). */
(function(){
  /* hide the built-in sample content until the real data has loaded (avoids a flash of old stories on refresh) */
  var de=document.documentElement; de.classList.add("nd-load");
  var ndSt=document.createElement("style"); ndSt.textContent=".nd-load main,.nd-load .tick,.nd-load .side{visibility:hidden}"; (document.head||de).appendChild(ndSt);
  function ndDone(){ de.classList.remove("nd-load"); }
  setTimeout(ndDone,4000);
  var CFG=Object.assign({repo:"nabdaonline001-code/nabdanews",branch:"main",path:"data/site.json",email:"",web3formsKey:""},window.NABDA_CONFIG||{});
  var admin=false, owner=false, perms=null;
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

  /* ---------- admin API ---------- */
  function api(path,method,body){
    return fetch("/api/"+path,{method:method||"GET",credentials:"same-origin",cache:"no-store",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined})
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok){ var e=new Error(j.error||("http"+r.status)); e.status=r.status; throw e; } return j; }); });
  }
  function flush(){
    var ops=queue.splice(0), ws=waiters.splice(0); if(!ops.length) return;
    api("save","POST",{ops:ops}).then(function(){ toast("تم الحفظ، ويظهر للزوار خلال دقيقة تقريباً."); ws.forEach(function(w){ w.res(); }); })
      .catch(function(e){
        if(e.status===401){ admin=false; toast("انتهت جلسة المدير. حدّث الصفحة وادخل من جديد.",true); }
        else if(e.status===403) toast("ليست لديك صلاحية لهذه الإدارة. لم يُحفظ التعديل، حدّث الصفحة.",true);
        else toast("تعذّر الحفظ. حدّث الصفحة وحاول مرة أخرى.",true);
        ws.forEach(function(w){ w.rej(e); });
      });
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
    ready=api("me").catch(function(){ return {admin:false}; }).then(function(m){
      admin=!!(m&&m.admin); owner=!!(m&&m.owner); perms=(m&&Array.isArray(m.perms))?m.perms:null;
      return admin?api("data").catch(function(){ return loadPublic(); }):loadPublic();
    }).then(function(j){ ingest(j); return true; }).catch(function(){ return false; });
    ready.then(function(){ setTimeout(ndDone,450); });
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
    canEdit:function(){ return load().then(function(){ return admin; }); },
    isOwner:function(){ return load().then(function(){ return admin; }); },
    has:function(p){ return load().then(function(){ return !!admin&&(owner||!perms||perms.indexOf(p)>=0); }); },
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
    var bx=h("form","background:#fff;color:#2b3a33;max-width:420px;width:100%;padding:22px;border-top:8px solid #5a7567;font:15px/1.8 'Noto Kufi Arabic',Tahoma,sans-serif");
    bx.setAttribute("dir","rtl"); bx.setAttribute("lang","ar"); bx.setAttribute("role","dialog"); bx.setAttribute("aria-label","Log in");
    bx.appendChild(h("h2","margin:0 0 10px;font-size:1.2rem;color:#5a7567","Log in"));
    var usr=h("input","width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #5a7567;font:inherit;direction:ltr"); usr.type="text"; usr.placeholder="اسم المستخدم"; usr.autocomplete="username"; usr.setAttribute("aria-label","اسم المستخدم");
    bx.appendChild(usr);
    var inp=h("input","width:100%;box-sizing:border-box;padding:10px;border:1px solid #5a7567;font:inherit;direction:ltr"); inp.type="password"; inp.placeholder="كلمة المرور"; inp.autocomplete="current-password"; inp.setAttribute("aria-label","كلمة المرور");
    var st=h("p","min-height:1.6em;margin:8px 0;color:#C8102E;font-size:.9rem"); st.setAttribute("role","status");
    var row=h("div","display:flex;gap:8px");
    var ok=h("button","padding:8px 20px;border:1px solid #5a7567;background:#5a7567;color:#fff;font:inherit;cursor:pointer","دخول");
    var no=h("button","padding:8px 20px;border:1px solid #5a7567;background:#fff;color:#5a7567;font:inherit;cursor:pointer","إلغاء");
    ok.type="submit"; no.type="button"; row.appendChild(ok); row.appendChild(no);
    bx.appendChild(inp); bx.appendChild(st); bx.appendChild(row); ov.appendChild(bx); document.body.appendChild(ov); inp.focus();
    function close(){ ov.remove(); if(location.hash==="#admin") history.replaceState(null,"",location.pathname+location.search); }
    no.onclick=close;
    bx.addEventListener("submit",function(ev){
      ev.preventDefault();
      if(!inp.value){ st.textContent="اكتب كلمة المرور."; return; }
      ok.disabled=true; st.textContent="جارٍ الدخول...";
      api("login","POST",{username:usr.value,password:inp.value})
        .then(function(){ location.href=location.pathname+location.search; })
        .catch(function(e){
          ok.disabled=false;
          st.textContent=e.message==="bad-password"?"اسم المستخدم أو كلمة المرور غير صحيحة.":e.message==="not-configured"?"لم يُكمَل إعداد الدخول على الخادم بعد (كلمة المرور أو مفتاح GitHub في Cloudflare).":e.status===404?"خدمة الدخول غير متاحة على هذا الرابط.":"تعذّر الدخول، حاول مرة أخرى.";
        });
    });
    inp.addEventListener("keydown",function(e){ if(e.key==="Escape") close(); });
  }
  /* ---------- staff accounts panel (owner only) ---------- */
  var UERR={"bad-username":"اسم المستخدم: حروف إنجليزية صغيرة وأرقام فقط (2 إلى 30).","weak-password":"كلمة السر قصيرة، لازم 8 أحرف على الأقل.","reserved":"هذا الاسم محجوز لحساب مدير.","exists":"هذا الاسم موجود مسبقاً.","missing":"الحساب غير موجود.",auth:"انتهت الجلسة، حدّث الصفحة وادخل من جديد.",forbidden:"هذه الصفحة للمدير الأساسي فقط.","bad-request":"طلب غير صالح."};
  var PLAB=[["breaking","الأخبار العاجلة"],["news_local","أخبار: محلي"],["news_world","أخبار: دولي"],["news_sports","أخبار: رياضة"],["news_economy","أخبار: اقتصاد"],["news_culture","أخبار: ثقافة"],["news_read","اقرأ (المقالات)"],["news_video","الفيديو"],["news_shorts","SHORTS"],["lead","الخبر الرئيسي (أهم خبر)"],["markets","الأسواق"],["social","روابط التواصل وبيانات الإعلان"],["jobs","الوظائف"],["ads_top","الإعلان العلوي"],["ads_bottom","الإعلان السفلي"],["ads_side","الإعلان الجانبي"]];
  function permGroup(checked){
    var g=h("div","display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;flex-basis:100%;margin:4px 0 6px;font-size:.88rem"), boxes={};
    PLAB.forEach(function(x){ var l=h("label","display:flex;gap:6px;align-items:center;cursor:pointer"), c=document.createElement("input"); c.type="checkbox"; c.checked=!!(checked&&checked.indexOf(x[0])>=0); c.style.cssText="width:auto;margin:0"; boxes[x[0]]=c; l.appendChild(c); l.appendChild(document.createTextNode(x[1])); g.appendChild(l); });
    g.get=function(){ return PLAB.filter(function(x){ return boxes[x[0]].checked; }).map(function(x){ return x[0]; }); };
    return g;
  }
  function openUsers(){
    var ov=h("div","position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px");
    var bx=h("div","background:#fff;color:#2b3a33;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:22px;border-top:8px solid #5a7567;font:15px/1.8 'Noto Kufi Arabic',Tahoma,sans-serif");
    bx.setAttribute("dir","rtl"); bx.setAttribute("lang","ar"); bx.setAttribute("role","dialog"); bx.setAttribute("aria-label","المستخدمون");
    bx.appendChild(h("h2","margin:0 0 6px;font-size:1.2rem;color:#5a7567","المستخدمون (الموظفين)"));
    bx.appendChild(h("p","margin:0 0 10px;font-size:.9rem;color:#555","كل موظف يدخل باسمه وكلمة سره من زر Log in، ويشتغل فقط على الإدارات التي تحددها له أدناه، ولا يرى غيرها. وحدك تشوف هذه الصفحة."));
    var list=h("div","margin:0 0 12px"), st=h("p","min-height:1.6em;margin:6px 0;color:#C8102E;font-size:.9rem"); st.setAttribute("role","status");
    function btn(t,bg){ var b=h("button","padding:4px 12px;border:1px solid #5a7567;background:"+(bg?"#5a7567":"#fff")+";color:"+(bg?"#fff":"#5a7567")+";font:inherit;font-size:.85rem;cursor:pointer",t); b.type="button"; return b; }
    function inp(ph,type){ var i=h("input","padding:8px;border:1px solid #5a7567;font:inherit;direction:ltr;min-width:0;flex:1"); i.type=type||"text"; i.placeholder=ph; i.autocomplete="off"; i.setAttribute("aria-label",ph); return i; }
    function call(body,okMsg){
      st.style.color="#2b3a33"; st.textContent="جارٍ الحفظ...";
      return api("users","POST",body).then(function(){ st.style.color="#2b6b3a"; st.textContent=okMsg; return refresh(); })
        .catch(function(e){ st.style.color="#C8102E"; st.textContent=UERR[e.message]||"تعذّر التنفيذ، حاول مرة أخرى."; });
    }
    function refresh(){
      return api("users").then(function(j){
        list.textContent="";
        if(!j.users.length) list.appendChild(h("p","color:#777","ما في موظفين بعد."));
        j.users.forEach(function(u){
          var row=h("div","display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #dde4e0;flex-wrap:wrap");
          row.appendChild(h("strong","direction:ltr",u.username));
          var act=h("span","display:flex;gap:6px");
          var pw=btn("تغيير كلمة السر"), del=btn("حذف");
          pw.onclick=function(){ var p=window.prompt("كلمة السر الجديدة لـ "+u.username+" (8 أحرف على الأقل):"); if(p) call({action:"password",username:u.username,password:p},"تم تغيير كلمة السر."); };
          del.onclick=function(){ if(window.confirm("حذف حساب "+u.username+"؟")) call({action:"delete",username:u.username},"تم حذف الحساب."); };
          act.appendChild(pw); act.appendChild(del); row.appendChild(act);
          var pb=h("div","flex-basis:100%"); pb.appendChild(h("div","font-size:.85rem;color:#5a7567;font-weight:700","الإدارات المسموحة لهذا الموظف:"+(u.legacy?" (حساب قديم: كل الصلاحيات حتى تحفظ اختيارك)":"")));
          var grp=permGroup(u.perms), sp=btn("حفظ الصلاحيات",true); sp.onclick=function(){ call({action:"perms",username:u.username,perms:grp.get()},"تم حفظ صلاحيات "+u.username+". تُطبَّق فوراً."); };
          pb.appendChild(grp); pb.appendChild(sp); row.appendChild(pb); list.appendChild(row);
        });
      }).catch(function(e){ st.style.color="#C8102E"; st.textContent=UERR[e.message]||"تعذّر تحميل القائمة."; });
    }
    bx.appendChild(list);
    bx.appendChild(h("h3","margin:8px 0 4px;font-size:1rem;color:#5a7567","إضافة موظف"));
    var add=h("form","display:flex;gap:8px;flex-wrap:wrap"), nu=inp("اسم المستخدم (إنجليزي)"), np=inp("كلمة السر (8 أحرف+)","text"), go=btn("إضافة",true); go.type="submit";
    var addPerms=permGroup([]); add.appendChild(nu); add.appendChild(np); add.appendChild(h("div","flex-basis:100%;font-size:.85rem;color:#5a7567;font-weight:700","الإدارات المسموحة لهذا الموظف:")); add.appendChild(addPerms); add.appendChild(go);
    add.addEventListener("submit",function(ev){ ev.preventDefault(); call({action:"add",username:nu.value,password:np.value,perms:addPerms.get()},"تمت إضافة الموظف. يقدر يدخل الآن.").then(function(){ if(st.style.color!=="rgb(200, 16, 46)"){ nu.value=""; np.value=""; } }); });
    bx.appendChild(add); bx.appendChild(st);
    var close=btn("إغلاق"); close.style.marginTop="8px"; close.onclick=function(){ ov.remove(); }; bx.appendChild(close);
    ov.appendChild(bx); document.body.appendChild(ov); refresh(); nu.focus();
    ov.addEventListener("keydown",function(e){ if(e.key==="Escape") ov.remove(); });
  }
  function adminBar(){
    var b=h("div","position:fixed;inset-inline-start:16px;bottom:12px;z-index:99998;display:flex;gap:8px;align-items:center;background:#5a7567;color:#fff;padding:6px 12px;font:600 13px 'Noto Kufi Arabic',Tahoma,sans-serif");
    b.appendChild(h("span",null,"وضع المدير"));
    var x=h("button","border:1px solid #fff;background:transparent;color:#fff;padding:2px 10px;font:inherit;cursor:pointer","خروج"); x.type="button";
    x.onclick=function(){ api("logout","POST",{}).catch(function(){}).then(function(){ location.reload(); }); };
    if(owner){ var u=h("button","border:1px solid #fff;background:transparent;color:#fff;padding:2px 10px;font:inherit;cursor:pointer","المستخدمون"); u.type="button"; u.onclick=openUsers; b.appendChild(u); }
    /* maintenance mode: label for everyone logged in, switch for the owner */
    var mlab=h("span","background:#C8102E;padding:0 8px","الموقع مغلق للجمهور"); mlab.hidden=true; b.insertBefore(mlab,b.children[1]||null);
    var mb=null, mOn=false;
    if(owner){ mb=h("button","border:1px solid #fff;background:transparent;color:#fff;padding:2px 10px;font:inherit;cursor:pointer","…"); mb.type="button"; b.appendChild(mb); }
    function showM(){ mlab.hidden=!mOn; if(mb) mb.textContent=mOn?"فتح الموقع للجمهور":"إغلاق الموقع للجمهور"; }
    api("maintenance").then(function(j){ mOn=!!j.maintenance; showM(); }).catch(function(){ if(mb) mb.remove(); });
    if(mb){ var mArmed=false, mT=null;
      mb.onclick=function(){
        var want=!mOn;
        if(!mArmed){ mArmed=true; mb.textContent=want?"تأكيد الإغلاق؟":"تأكيد الفتح؟"; mT=setTimeout(function(){ mArmed=false; showM(); },5000); return; }
        clearTimeout(mT); mArmed=false; mb.disabled=true;
        api("maintenance","POST",{on:want}).then(function(){ mOn=want; showM();
          toast(want?"سيُغلق الموقع أمام الجمهور خلال دقيقة تقريباً. أنت وفريقك سترونه كالمعتاد بعد الدخول.":"سيُفتح الموقع للجمهور خلال دقيقة تقريباً."); })
          .catch(function(){ showM(); toast("تعذّر التغيير، حاول مرة أخرى.",true); })
          .then(function(){ mb.disabled=false; });
      };
    }
    b.appendChild(x); document.body.appendChild(b);
  }
  function footerLink(){
    var f=document.querySelector("footer.ft")||document.querySelector("footer"); if(!f) return;
    var a=h("a","display:inline-block;margin:14px 16px 0;padding:6px 16px;border:1px solid currentColor;font:600 .95rem 'Noto Kufi Arabic',Tahoma,sans-serif;cursor:pointer;color:inherit;text-decoration:none","Log in");
    a.href="#admin"; a.setAttribute("rel","nofollow"); f.appendChild(a);
    a.addEventListener("click",function(e){ e.preventDefault(); openLogin(); });
  }
  function boot(){
    load().then(function(){
      if(admin) adminBar(); else { footerLink(); if(location.hash==="#admin") openLogin(); }
    });
    window.addEventListener("hashchange",function(){ if(!admin&&location.hash==="#admin") openLogin(); });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();

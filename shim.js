/* NABDA static shim: serves the site's "db" from data/site.json (read-only) and turns the two forms into e-mail. */
(function(){
  var CFG=window.NABDA_CONFIG||{};
  var store={}, ready=null;
  function load(){
    if(ready) return ready;
    ready=fetch("data/site.json?v="+Math.floor(Date.now()/60000),{cache:"no-cache"})
      .then(function(r){ if(!r.ok) throw new Error("data"); return r.json(); })
      .then(function(j){ Object.keys(j).forEach(function(c){ Object.keys(j[c]).forEach(function(id){ store[c+"/"+id]={id:id,data:j[c][id]}; }); }); return true; })
      .catch(function(){ return false; });
    return ready;
  }
  function colDocs(c){ return Object.keys(store).filter(function(k){ return k.indexOf(c+"/")===0 && k.split("/").length===2; }).map(function(k){ return store[k]; }); }
  function snapOf(docs){ return {docs:docs.map(function(d){ return {id:d.id,exists:true,data:function(){ return d.data; }}; }),size:docs.length,empty:!docs.length}; }
  function docSnap(p,id){ var d=store[p]; return {id:id,exists:!!d,data:function(){ return d&&d.data; }}; }
  function sendMessage(obj){
    var list=(obj&&obj.list)||[], it=list[list.length-1]||{}, who=obj&&obj.name||"زائر";
    var subject=(it.k==="ad"?"طلب إعلان":"رسالة من الموقع")+" - "+who;
    var lines=["الاسم: "+who];
    if(it.p) lines.push("الهاتف: "+it.p);
    if(it.e) lines.push("البريد: "+it.e);
    if(it.m) lines.push("", it.m);
    var body=lines.join("\n");
    if(CFG.web3formsKey){
      return fetch("https://api.web3forms.com/submit",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({access_key:CFG.web3formsKey,subject:subject,name:who,message:body,from_name:"NABDA"})})
        .then(function(r){ return r.json(); }).then(function(j){ if(!j.success) throw new Error("send"); });
    }
    if(CFG.email){
      window.location.href="mailto:"+CFG.email+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
      return Promise.resolve();
    }
    return Promise.reject(new Error("no-channel"));
  }
  function mkDoc(p){
    var id=p.split("/").pop(), isMsg=p.indexOf("messages/")===0;
    return {
      get:function(){ return Promise.resolve(isMsg?{id:id,exists:false,data:function(){ return null; }}:docSnap(p,id)); },
      set:function(x){ if(isMsg) return sendMessage(x); return Promise.reject({code:"invalid_argument"}); },
      update:function(){ return Promise.reject({code:"invalid_argument"}); },
      delete:function(){ return Promise.reject({code:"invalid_argument"}); },
      onSnapshot:function(n){ setTimeout(function(){ n(docSnap(p,id)); },0); return function(){}; }
    };
  }
  var db={
    doc:mkDoc,
    collection:function(c){
      function q(order,dir){ return {
        orderBy:function(f,d){ return q(f,d||"asc"); },
        onSnapshot:function(n){ setTimeout(function(){ var docs=colDocs(c).slice();
          if(order){ docs.sort(function(a,b){ return (dir==="desc"?-1:1)*((a.data[order]||0)-(b.data[order]||0)); }); }
          n(snapOf(docs)); },0); return function(){}; }
      }; }
      var base=q(null,"asc");
      base.add=function(){ return Promise.reject({code:"invalid_argument"}); };
      base.doc=function(id){ return mkDoc(c+"/"+id); };
      return base;
    }
  };
  var vid="v"+Math.random().toString(36).slice(2,10);
  var user={canEdit:function(){ return Promise.resolve(false); }, isOwner:function(){ return Promise.resolve(false); }, id:function(){ return Promise.resolve((CFG.web3formsKey||CFG.email)?vid:null); }};
  window.claude={use:function(n){
    if(n==="db") return load().then(function(ok){ return ok?db:null; });
    if(n==="user") return Promise.resolve(user);
    return Promise.resolve(null);
  }};
})();

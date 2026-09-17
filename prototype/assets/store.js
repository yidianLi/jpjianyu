/* 监狱公司物料管理系统 · 共享演示数据中心
 * 用法：在 app.html 和各 pages/*.html 中 <script src="../assets/store.js"></script> 即可连起来
 * 原理：localStorage 持久化 + BroadcastChannel 实时同步 + postMessage 通知壳 */
(function(){
  var KEY='jm_wms_demo_v1';
  var DEF={
    user:{name:'张建国',role:'仓库负责人',scope:'外仓WH-A · 内仓1/2 · 一监区'},
    stock:{waiA_mi:8420,nei1_mi:3160,nei2_jian:1900,keYong_mi:7980,daiJian_mi:440},
    todos:[{id:'TL2026091201',t:'退料待判定',n:'120米'},{id:'ZS2026091204',t:'直送待接收',n:'800米'},{id:'DB2026091202',t:'调拨待接收',n:'2000件'}],
    bell:5, audit:[{time:'08:31',txt:'SL2026091209 修改 120米→1200米 · 张建国'}]
  };
  function load(){ try{var s=localStorage.getItem(KEY); if(!s){localStorage.setItem(KEY,JSON.stringify(DEF)); return JSON.parse(JSON.stringify(DEF));} return JSON.parse(s);}catch(e){return JSON.parse(JSON.stringify(DEF));} }
  function save(s){ try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){} try{bc.postMessage({type:'sync',state:s});}catch(e){} try{parent.postMessage({from:'wms-store',type:'sync',state:s},'*');}catch(e){} }
  var bc=null; try{bc=new BroadcastChannel('jm_wms'); bc.onmessage=function(ev){ if(ev.data&&ev.data.type==='sync'){ try{localStorage.setItem(KEY,JSON.stringify(ev.data.state));}catch(e){} document.dispatchEvent(new CustomEvent('wms:sync',{detail:ev.data.state})); }; };}catch(e){}
  window.Store={
    get:function(){return load();},
    set:function(fn){var s=load(); fn(s); save(s); return s;},
    addAudit:function(txt){return this.set(function(s){var d=new Date();var hm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); s.audit.unshift({time:hm,txt:txt}); s.audit=s.audit.slice(0,30);});},
    toast:function(msg,kind){ var d=document.getElementById('wms-toast'); if(!d){d=document.createElement('div');d.id='wms-toast';d.style.cssText='position:fixed;bottom:max(24px,env(safe-area-inset-bottom));left:50%;max-width:calc(100vw - 32px);transform:translateX(-50%);background:#0f172a;color:#fff;font-size:12px;padding:10px 18px;border-radius:99px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.3);text-align:center';d.setAttribute('role','status');d.setAttribute('aria-live','polite');d.setAttribute('aria-atomic','true');document.body.appendChild(d);} d.textContent=msg; d.style.background=kind==='error'?'#b91c1c':'#0f172a'; d.setAttribute('role',kind==='error'?'alert':'status'); d.setAttribute('aria-live',kind==='error'?'assertive':'polite'); d.style.display='block'; clearTimeout(d._t); d._t=setTimeout(function(){d.style.display='none';},2300); try{parent.postMessage({from:'wms-store',type:'toast',msg:msg},'*');}catch(e){} }
  };
  window.addEventListener('message',function(e){ if(e.data&&e.data.from==='wms-store'&&e.data.type==='sync'){ try{localStorage.setItem(KEY,JSON.stringify(e.data.state));}catch(err){} document.dispatchEvent(new CustomEvent('wms:sync',{detail:e.data.state})); } });
})();

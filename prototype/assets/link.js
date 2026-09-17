/* 子页面联通补丁：被 app.html 以 iframe 嵌入时（?from=app）自动生效
 * 功能：1) 同步 Store 数据  2) 提供 goTo 跨页跳转  3) 顶部显示“系统模式”条 */
(function(){
  var IN_APP = /from=app/.test(location.search);
  if(!IN_APP) return;
  // app.html 已提供统一侧栏与顶部栏，嵌入页只保留业务内容，避免出现“双侧栏/双顶栏”。
  (function hideEmbeddedShell(){
    function apply(){
      document.body.classList.add('embedded-app');
      if(!document.getElementById('embedded-app-style')){
        var st=document.createElement('style'); st.id='embedded-app-style';
        st.textContent='.hidden{display:none!important}body.embedded-app>div.flex>aside{display:none!important}body.embedded-app>div.flex>div.flex-1>header{display:none!important}body.embedded-app>div.flex>div.flex-1{width:100%!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}@media (max-width:900px){.grid-cols-6{grid-template-columns:repeat(3,minmax(0,1fr))!important}.grid-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))!important}.grid-cols-3{grid-template-columns:1fr!important}.w-\[620px\],.w-\[560px\],.w-\[520px\],.w-\[440px\],.w-\[420px\]{width:min(94vw,620px)!important}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}';
        document.head.appendChild(st);
      }
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply); else apply();
  })();
  function goTo(id){ try{ parent.go(id); }catch(e){ location.href='../app.html?page='+id; } }
  window.goTo = goTo;
  // 数据同步刷新示例：如页面里有 [data-bind] 可自动填
  function refresh(){
    if(!window.Store) return;
    var s = Store.get();
    document.querySelectorAll('[data-bind="waiA"]').forEach(function(el){ el.textContent = s.stock.waiA_mi.toLocaleString(); });
    try{ var tip = document.getElementById('syncTip'); if(tip) tip.textContent = '已连通 · 外仓 '+s.stock.waiA_mi; }catch(e){}
  }
  document.addEventListener('wms:sync', refresh);
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('img:not([alt])').forEach(function(img){ img.setAttribute('alt','物料管理系统业务图片'); });
    document.querySelectorAll('button:not([aria-label])').forEach(function(btn){ if(!btn.textContent.trim()){ var i=btn.querySelector('i'); btn.setAttribute('aria-label', i&&i.className.indexOf('xmark')>-1 ? '关闭' : '操作'); } });
    if(typeof window.wmsEnhancePage==='function') window.wmsEnhancePage();
    refresh();
    // 顶部提示条
    var bar = document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;z-index:60;background:#0f1e3a;color:#cfe3ff;font-size:11px;padding:6px 12px;display:flex;gap:8px;align-items:center';
    bar.innerHTML = '<span>● 系统联通模式（app.html）· 数据跨页同步 · 点击可跳：</span>'
      +'<button data-g="receipt" style="background:#2563eb;border-radius:99px;padding:2px 10px;color:#fff">送料</button>'
      +'<button data-g="transfer" style="background:#2563eb;border-radius:99px;padding:2px 10px;color:#fff">调拨</button>'
      +'<button data-g="workshop" style="background:#2563eb;border-radius:99px;padding:2px 10px;color:#fff">领料</button>'
      +'<button data-g="return" style="background:#2563eb;border-radius:99px;padding:2px 10px;color:#fff">退料</button>'
      +'<button data-g="stocktake" style="background:#2563eb;border-radius:99px;padding:2px 10px;color:#fff">盘点</button>'
      +'<span style="margin-left:auto;opacity:.7">本条仅在 app.html 中出现，单独打开页面时隐藏</span>';
    document.body.prepend(bar);
    bar.querySelectorAll('[data-g]').forEach(function(b){ b.onclick = function(){ goTo(b.getAttribute('data-g')); }; });
    // 把页面内原 toast 也同步到底栏
    if(window.Store && !window.__wms_hooked){
      window.__wms_hooked = true;
      var old = window.toast;
      if(typeof old === 'function'){
        window.toast = function(msg){ try{ Store.toast(msg); }catch(e){} return old(msg); };
      }
    }
  });
})();

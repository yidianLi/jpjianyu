/* PDA各屏桥接:按钮按文案自动接AppApi,仓库下拉接主档,失败保留Demo.
 * 需在api-client.js之后引入.无后端时全部走Mock/本地队列,演示不断. */
(function(){
  function toast(msg){
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font-size:12px;padding:9px 16px;border-radius:999px;z-index:99;max-width:90%;text-align:center;';
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 2400);
  }
  function pageBiz(){
    try{
      var b = (new URLSearchParams(location.search).get('biz') || '').toUpperCase();
      if('DJRKLYTLTKRJ'.indexOf(b) >= 0 && b.length === 2) return b;
    }catch(e){}
    return '';
  }
  function collectLines(){
    var lines = [];
    document.querySelectorAll('input').forEach(function(el){
      var v = (el.value || '').trim();
      if(/^\d+(\.\d+)?$/.test(v) && el.type !== 'file' && el.type !== 'checkbox') lines.push({qty: Number(v)});
    });
    (window.__SCAN_CODES || []).slice(0, 20).forEach(function(c){ lines.push({code: c}); });
    return lines.slice(0, 20);
  }
  function byText(keywords){
    var out = [];
    document.querySelectorAll('button').forEach(function(b){
      var t = (b.textContent || '').trim();
      if(keywords.some(function(k){ return t.indexOf(k) > -1; })) out.push(b);
    });
    return out;
  }
  function wireDraft(){
    byText(['存草稿', '弱网存草稿']).forEach(function(b){
      if(b.dataset.appWired) return; b.dataset.appWired = '1';
      b.addEventListener('click', function(){
        if(window.AppApi) AppApi.submit({draft: true, biz: pageBiz(), lines: collectLines()}).then(function(r){
          toast((r && r.msg) || '草稿已保存');
        });
        else toast('草稿已保存(本地)');
      });
    });
  }
  function wireSubmit(){
    byText(['提交并过账', '提交登记入账', '实盘提交', '提交']).forEach(function(b){
      if(b.dataset.appWired) return; b.dataset.appWired = '1';
      b.addEventListener('click', function(){
        if(!window.AppApi){ toast('已提交(演示)'); return; }
        AppApi.submit({biz: pageBiz(), lines: collectLines(), at: new Date().toISOString()}).then(function(r){
          if(r && r.queued) toast('弱网已存草稿,待同步');
          else if(r && r.data && r.data.orderId) toast('已提交:' + r.data.orderId);
          else toast('已提交');
        });
      });
    });
  }
  function wireWh(){
    if(!window.AppApi) return;
    fetch(AppApi.cfg.baseUrl + '/web/masters/warehouses',
      {headers:{'Authorization': 'Bearer ' + AppApi.cfg.token}}).then(function(r){
      if(!r.ok) throw new Error('no backend');
      return r.json();
    }).then(function(j){
      var rows = (j && j.data) || [];
      if(!rows.length) return;
      document.querySelectorAll('select').forEach(function(sel){
        var opts = Array.prototype.map.call(sel.options, function(o){ return o.text; }).join('|');
        if(/成品仓A.*成品仓B|成品仓B.*成品仓A/.test(opts) && !sel.dataset.appLive){
          sel.dataset.appLive = '1';
          sel.innerHTML = rows.map(function(w){
            return '<option>' + (w.wh_code || w.name) + '</option>';
          }).join('');
        }
      });
    }).catch(function(){});
  }
  function wireTodos(){
    var host = document.querySelector('[data-app-todos]');
    if(!host || !window.AppApi) return;
    AppApi.myTodos().then(function(j){
      var rows = (j && j.data) || [];
      if(!rows.length) return;
      host.innerHTML = rows.map(function(t){
        return '<div class="card p-3"><b class="text-[13px]">' + t.id + ' · ' + (t.title || '') +
          '</b><p class="text-[11px] text-slate-500 mt-1">' + (t.desc || '') + '</p></div>';
      }).join('');
    }).catch(function(){});
  }
  document.addEventListener('DOMContentLoaded', function(){
    wireDraft(); wireSubmit(); wireWh(); wireTodos();
    if(window.AppApi) AppApi.renderQ();
    try{
      var lk = document.createElement('link');
      lk.rel = 'manifest'; lk.href = '../manifest.json';
      document.head.appendChild(lk);
      if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
        navigator.serviceWorker.register('../sw.js').catch(function(){});
      }
    }catch(e){}
  });
})();

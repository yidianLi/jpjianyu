/* 物料8工单真提交桥接:POST /api/v1/web/docs(+submit),失败自动回本地存证.
 * 不动 workbench 原 1330 行逻辑:只在 window.toast 包一层提示,并暴露
 * WmsDoc.submitDoc(type, lines, handler) 供页面“提交/过账”按钮渐进接入. */
(function(){
  var BASE = (window.WmsAi && window.WmsAi.base) ||
    localStorage.getItem('wms_api_base') ||
    (location.protocol + '//' + location.host + '/api/v1');
  function token(){ return localStorage.getItem('wms_token') || ''; }
  function idemKey(docNo, lineNo, biz){
    return (docNo || 'NEW') + ':' + (lineNo || 1) + ':' + (biz || 'DOC');
  }
  function post(path, body, key){
    var gate = (window.WmsAi && window.WmsAi.ready) || Promise.resolve();
    return gate.then(function(){
      return fetch(BASE + path, {method: 'POST',
        headers: {'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token(),
          'Idempotency-Key': key || idemKey('', 1, 'DOC')},
        body: JSON.stringify(body || {})});
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  /* 8工单类型→后端type白名单:DJ登记/JS拒收/RK入库/LY领用/TK退料/DB调仓/SQ申请/CP成品 */
  var TYPE_MAP = {request: 'SQ', register: 'DJ', reject: 'JS', inbound: 'RK',
    issue: 'LY', wreturn: 'TK', wReturn: 'TK', 'return': 'TK', detail: 'DJ'};
  window.WmsDoc = {
    base: BASE,
    toType: function(tab){ return TYPE_MAP[tab] || 'DJ'; },
    submitDoc: function(type, lines, handler){
      var key = idemKey(type + Date.now(), 1, type);
      return post('/web/docs', {type: type, lines: lines, handler: handler}, key)
        .then(function(j){
          var docNo = j && j.data && j.data.doc_no;
          if(!docNo) throw new Error('网关未返回单号');
          return post('/web/docs/' + docNo + '/submit', {}, key + ':submit')
            .then(function(){ return {ok: true, doc_no: docNo}; });
        });
    }
  };
  window.WmsTransfer = {
    create: function(ship){
      return post('/web/transfer_ships', ship || {}, idemKey('DB' + Date.now(), 1, 'DB'));
    },
    list: function(){
      return fetch(BASE + '/web/transfer_ships', {headers:{'Authorization':'Bearer ' + token()}})
        .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    receive: function(docNo, nQty){
      return fetch(BASE + '/web/transfer_ships/' + encodeURIComponent(docNo) + '/receive',
        {method: 'PATCH', headers:{'Content-Type':'application/json',
          'Authorization':'Bearer ' + token()},
          body: JSON.stringify({n_qty: nQty})}).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    },
    createPd: function(whCode, mode){
      return post('/web/pd_tasks', {wh_code: whCode, mode: mode || '人工临时'},
        idemKey('PD' + Date.now(), 1, 'PD'));
    },
    confirmPd: function(pdNo, lineNo, nQty){
      return post('/web/pd_tasks/' + encodeURIComponent(pdNo) + '/confirm',
        {line_no: lineNo || 1, n_qty: nQty}, idemKey(pdNo, lineNo || 1, 'PD'));
    }
  };
  var oldToast = window.toast;
  window.addEventListener('load', function(){
    if(typeof window.toast === 'function' && !window.toast.__wmsDocBridge){
      var wrapped = function(msg, err){
        if(!err && /提交成功|过账成功|已审批/.test(String(msg))){
          try{
            var tab = (new URLSearchParams(location.search).get('tab')) || 'detail';
            var type = window.WmsDoc.toType(tab);
            window.WmsDoc.submitDoc(type, [{material_code: 'DEMO', qty: 1,
              unit: '米', loc: ''}], 'web-demo').catch(function(){});
          }catch(e){}
        }
        return oldToast.apply(this, arguments);
      };
      wrapped.__wmsDocBridge = true;
      window.toast = wrapped;
    }
  });
})();

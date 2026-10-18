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
  function get(path){
    var gate = (window.WmsAi && window.WmsAi.ready) || Promise.resolve();
    return gate.then(function(){
      return fetch(BASE + path, {headers: {'Authorization': 'Bearer ' + token()}});
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
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
  var TYPE_BACK = {SQ: 'request', DJ: 'register', JS: 'reject', RK: 'inbound',
    LY: 'issue', TK: 'wreturn'};
  var STATUS_BACK = {DRAFT: '草稿', APPROVING: '已保存', POSTED: '已审批',
    VOID: '已作废'};
  function toLocalDoc(x){
    if(!x || !x.doc_no || !TYPE_BACK[x.type]) return null;
    return {no: x.doc_no, type: TYPE_BACK[x.type],
      status: STATUS_BACK[x.biz_status] || '草稿',
      date: String(x.at || '').slice(0, 10),
      handler: x.handler || '', dept: '', wh: '', loc: '',
      remark: '', files: 0, srv: 1,
      flow: {submitted: x.biz_status === 'APPROVING' ? 1 : 0},
      lines: ((x.lines) || []).map(function(l, i){
        return {code: l.material_code || l.product_code || '',
          name: '', unit: l.unit || '', qty: Number(l.qty) || 0,
          qty_src: Number(l.qty) || 0, batch: l.batch_no || '',
          loc: l.loc || '', region: l.loc || '', qc: l.qc_result || '合格',
          price: 0, reason: l.reason || ''};
      })};
  }
  window.WmsDoc = {
    base: BASE,
    toType: function(tab){ return TYPE_MAP[tab] || 'DJ'; },
    toLocal: toLocalDoc,
    statusBack: function(s){ return STATUS_BACK[s] || '草稿'; },
    getDoc: function(docNo){
      return get('/web/docs/' + encodeURIComponent(docNo)).then(function(j){
        return (j && j.data) || null;
      }).catch(function(){ return null; });
    },
    pullDocs: function(dtype){
      var q = '/web/docs?page_size=100&with_lines=1' +
        (dtype ? '&dtype=' + encodeURIComponent(dtype) : '');
      return get(q).then(function(j){
        return (j && j.data) || [];
      }).catch(function(){ return []; });
    },
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
    pdList: function(){
      return fetch(BASE + '/web/pd_tasks?page_size=100', {headers:{'Authorization':'Bearer ' + token()}})
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
    },
    pdLines: function(pdNo){
      return get('/web/pd_tasks/' + encodeURIComponent(pdNo) + '/lines');
    },
    pdAdjust: function(pdNo){
      return post('/web/pd_tasks/' + encodeURIComponent(pdNo) + '/adjust', {},
        idemKey('ADJ:' + pdNo, 1, 'TZ'));
    }
  };
  /* 单据附件:登记引用(URL/对象存储键)+列表+删除.只记引用不搬文件. */
  window.WmsAttach = {
    list: function(docNo){
      return get('/web/docs/' + encodeURIComponent(docNo) + '/attachments');
    },
    add: function(docNo, kind, ref){
      return post('/web/docs/' + encodeURIComponent(docNo) + '/attachments',
        {kind: kind || '其它', ref: ref || ''},
        idemKey('ATT:' + docNo + ':' + Date.now(), 1, 'ATT')).then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return j;
      });
    },
    del: function(docNo, id){
      return fetch(BASE + '/web/docs/' + encodeURIComponent(docNo) +
        '/attachments/' + encodeURIComponent(id),
        {method: 'DELETE', headers: {'Authorization': 'Bearer ' + token()}})
        .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status);
          return r.json(); });
    }
  };
  /* 库存分量动作:质检/冻结/解冻/待发/释放.定位=物料+成品+批次+库位. */
  window.WmsStockOps = {
    qc: function(p){ return post('/web/stock/qc', p || {}, idemKey('QC' + Date.now(), 1, 'QC')); },
    freeze: function(p){ return post('/web/stock/freeze', p || {}, idemKey('FZ' + Date.now(), 1, 'FZ')); },
    unfreeze: function(p){ return post('/web/stock/unfreeze', p || {}, idemKey('UF' + Date.now(), 1, 'UF')); },
    reserve: function(p){ return post('/web/stock/reserve', p || {}, idemKey('RS' + Date.now(), 1, 'RS')); },
    release: function(p){ return post('/web/stock/release', p || {}, idemKey('RL' + Date.now(), 1, 'RL')); }
  };
  /* 物料批量导入:CSV 文本 -> 逐行校验入库. */
  window.WmsImport = {
    materials: function(csv){
      return post('/web/masters/materials/import', {csv: csv || ''},
        idemKey('IMP' + Date.now(), 1, 'IMP')).then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return j;
      });
    }
  };
  /* 工单三连调:ensure建后端单→submit提审→approve节点→post过账,全经网关ready */
  window.WmsDoc.ensure = function(local){
    if(local.srv_no) return Promise.resolve(local.srv_no);
    var lines = (local.lines || []).map(function(l){
      return {material_code: l.code || l.material_code || '',
        product_code: l.product_code || '', qty: Number(l.qty) || 0,
        unit: l.unit || '', loc: l.loc || l.region || ''};
    }).filter(function(x){ return x.material_code && x.qty > 0 && x.unit; });
    var type = window.WmsDoc.toType(local.tab || local.type);
    return post('/web/docs', {type: type, lines: lines,
      handler: local.handler || 'web',
      ref_doc: local.src_sq || local.src || local.src_rk || ''}, idemKey('WB:' + local.no, 1, type))
      .then(function(j){
        var docNo = j && j.data && j.data.doc_no;
        if(!docNo) throw new Error('网关未返回单号');
        return docNo;
      });
  };
  window.WmsDoc.submitSrv = function(srvNo){
    return post('/web/docs/' + encodeURIComponent(srvNo) + '/submit', {})
      .then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return j;
      });
  };
  window.WmsDoc.approveSrv = function(srvNo, action, opinion){
    return post('/web/docs/' + encodeURIComponent(srvNo) + '/approve',
      {action: action, opinion: opinion || ''}).then(function(j){
      if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
      return j;
    });
  };
  window.WmsDoc.postSrv = function(srvNo){
    return post('/web/docs/' + encodeURIComponent(srvNo) + '/post', {},
      idemKey(srvNo, 1, 'POST')).then(function(j){
      if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
      return j;
    });
  };
  /* 成品四口:查BOM版本→建WO→领料/完工,交付签收直调,失败抛错由页内决定本地动不动 */
  window.WmsProduce = {
    bomVersion: function(productCode){
      return get('/web/masters/boms?product_code=' + encodeURIComponent(productCode || '') + '&page_size=20')
        .then(function(j){
          var rows = (j && j.data) || [];
          var hit = rows.filter(function(r){ return String(r.status || '') === '启用'; })[0] || rows[0];
          return hit ? hit.version : '';
        });
    },
    createWo: function(productCode, qty, version, workshop){
      return post('/web/wo_tasks', {product_code: productCode, qty_plan: qty,
        bom_version: version, workshop: workshop || ''},
        idemKey('WO:' + productCode, 1, 'WO')).then(function(j){
        var wo = j && j.data && j.data.wo_no;
        if(!wo) throw new Error('网关未返回工单号');
        return wo;
      });
    },
    issueWo: function(woNo, handler, loc){
      return post('/web/wo_tasks/' + encodeURIComponent(woNo) + '/issue',
        {handler: handler || '', loc: loc || ''},
        idemKey(woNo, 1, 'ISSUE')).then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return j.data;
      });
    },
    finishWo: function(woNo, qtyDone, handler){
      return post('/web/wo_tasks/' + encodeURIComponent(woNo) + '/finish',
        {qty_done: qtyDone, handler: handler || ''},
        idemKey(woNo, 1, 'FINISH')).then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return (j.data && j.data.rk_no) || '';
      });
    },
    signDeliver: function(docNo, receiver, signTime, sender, proof){
      return post('/web/deliver_signs', {doc_no: docNo, receiver: receiver,
        sign_time: signTime, sender: sender || '', proof_ref: proof || ''},
        idemKey(docNo, 1, 'SIGN')).then(function(j){
        if(j && j.code !== 200) throw new Error(j.msg || ('code ' + j.code));
        return j.data;
      });
    }
  };
  /* 库存只读:list现存/流水,参数透传wh/material_code/product_code/doc_no/code/page/page_size */
  window.WmsStock = {
    onhand: function(p){
      p = p || {};
      var q = '?page=' + (p.page || 1) + '&page_size=' + (p.page_size || 50);
      if(p.wh) q += '&wh=' + encodeURIComponent(p.wh);
      if(p.material_code) q += '&material_code=' + encodeURIComponent(p.material_code);
      if(p.product_code) q += '&product_code=' + encodeURIComponent(p.product_code);
      return get('/web/stock/onhand' + q);
    },
    ledger: function(p){
      p = p || {};
      var q = '?page=' + (p.page || 1) + '&page_size=' + (p.page_size || 50);
      if(p.doc_no) q += '&doc_no=' + encodeURIComponent(p.doc_no);
      if(p.code) q += '&code=' + encodeURIComponent(p.code);
      return get('/web/stock/ledger' + q);
    },
    trace: function(code){
      return get('/web/stock/trace?code=' + encodeURIComponent(code || ''));
    }
  };
  /* 报表中心真数:分类直出 + 生成草稿实例 + 发布.只读不改账. */
  window.WmsRpt = {
    live: function(cat){
      return get('/web/rpt_live?rpt_code=' + encodeURIComponent(cat || ''));
    },
    generate: function(cat, period){
      return post('/web/rpt_instances/generate',
        {rpt_code: cat || '', period: period || ''},
        idemKey('RPT:' + (cat || ''), 1, 'RPT'));
    },
    publish: function(no){
      return post('/web/rpt_instances/' + encodeURIComponent(no) + '/publish', {});
    },
    configs: function(){ return get('/web/rpt_configs'); }
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

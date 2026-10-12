/* 移动APP独立接口层 · 与PC完全解耦，仅通过后端REST API通信
 * PC: prototype/pages/*.html + assets/store.js (Web直连)
 * APP: prototype/mobile-app/index.html + api-client.js (App经此层，不直连PC，不共享localStorage)
 * 后端统一: /api/v1/app/* 移动端专用，/api/v1/web/* PC专用，共用业务库+审计
 * 对齐 backend/app/routers/app_.py：Bearer + X-Device-Id + X-Sign，扫码先库位后物料 */
(function(){
  var CFG = { baseUrl: localStorage.getItem('wms_app_base') ||
      (location.protocol + '//' + location.host + '/api/v1'),
    token: localStorage.getItem('wms_app_token') || '',
    deviceId: 'PDA-03', timeout: 1800 };
  var QUEUE_KEY='wms_app_offline_q_v1';
  /* 演示自动登录:无token时以demo免密登录换真token,失败保留Demo走Mock */
  try{
    if(!localStorage.getItem('wms_app_token')){
      fetch(CFG.baseUrl + '/web/auth/login', {method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:'demo'})}).then(function(r){
        if(!r.ok) throw new Error('login fail');
        return r.json();
      }).then(function(j){
        var t = j && j.data && j.data.token;
        if(t){ CFG.token = t; localStorage.setItem('wms_app_token', t); }
      }).catch(function(){});
    }
  }catch(e){}
  function qLoad(){ try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch(e){return[]} }
  function qSave(q){ try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}catch(e){} renderQ(); }
  function renderQ(){ var el=document.getElementById('syncBadge'); if(!el) return;
    var q=qLoad(); el.textContent = q.length? ('待同步 '+q.length) : '已同步'; el.className = q.length? 'text-[10px] px-2 py-0.5 rounded-full bg-orange-500 text-white':'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white'; }
  function signOf(body, ts){ var s=CFG.token+ts+JSON.stringify(body||{}); var h=0; for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;} return 'H'+h.toString(16); }
  // 仅无后端演示时模拟共用业务库；真实环境由 /app/checklists 返回。
  function mockChecklist(orderId){
    var saved=null;try{saved=JSON.parse(localStorage.getItem('wms_mock_backend_checklist_'+orderId)||'null')}catch(e){}
    var defaults=[
      {code:'HD-OXF-001',name:'牛津布',batch:'MB2026091003',unit:'米',deliveryQty:1200,receivedQty:1200,checked:true},
      {code:'HD-ZP-011',name:'拉链',batch:'MB2026090901',unit:'件',deliveryQty:2000,receivedQty:2000,checked:true},
      {code:'HD-NK-005',name:'纽扣',batch:'MB2026090905',unit:'件',deliveryQty:500,receivedQty:500,checked:false}];
    if(saved&&Array.isArray(saved.items))saved.items=saved.items.map(function(item){var base=defaults.find(function(x){return x.code===item.code;});return Object.assign({},base||{},item);});
    return {ok:true,mock:true,data:saved||{orderId:orderId,customer:'恒达服饰',status:'PENDING',items:defaults}};
  }
  async function req(path, opt){
    opt=opt||{}; var url=CFG.baseUrl + path;
    var ts=String(Date.now());
    var headers={'Content-Type':'application/json','Authorization':'Bearer '+CFG.token,'X-Device-Id':CFG.deviceId,'X-Timestamp':ts};
    if((opt.method||'GET')!=='GET'){ headers['X-Sign']=signOf(opt.body, ts); }
    try{
      var ctl=new AbortController(); var t=setTimeout(()=>ctl.abort(), CFG.timeout);
      var r=await fetch(url,{method:opt.method||'GET',headers:headers,body:opt.body?JSON.stringify(opt.body):undefined,signal:ctl.signal});
      clearTimeout(t); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json();
    }catch(e){
      // 演示降级：无后端时返回本地Mock，保持APP可独立演示
      if(opt.mock!==undefined) return opt.mock;
      return {ok:true, mock:true, msg:'(演示Mock) '+path};
    }
  }
  window.AppApi = {
    cfg:CFG, renderQ:renderQ,
    // 1.待办(仅本车间, 服务端按user_data_scope过滤)
    myTodos:function(){ return req('/app/todos?mine=1',{mock:{ok:true,data:[
      {id:'SL2026091209',type:'receipt_checklist',title:'送货单清单验收',desc:'恒达服饰 · 3项物料 · 现场逐行确认',deadline:'现在'},
      {id:'TL2026091201',type:'return',title:'退料待提交',desc:'牛津布 120米 · 原领LY2026091108',deadline:'10:00'},
      {id:'ZS2026091204',type:'receive',title:'直送待接收',desc:'里布 800米 · 裁剪车间',deadline:'11:30'}]}}); },
    // 2.扫码解析(先库位后物料SB，服务端校验归属/超领/重复)
    scan:function(code,orderId,loc){ return req('/app/scan',{method:'POST',body:{code:code,orderId:orderId,loc:loc||''},mock:{ok:true,data:{code:code,material:'HD-OXF-001 牛津布',qty:200,unit:'米',result: code.indexOf('DUP')>=0?'DUPLICATE':'OK'}}}); },
    // 3.拍照OCR(APP端压缩后上传, 只返回候选值)
    ocr:function(){ return req('/app/ocr',{method:'POST',body:{images:3},mock:{ok:true,data:{qty_ocr:'120米',qty_conf:0.62,customer:'恒达服饰'}}}); },
    // 4.送货单清单(移动端和PC端均以送货单明细为验收基准)
    getChecklist:function(orderId){ return req('/app/checklists?orderId='+encodeURIComponent(orderId),{mock:mockChecklist(orderId)}); },
    confirmChecklist:function(payload){
      if(!payload||!payload.items||!payload.items.length)return Promise.resolve({ok:false,code:'CHECKLIST_EMPTY',msg:'验收清单不能为空'});
      for(var i=0;i<payload.items.length;i++){var item=payload.items[i];if(!item.checked)return Promise.resolve({ok:false,code:'CHECKLIST_INCOMPLETE',msg:'请逐项确认清单'});if(Number(item.receivedQty)!==Number(item.deliveryQty)&&!String(item.reason||'').trim())return Promise.resolve({ok:false,code:'DIFF_REASON_REQUIRED',msg:'数量有差异时必须填写原因'});}
      if(!navigator.onLine){var q=qLoad();q.push({ts:Date.now(),type:'checklist_confirm',payload:payload});qSave(q);return Promise.resolve({ok:true,queued:true,msg:'弱网已保存验收草稿，待同步'});}
      return req('/app/checklists/confirm',{method:'POST',body:payload,mock:{ok:true,mock:true,data:{orderId:payload.orderId,status:'ACCEPTED',acceptedAt:'2026-09-12 09:12',acceptedBy:'李小明'}}}).then(function(r){
        if(r&&r.mock){try{localStorage.setItem('wms_mock_backend_checklist_'+payload.orderId,JSON.stringify({orderId:payload.orderId,customer:'恒达服饰',status:'ACCEPTED',items:payload.items}));}catch(e){}}
        return r;
      });
    },
    // 5.提交(登录账号+照片存证, 离线进队列 mobile_sync_queue)
    submit:function(payload){
      if(!navigator.onLine){ var q=qLoad(); q.push({ts:Date.now(),payload:payload}); qSave(q); return Promise.resolve({ok:true,queued:true,msg:'弱网已存草稿, 待同步'}); }
      return req('/app/submit',{method:'POST',body:payload,mock:{ok:true,data:{orderId:'LY2026091211'}}});
    },
    flushQueue:function(){ var q=qLoad(); if(!q.length) return req('/app/sync/flush',{method:'POST',mock:{ok:true,msg:'队列为空'}}); localStorage.setItem(QUEUE_KEY,'[]'); renderQ(); return req('/app/sync/flush',{method:'POST',mock:{ok:true,msg:'已同步 '+q.length+' 条, mobile_sync_queue已清空'}}); },
    mine:function(){ return {name:'李小明',role:'车间领料员',scope:'一监区/1栋/2层/缝制一车间/王班组',device:'PDA-03 · Android 12 · 扫描头Honeywell'}; }
  };
  document.addEventListener('DOMContentLoaded', renderQ);
})();

/* 移动APP独立接口层 · 与PC完全解耦，仅通过后端REST API通信
 * PC: prototype/pages/*.html + assets/store.js (Web直连)
 * APP: prototype/mobile-app/index.html + api-client.js (App经此层，不直连PC，不共享localStorage)
 * 后端统一: /api/v1/app/* 移动端专用，/api/v1/web/* PC专用，共用业务库+审计
 * 鉴权: /app/login 签发 device=PDA-03 的JWT;无token时弹出登录浮层;离线写本地队列待补传 */
(function(){
  var CFG = { baseUrl: localStorage.getItem('wms_app_base') ||
      (location.protocol + '//' + location.host + '/api/v1'),
    token: localStorage.getItem('wms_app_token') || '',
    deviceId: 'PDA-03', timeout: 120000 };
  var QUEUE_KEY = 'wms_app_offline_q_v1';
  var CRED = { user: localStorage.getItem('wms_app_user') || '',
               pwd: localStorage.getItem('wms_app_pwd') || '' };

  /* 离线队列:弱网/无网时写本地,flushQueue 联网后逐条补传 */
  function qLoad(){ try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch(e){return[]} }
  function qSave(q){ try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}catch(e){} renderQ(); }
  function renderQ(){ var el=document.getElementById('syncBadge'); if(!el) return;
    var q=qLoad(); el.textContent = q.length? ('待同步 '+q.length) : '已同步'; el.className = q.length? 'text-[10px] px-2 py-0.5 rounded-full bg-orange-500 text-white':'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white'; }
  function signOf(body, ts){ var s=CFG.token+ts+JSON.stringify(body||{}); var h=0; for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;} return 'H'+h.toString(16); }

  // 无后端演示时的本地清单占位(真实环境由 /app/checklists 返回)
  function mockChecklist(orderId){
    var saved=null;try{saved=JSON.parse(localStorage.getItem('wms_mock_backend_checklist_'+orderId)||'null')}catch(e){}
    var defaults=[
      {material_code:'HD-OXF-001',name:'牛津布',batch:'MB2026091003',unit:'米',delivery_qty:1200,received_qty:1200,checked:true},
      {material_code:'HD-ZP-011',name:'拉链',batch:'MB2026090901',unit:'件',delivery_qty:2000,received_qty:2000,checked:true},
      {material_code:'HD-NK-005',name:'纽扣',batch:'MB2026090905',unit:'件',delivery_qty:500,received_qty:500,checked:false}];
    if(saved&&Array.isArray(saved.items))saved.items=saved.items.map(function(item){var base=defaults.find(function(x){return x.material_code===item.material_code;});return Object.assign({},base||{},item);});
    return {ok:true,mock:true,data:saved||{orderId:orderId,customer:'恒达服饰',status:'PENDING',items:defaults}};
  }

  // 统一请求:成功返回真实JSON;业务错误(含401)原样返回 {ok:false,...} 不伪装;网络失败才降级mock/离线
  async function req(path, opt){
    opt=opt||{}; var url=CFG.baseUrl + path;
    var ts=String(Date.now());
    var headers={'Content-Type':'application/json','Authorization':'Bearer '+CFG.token,'X-Device-Id':CFG.deviceId,'X-Timestamp':ts};
    if((opt.method||'GET')!=='GET'){ headers['X-Sign']=signOf(opt.body, ts); }
    try{
      var ctl=new AbortController(); var t=setTimeout(function(){ctl.abort();}, CFG.timeout);
      var r=await fetch(url,{method:opt.method||'GET',headers:headers,body:opt.body?JSON.stringify(opt.body):undefined,signal:ctl.signal});
      clearTimeout(t);
      var j=await r.json().catch(function(){return {};});
      if(r.ok) return j;
      if(r.status===401){ // 令牌失效:清缓存并重新登录
        try{localStorage.removeItem('wms_app_token');}catch(e){}
        CFG.token=''; showLogin('登录已失效,请重新登录');
      }
      return j; // {ok:false, code:..., msg:...}
    }catch(e){
      if(opt.mock!==undefined) return opt.mock; // 业务占位(无后端演示)
      return {ok:false, code:'OFFLINE', mock:true, msg:'(离线/无后端) '+path};
    }
  }

  // 登录:校验账号密码,缓存 token+凭据
  async function login(username, password){
    var r=await fetch(CFG.baseUrl + '/app/login', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:username, password:password})});
    var j=await r.json().catch(function(){return {};});
    if(r.ok && j && j.ok && j.data && j.data.token){
      CFG.token=j.data.token; localStorage.setItem('wms_app_token', j.data.token);
      CRED.user=username; CRED.pwd=password;
      localStorage.setItem('wms_app_user', username);
      localStorage.setItem('wms_app_pwd', password);
      return j.data;
    }
    throw new Error((j && j.msg) || 'LOGIN_FAIL');
  }

  // 启动:确保已登录(有token直接过;有凭据静默登录;都没有弹浮层)
  async function boot(){
    if(CFG.token) return;
    if(CRED.user && CRED.pwd){ try{ await login(CRED.user, CRED.pwd); return; }catch(e){} }
    showLogin();
  }

  // 登录浮层
  var loginEl=null;
  function showLogin(msg){
    if(loginEl) return;
    var d=document.createElement('div'); d.id='appLogin';
    d.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(8,18,32,.82);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,"Microsoft YaHei",sans-serif';
    d.innerHTML='<div style="width:100%;max-width:340px;background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)">'+
      '<h3 style="margin:0 0 4px;font-size:17px;color:#10233f">现场作业登录</h3>'+
      '<p style="margin:0 0 14px;font-size:12px;color:#e0533d" id="loginErr">'+(msg||'请输入账号密码以接入后端')+'</p>'+
      '<input id="lu" placeholder="账号" autocomplete="username" style="width:100%;height:44px;border:1.5px solid #dde5ee;border-radius:12px;padding:0 12px;font-size:14px;box-sizing:border-box;margin-bottom:10px">'+
      '<input id="lp" type="password" placeholder="密码" autocomplete="current-password" style="width:100%;height:44px;border:1.5px solid #dde5ee;border-radius:12px;padding:0 12px;font-size:14px;box-sizing:border-box;margin-bottom:14px">'+
      '<button id="lb" style="width:100%;height:46px;border:0;border-radius:12px;background:#2f6fe4;color:#fff;font-size:15px;font-weight:700">登录</button>'+
      '<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">登录后可离线作业(本地草稿待联网补传)</p></div>';
    document.body.appendChild(d); loginEl=d;
    var u=d.querySelector('#lu'), p=d.querySelector('#lp'), b=d.querySelector('#lb'), err=d.querySelector('#loginErr');
    function doLogin(){
      var un=u.value.trim(), pw=p.value;
      if(!un||!pw){ err.style.color='#e0533d'; err.textContent='账号密码必填'; return; }
      err.style.color='#94a3b8'; err.textContent='登录中…'; b.disabled=true;
      login(un, pw).then(function(){
        if(loginEl){ loginEl.remove(); loginEl=null; }
        location.reload();
      }).catch(function(e){ b.disabled=false; err.style.color='#e0533d'; err.textContent='登录失败:'+e.message; });
    }
    b.onclick=doLogin;
    p.addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
    setTimeout(function(){ u.focus(); }, 50);
  }

  function logout(){
    try{ localStorage.removeItem('wms_app_token'); localStorage.removeItem('wms_app_user'); localStorage.removeItem('wms_app_pwd'); }catch(e){}
    CFG.token=''; location.reload();
  }

  // 移动端仅做扫码+清单确认+现场照片存证,不做OCR;故不提供图片OCR能力(PC端 /ai/ocr 负责识别)

  window.AppApi = {
    cfg: CFG, renderQ: renderQ, login: login, logout: logout, boot: boot,
    // 1.待办(服务端按user_data_scope过滤;无后端演示时返回本地占位)
    myTodos:function(){ return req('/app/todos?mine=1',{mock:{ok:true,data:[
      {doc_no:'SL2026091209',type:'receipt_checklist',biz_status:'DRAFT',handler:'恒达服饰 · 3项物料',at:'2026-09-12 09:00'},
      {doc_no:'TL2026091201',type:'return',biz_status:'APPROVING',handler:'牛津布 120米 · 原领LY2026091108',at:'2026-09-12 10:00'},
      {doc_no:'ZS2026091204',type:'receive',biz_status:'DRAFT',handler:'里布 800米 · 裁剪车间',at:'2026-09-12 11:30'}]}}); },
    // 2.扫码解析(先库位后物料SB，服务端校验归属/超领/重复；写scan_log)
    scan:function(code,orderId,loc){ return req('/app/scan',{method:'POST',body:{code:code,orderId:orderId,loc:loc||''}}); },
    // 2b.查码(无副作用)：仅解析条码为物料/库位，供清单行内"扫物料码"匹配，不写日志、不判重复
    lookup:function(code){ return req('/app/lookup?code='+encodeURIComponent(code||'')); },
    // 3.送货单清单(移动端和PC端均以送货单明细为验收基准)
    getChecklist:function(orderId){ return req('/app/checklists?orderId='+encodeURIComponent(orderId),{mock:mockChecklist(orderId)}); },
    confirmChecklist:function(payload){
      if(!payload||!payload.items||!payload.items.length)return Promise.resolve({ok:false,code:'CHECKLIST_EMPTY',msg:'验收清单不能为空'});
      for(var i=0;i<payload.items.length;i++){var item=payload.items[i];if(!item.checked)return Promise.resolve({ok:false,code:'CHECKLIST_INCOMPLETE',msg:'请逐项确认清单'});if(Number(item.received_qty)!==Number(item.delivery_qty)&&!String(item.reason||'').trim())return Promise.resolve({ok:false,code:'DIFF_REASON_REQUIRED',msg:'数量有差异时必须填写原因'});}
      if(!navigator.onLine){var q=qLoad();q.push({ts:Date.now(),type:'checklist_confirm',payload:payload});qSave(q);return Promise.resolve({ok:true,queued:true,msg:'弱网已保存验收草稿,待同步'});}
      return req('/app/checklists/confirm',{method:'POST',body:payload});
    },
    // 5.提交(登录账号+照片存证, 离线进队列)
    submit:function(payload){
      if(!navigator.onLine){ var q=qLoad(); q.push({ts:Date.now(),type:'submit',payload:payload}); qSave(q); return Promise.resolve({ok:true,queued:true,msg:'弱网已存草稿, 待同步'}); }
      return req('/app/submit',{method:'POST',body:payload});
    },
    // 6.补传:联网后逐条重发本地队列,成功则清除
    flushQueue:function(){
      var q=qLoad();
      if(!q.length) return req('/app/sync/flush',{method:'POST'});
      return Promise.all(q.map(function(item){
        var target = item.type==='checklist_confirm' ? '/app/checklists/confirm' : '/app/submit';
        var body = item.type==='checklist_confirm' ? item.payload : item.payload;
        return req(target,{method:'POST',body:body}).then(function(r){ return {ok:!!(r&&r.ok), item:item}; });
      })).then(function(arr){
        var okCount=arr.filter(function(x){return x.ok;}).length;
        var failed=arr.filter(function(x){return !x.ok;});
        if(!failed.length){ try{localStorage.setItem(QUEUE_KEY,'[]');}catch(e){} }
        else { var keep=q.filter(function(it){return failed.some(function(f){return f.item===it;});}); try{localStorage.setItem(QUEUE_KEY,JSON.stringify(keep));}catch(e){} }
        renderQ();
        return {ok:true, msg:'已同步 '+okCount+'/'+q.length+' 条'+(failed.length?('，失败'+failed.length):'')};
      });
    },
    // 7.现场照片回传(壳拍照→data_url上传→返回可引用URL /uploads/xxx.jpg)
    uploadPhoto:function(dataUrl){
      if(!dataUrl)return Promise.resolve({ok:false,msg:'照片为空'});
      if(!navigator.onLine)return Promise.resolve({ok:false,code:'OFFLINE',msg:'离线,照片待补传'});
      return req('/app/photos',{method:'POST',body:{data_url:dataUrl}});
    },
    // 8.把照片挂到单据附件(doc_attachment,与PC端同一张表;ref=照片URL)
    addAttachment:function(docNo,ref,kind){
      if(!docNo||!ref)return Promise.resolve({ok:false,msg:'单据号或照片引用缺失'});
      return req('/web/docs/'+encodeURIComponent(docNo)+'/attachments',{method:'POST',body:{kind:kind||'照片',ref:ref}});
    },
    mine:function(){ return req('/web/auth/me',{mock:{ok:true,data:{name:'离线用户',username:'',data_scope:'—',roles:[]}}}); }
  };
  document.addEventListener('DOMContentLoaded', function(){ renderQ(); boot(); });
})();

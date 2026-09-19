/* 全系统统一导航：完整一/二级菜单，可点击切换，一级可收缩展开
 * 菜单对照《监狱公司物料系统-菜单与页面数据库设计表》总表 */
(function(){
  function qtyUnit(q,u){return '<span class="qty-value">'+String(q==null?'':q)+'</span><span class="qty-unit">'+esc(u||'')+'</span>';}
  /* Keep quantity and unit as separate DOM fields even for legacy/static page copy. */
  function splitQuantityText(root){
    if(!root||root.nodeType!==1)return;
    var re=/(\d[\d,]*(?:\.\d+)?)\s*(米|件|个|箱|卷|套|台|张|条|公斤|kg)(?![\w])/gi;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],node;
    while(node=walker.nextNode()){
      var p=node.parentElement;
      if(!p||p.closest('script,style,textarea,input,select,option,.qty-value,.qty-unit,[data-qty-split]'))continue;
      if(re.test(node.nodeValue)){re.lastIndex=0;nodes.push(node)}
    }
    nodes.forEach(function(text){
      var value=text.nodeValue,frag=document.createDocumentFragment(),last=0,m;
      re.lastIndex=0;
      while((m=re.exec(value))){
        if(m.index>last)frag.appendChild(document.createTextNode(value.slice(last,m.index)));
        var q=document.createElement('span');q.className='qty-value';q.dataset.qtyField='quantity';q.textContent=m[1];
        var u=document.createElement('span');u.className='qty-unit';u.dataset.qtyField='quantity-unit';u.textContent=m[2];
        frag.appendChild(q);frag.appendChild(u);last=re.lastIndex;
      }
      if(last<value.length)frag.appendChild(document.createTextNode(value.slice(last)));
      text.parentNode.replaceChild(frag,text);
    });
  }
  var SPA_SHELL=!!window.__WMS_APP_SHELL;
  if(!document.getElementById('wms-shared-theme')){
    var theme=document.createElement('link'); theme.id='wms-shared-theme'; theme.rel='stylesheet'; theme.href=SPA_SHELL?'assets/theme.css':'../assets/theme.css'; document.head.appendChild(theme);
  }
  var FILE = {
    login:'login.html', home:'home.html', dashboard:'dashboard.html', location:'location.html', materialCode:'material-workbench.html',
    transfer:'transfer.html', approveFlow:'approve-flow.html',
    finished:'finished.html',
    base:'base.html', warehouseArchive:'warehouse-archive.html', locationArchive:'location-archive.html', customerArchive:'customer-archive.html', docs:'docs.html', ocr:'ocr.html', scanlog:'scanlog.html', qrcode:'qrcode.html',
    stocktake:'stocktake.html', report:'report.html', reportConfig:'report-config.html', audit:'audit.html', processingFee:'processing-fee.html', ai:'ai.html', users:'users.html', equipment:'equipment.html', ocrResult:'ocr-result.html',
    materialRequest:'material-workbench.html', materialRegister:'material-workbench.html', materialReject:'material-workbench.html', materialInbound:'material-workbench.html', materialIssue:'material-workbench.html', materialWReturn:'material-workbench.html', materialReturn:'material-workbench.html', materialStock:'material-workbench.html',
    inventoryOnhand:'material-workbench.html', inventoryLedger:'material-workbench.html',
    finishedDetail:'finished.html', finishedRegister:'finished.html', finishedInbound:'finished.html', finishedReturn:'finished.html', finishedDeliver:'finished.html', finishedOut:'finished.html', finishedSign:'finished.html',
    fieldApp:'../mobile-app/index.html',
    baseBom:'base.html', baseMat:'base.html', baseOrg:'base.html', baseLoc:'base.html', baseProd:'base.html', baseTpl:'base.html'
  };
  var SECTION = {
    login:'login', home:'home', dashboard:'dashboard', location:'location', materialCode:'materialCode',
    transfer:'transfer', workshop:'materialRequest', workshopReceive:'materialIssue', return:'materialWReturn',
     finished:'finished', base:'base', baseBom:'baseBom', baseMat:'baseMat', baseOrg:'baseOrg', baseLoc:'baseLoc', baseProd:'baseProd', baseTpl:'baseTpl', warehouseArchive:'warehouseArchive', locationArchive:'locationArchive', customerArchive:'customerArchive', docs:'docs', ocr:'ocr', scanlog:'scanlog', qrcode:'qrcode',
    stocktake:'stocktake', report:'report', reportConfig:'reportConfig', audit:'audit', processingFee:'processingFee', ai:'ai', users:'users', equipment:'equipment', ocrResult:'ocrResult',
    materialRequest:'materialRequest', materialRegister:'materialRegister', materialReject:'materialReject', materialInbound:'materialInbound', materialIssue:'materialIssue', materialWReturn:'materialWReturn', materialReturn:'materialReturn', materialStock:'materialStock',
    inventoryOnhand:'inventoryOnhand', inventoryLedger:'inventoryLedger',
    finishedDetail:'finishedDetail', finishedRegister:'finishedRegister', finishedInbound:'finishedInbound', finishedReturn:'finishedReturn', finishedDeliver:'finishedDeliver', finishedOut:'finishedOut', finishedSign:'finishedSign'
  };
  var GROUPS = [
    {id:'g0', label:'工作台', icon:'fa-gauge', children:[
      {id:'home', label:'首页', tab:''},
      {id:'dashboard', label:'业务运营驾驶舱', tab:''},
      {id:'fieldApp', label:'现场作业APP', tab:''},
      {id:'ai', label:'AI问数', tab:''}]},
    /* 与 app.html 主菜单保持一致：g1 仓储作业含仓库库存/库存记录/库区管理/库存调仓/库存盘点；物料管理 8 个工单+明细 */
    {id:'g1', label:'仓储作业', icon:'fa-warehouse', children:[
      {id:'inventoryOnhand', label:'仓库库存', tab:'onhand'},
      {id:'inventoryLedger', label:'库存记录', tab:'ledger'},
      {id:'location', label:'库区管理', tab:''},
      {id:'transfer', label:'库存调仓', tab:''},
      {id:'stocktake', label:'库存盘点', tab:''}]},
    {id:'g2', label:'物料管理', icon:'fa-boxes-stacked', children:[
      {id:'materialCode', label:'物料明细', tab:'detail'},
      {id:'materialRequest', label:'申请领料', tab:'request'},
      {id:'materialRegister', label:'物料登记', tab:'register'},
      {id:'materialReject', label:'来料拒收', tab:'reject'},
      {id:'materialInbound', label:'物料入库', tab:'inbound'},
      {id:'materialIssue', label:'物料领用', tab:'issue'},
      {id:'materialWReturn', label:'车间退料', tab:'wreturn'},
      {id:'materialReturn', label:'物料退库', tab:'return'}]},
    {id:'g4', label:'成品管理', icon:'fa-flag-checkered', children:[
      {id:'finishedDetail', label:'成品明细', tab:'detail'},
      {id:'finishedRegister', label:'成品登记', tab:'register'},
      {id:'finishedInbound', label:'成品入库', tab:'inbound'},
      {id:'finishedReturn', label:'成品退仓', tab:'wreturn'},
      {id:'finishedDeliver', label:'成品交付', tab:'deliver'}]},
    {id:'g5', label:'基础资料', icon:'fa-cubes', children:[
      {id:'baseBom', label:'BOM管理', tab:''},
      {id:'baseMat', label:'物料档案', tab:'2'},
      {id:'baseOrg', label:'组织架构·车间', tab:'3'},
      {id:'baseLoc', label:'库区·客户档案', tab:'4'},
      {id:'baseProd', label:'成品档案', tab:'5'},
      {id:'baseTpl', label:'单据模板·拍照/AI', tab:'6'}]},
    {id:'g6', label:'单据中心', icon:'fa-file-lines', children:[
      {id:'docs', label:'业务记录查询', tab:''},
      {id:'qrcode', label:'二维码中心', tab:''},
      {id:'ocr', label:'OCR工作台', tab:''},
      {id:'scanlog', label:'设备扫码记录', tab:''},
      {id:'processingFee', label:'加工费对账', tab:''}]},
    {id:'g7', label:'异常与审计', icon:'fa-triangle-exclamation', children:[
      {id:'audit', label:'操作审计', tab:''}]},
    {id:'g8', label:'报表中心', icon:'fa-chart-line', children:[
      {id:'report', label:'报表中心', tab:''},
      {id:'reportConfig', label:'报表配置', tab:''}]},
    {id:'g9', label:'系统管理', icon:'fa-gear', children:[
      {id:'users', label:'用户管理', tab:''},
      {id:'equipment', label:'设备管理', tab:''},
      {id:'approveFlow', label:'审批流配置', tab:''}]}
  ];

  /* 口径（用户确认）：申请领料=进仓前不动账；车间接收=物料领用签收；车间退料=回仓进项；物料退库=出库/冲红 */
  /* 兼容映射：旧 id workshop → 申请领料，workshopReceive → 物料领用，return → 车间退料（tab 一律 view key） */
  var MATERIAL_ALIAS={workshop:['materialRequest','request'],workshopReceive:['materialIssue','issue'],return:['materialWReturn','wreturn'],receipt:['materialInbound','inbound'],issue:['materialIssue','issue'],inventory:['inventoryOnhand','onhand'],finished:['finishedRegister','register'],finishedOut:['finishedRegister','register'],finishedSign:['finishedDeliver','deliver']};
  var reportGroup=GROUPS.find(function(group){return group.id==='g8';});
  if(reportGroup&&!reportGroup.children.some(function(item){return item.id==='reportConfig';})) reportGroup.children.push({id:'reportConfig',label:'报表配置',tab:''});
  var baseGroup=GROUPS.find(function(group){return group.id==='g5';});
  if(baseGroup) baseGroup.children=[
    {id:'baseBom',label:'BOM管理',tab:''},{id:'baseMat',label:'物料档案',tab:'2'},{id:'baseOrg',label:'组织架构·车间',tab:'3'},
    {id:'warehouseArchive',label:'仓库档案',tab:''},{id:'locationArchive',label:'库区档案',tab:''},{id:'customerArchive',label:'客户档案',tab:''},
    {id:'baseProd',label:'成品档案',tab:'5'},{id:'baseTpl',label:'单据模板',tab:'6'}
  ];

  function currentFile(){ if(SPA_SHELL&&window.__WMS_PAGE_CONTEXT)return window.__WMS_PAGE_CONTEXT.file; return (location.pathname.split('/').pop()||'').split('?')[0].split('#')[0]; }
  function currentTab(){ try{if(SPA_SHELL&&window.__WMS_PAGE_CONTEXT){var c=window.__WMS_PAGE_CONTEXT;if(/^base/.test(c.route||'')||c.file==='base.html')return ({"baseBom":"","baseMat":"2","baseOrg":"3","baseLoc":"4","baseProd":"5","baseTpl":"6"}[c.route]||c.tab||'');return c.tab||'';}var u=new URLSearchParams(location.search);return u.get('view')||u.get('tab')||''}catch(e){ return ''; } }
  function isRecordFilter(id, tab){ return id==='docs' && !!tab && !/^(onhand|ledger|detail|request|register|reject|inbound|issue|wreturn|return|sign|deliver)$/.test(tab); }
  var inFrame=false; try{ inFrame = window.parent!==window; }catch(e){ inFrame=true; }
  var inApp = SPA_SHELL || /from=app/.test(location.search);
  function collapsedMap(){
    try{ return JSON.parse(localStorage.getItem('jm_wms_nav_collapsed')||'{}'); }catch(e){ return {}; }
  }
  function setCollapsed(gid, v){
    var m=collapsedMap(); m[gid]=v?1:0;
    try{ localStorage.setItem('jm_wms_nav_collapsed', JSON.stringify(m)); }catch(e){}
  }
  var MATERIAL_TAB={materialRequest:'request',materialRegister:'register',materialReject:'reject',materialInbound:'inbound',materialIssue:'issue',materialWReturn:'wreturn',materialReturn:'return',materialCode:'detail',inventoryOnhand:'onhand',inventoryLedger:'ledger',inventory:'onhand'};

  function navTo(id, tab){
    /* 口径：workshop → 申请领料，workshopReceive → 物料领用，return → 车间退料（tab 一律 view key） */
    if(MATERIAL_ALIAS[id]&&!tab){id=MATERIAL_ALIAS[id][0];tab=MATERIAL_ALIAS[id][1]}
    /* 基础资料 6 个子页共用 base.html：用独立 id 避免“同一文件+空tab”互相覆盖 */
    var BASE_TAB={baseBom:'',baseMat:'2',baseOrg:'3',baseLoc:'4',baseProd:'5',baseTpl:'6'};
    if(id in BASE_TAB){tab=BASE_TAB[id];if(SPA_SHELL&&typeof window.__WMS_APP_GO==='function'){window.__WMS_APP_GO(id,tab);return;}if(!FILE[id])return;var u2=FILE[id]+(tab?('?tab='+tab):'');if(currentFile()!==FILE[id]||currentTab()!==tab)location.href=u2;return;}
    if(!FILE[id]) return; tab = tab||'';
    if(MATERIAL_TAB[id] && !tab) tab = MATERIAL_TAB[id];
    if(SPA_SHELL&&typeof window.__WMS_APP_GO==='function'){ window.__WMS_APP_GO(id, tab); return; }
    try{ if(inApp && window.parent && typeof window.parent.go==='function'){ window.parent.go(id, tab); return; } }catch(e){}
    if(inFrame){ try{ window.parent.postMessage({from:'wms-nav', go:SECTION[id]||id, page:id, view:tab, tab:tab}, '*'); }catch(e){} return; }
    var u2 = FILE[id] + (tab ? ('?view='+tab) : '');
    if(currentFile()!==FILE[id] || currentTab()!==tab) location.href = u2;
  }
  window.goPage = navTo; window.navTo = navTo;
  window.toggleNavGroup = function(gid){
    var open = '';
    try{ open = localStorage.getItem('jm_wms_nav_open')||''; }catch(e){}
    var willOpen = open!==gid ? gid : '';
    try{ localStorage.setItem('jm_wms_nav_open', willOpen); }catch(e){}
    try{ localStorage.setItem('jm_wms_nav_collapsed', JSON.stringify({})); }catch(e){}
    var groups = document.querySelectorAll('.wms-nav-group');
    groups.forEach(function(gr){
      var id = gr.getAttribute('data-menu-group');
      var panel = document.getElementById('nav-'+id);
      var chev = document.getElementById('chev-'+id);
      var btn = gr.querySelector('.wms-nav-group-toggle');
      var shut = id!==willOpen;
      if(panel){ panel.style.display = shut ? 'none' : 'block'; }
      if(chev){ chev.style.transform = shut ? 'rotate(-90deg)' : 'rotate(0deg)'; }
      if(btn){ btn.setAttribute('aria-expanded', shut ? 'false' : 'true'); }
    });
    return;
    var map = collapsedMap();
    var nowCollapsed = !map[gid];
    if(map[gid]){ delete map[gid]; } else { map[gid]=1; }
    try{ localStorage.setItem('jm_wms_nav_collapsed', JSON.stringify(map)); }catch(e){}
    var body = document.getElementById('nav-'+gid);
    var chev = document.getElementById('chev-'+gid);
    if(body){ body.style.display = map[gid] ? 'none' : 'grid'; }
    if(chev){ chev.style.transform = map[gid] ? 'rotate(-90deg)' : 'rotate(0deg)'; }
    var trigger=body&&body.previousElementSibling; if(trigger) trigger.setAttribute('aria-expanded',map[gid]?'false':'true');
  };
  window.toggleStandaloneSidebar = function(){
    var aside=document.querySelector('body > div.flex > aside, body > aside, aside');
    if(!aside)return;
    var compact=aside.classList.toggle('nav-compact');
    try{localStorage.setItem('jm_wms_nav_compact',compact?'1':'0');}catch(e){}
    var button=aside.querySelector('[data-nav-collapse]');
    if(button){button.setAttribute('aria-label',compact?'展开导航':'收起导航');button.title=compact?'展开导航':'收起导航';button.innerHTML='<i class="fa-solid '+(compact?'fa-angles-right':'fa-angles-left')+'" aria-hidden="true"></i>';}
  };

  function sidebarHTML(){
    var cur = currentFile(), curTab = currentTab();
    var openGid = '';
    try{ openGid = localStorage.getItem('jm_wms_nav_open')||''; }catch(e){}
    var h = '<div class="wms-nav-brand flex items-center gap-2 font-bold mb-3 px-1">'
      + '<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0"><i class="fa-solid fa-boxes-stacked text-sm"></i></div>'
      + '<div class="wms-nav-brand-copy leading-tight"><div class="text-[13px]">物料管理系统</div><div class="text-[10px] font-normal">一期 · 内网</div></div></div>';
    h += '<div class="wms-nav-role text-[11px] rounded-lg p-2.5 mb-2 leading-relaxed">岗位：<b>仓库负责人 · 张建国</b><br>范围：外仓 / 内仓1 / 内仓2 · 一监区<br><span>● 在线 · 点击菜单即切换</span></div>';
    var activeGid = null;
    GROUPS.forEach(function(g){
      g.children.forEach(function(c){ if(FILE[c.id]===cur && ((c.tab||'')===(curTab||'') || isRecordFilter(c.id,curTab))) activeGid=g.id; });
    });
    if(!openGid) openGid = activeGid || 'g0';
    GROUPS.forEach(function(g){
      var collapsed = g.id!==openGid;
      var disp = collapsed ? 'none' : 'block';
      var rot = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      h += '<div class="wms-nav-group'+(collapsed?'':' open')+'" data-menu-group="'+g.id+'"><button type="button" title="'+g.label+'" aria-expanded="'+(!collapsed)+'" aria-controls="nav-'+g.id+'" onclick="toggleNavGroup(\''+g.id+'\')" class="wms-nav-group-toggle w-full flex items-center justify-between transition">'
        + '<span><i class="fa-solid '+g.icon+' mr-1"></i>'+g.label+'</span>'
        + '<i id="chev-'+g.id+'" class="fa-solid fa-chevron-down transition" style="transform:'+rot+'"></i></button>';
      h += '<div id="nav-'+g.id+'" class="wms-nav-group-panel" style="display:'+disp+'">';
      g.children.forEach(function(c){
        var on = (FILE[c.id]===cur && ((c.tab||'')===(curTab||'') || isRecordFilter(c.id,curTab)));
        var style = on ? 'background:linear-gradient(135deg,#1f9bf0,#0875d2);color:#fff;font-weight:700;' : '';
        h += '<button type="button" data-menu-key="'+c.id+'" data-nav="'+c.id+'" data-tab="'+(c.tab||'')+'" aria-current="'+(on?'page':'false')+'" style="'+style+'" class="wms-nav-item w-full text-left transition flex items-center justify-between gap-1">'
          + '<span>'+c.label+'</span></button>';
      });
      h += '</div></div>';
    });
    h += '<button type="button" data-nav-collapse aria-label="收起导航" title="收起导航" onclick="toggleStandaloneSidebar()" class="wms-nav-collapse w-full text-left px-3 py-2 mt-3 rounded-lg text-[12px] transition"><i class="fa-solid fa-angles-left mr-2" aria-hidden="true"></i><span>收起导航</span></button>';
    h += '<button type="button" data-nav="login" data-tab="" aria-label="返回登录" class="wms-nav-login w-full text-left px-3 py-2 mt-1 rounded-lg text-[12px] transition"><i class="fa-solid fa-right-from-bracket mr-2"></i>返回登录</button>';
    return h;
  }
  function mount(){
    var file = currentFile();
    if(SPA_SHELL){ applyRequestedTab(); return; }
    if(/mobile/.test(file)){ enhancePage(); return; }
    var hasStandaloneShell=document.body&&document.body.hasAttribute('data-standalone-shell');
    var localFileMode=location.protocol==='file:';
    if(!inFrame&&!inApp&&!localFileMode&&file!=='login.html'&&!hasStandaloneShell){
      var appPage=Object.keys(FILE).find(function(id){return FILE[id]===file;});
      if(appPage){
        var appUrl='../app.html?page='+encodeURIComponent(appPage)+(currentTab()?'&tab='+encodeURIComponent(currentTab()):'');
        location.replace(appUrl);
        return;
      }
    }
    var aside = document.querySelector('aside');
    if(!aside){ enhancePage(); return; }
    if(inFrame){
      // The outer app owns navigation; embedded pages must not render a second sidebar.
      try{
        var embeddedAside=document.querySelector('body > div.flex > aside, body > aside, aside');
        if(embeddedAside){embeddedAside.setAttribute('aria-hidden','true');embeddedAside.style.display='none';}
        var embeddedShell=document.querySelector('body > div.flex');
        if(embeddedShell){embeddedShell.style.display='block';embeddedShell.style.width='100%';}
        var embeddedMain=document.querySelector('body > div.flex > div.flex-1');
        if(embeddedMain){embeddedMain.style.width='100%';embeddedMain.style.minWidth='0';}
      }catch(e){}
      if(aside){aside.setAttribute('aria-hidden','true');aside.style.display='none';}
      applyRequestedTab();
      enhancePage();
      return;
    }
    aside.classList.add('wms-standalone-nav');
    aside.innerHTML = sidebarHTML();
    try{if(localStorage.getItem('jm_wms_nav_compact')==='1'){aside.classList.add('nav-compact');var compactButton=aside.querySelector('[data-nav-collapse]');if(compactButton){compactButton.setAttribute('aria-label','展开导航');compactButton.title='展开导航';compactButton.innerHTML='<i class="fa-solid fa-angles-right" aria-hidden="true"></i>';}}}catch(e){}
    aside.querySelectorAll('[data-nav]').forEach(function(b){
      b.addEventListener('click', function(){ navTo(b.getAttribute('data-nav'), b.getAttribute('data-tab')); });
    });
    applyRequestedTab();
    enhancePage();
  }
  function applyRequestedTab(){
    var tab = currentTab();
    if(tab){
      var n = parseInt(tab,10);
      if(!isNaN(n)){
        try{
          var btn = document.querySelectorAll('.tab')[n-1];
          if(typeof window.tab==='function'){if(btn) btn.click();return;}
          document.querySelectorAll('.tab').forEach(function(x,index){x.classList.toggle('on',index===n-1);});
          [1,2,3,4,5,6].forEach(function(k){var panel=document.getElementById('p'+k);if(panel)panel.classList.toggle('hidden',k!==n);});
        }catch(e){}
      }
    }
  }
  // Shared project-level placeholder states: loading, empty, error, permission.
  function renderState(host, type, opts){
    if(!host) return null;
    opts=opts||{};
    var copy={
      loading:{icon:'fa-spinner fa-spin',title:'正在加载',body:opts.body||'正在读取记录，请稍候。',role:'status'},
      empty:{icon:'fa-inbox',title:'暂无匹配记录',body:opts.body||'当前筛选条件没有记录，可调整条件后再试。',role:'status'},
      error:{icon:'fa-circle-exclamation',title:'记录加载失败',body:opts.body||'网络或服务暂时不可用，已保留当前页面。',role:'alert'},
      permission:{icon:'fa-lock',title:'暂无访问权限',body:opts.body||'当前账号无权查看这类记录，请联系管理员开通权限。',role:'status'}
    }[type]||null;
    if(!copy) return null;
    host.innerHTML=(type==='loading'?'<div class="wms-state-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>':'<div class="wms-state-icon" aria-hidden="true"><i class="fa-solid '+copy.icon+'"></i></div>')+
      '<h3 class="wms-state-title">'+copy.title+'</h3><p class="wms-state-body">'+copy.body+'</p>';
    host.setAttribute('role',copy.role); host.setAttribute('aria-live',copy.role==='alert'?'assertive':'polite');
    host.setAttribute('aria-atomic','true'); host.setAttribute('aria-busy',type==='loading'?'true':'false');
    host.hidden=false; host.dataset.state=type;
    if(type==='empty' && opts.action){
      var b=document.createElement('button'); b.type='button'; b.className='wms-state-action'; b.textContent=opts.actionLabel||'调整筛选'; b.addEventListener('click',opts.action); host.appendChild(b);
    }
    if(type==='error' && opts.retry){
      var r=document.createElement('button'); r.type='button'; r.className='wms-state-action'; r.textContent='重试'; r.addEventListener('click',opts.retry); host.appendChild(r);
    }
    if(type==='permission' && opts.action){
      var p=document.createElement('button'); p.type='button'; p.className='wms-state-action'; p.textContent=opts.actionLabel||'返回工作台'; p.addEventListener('click',opts.action); host.appendChild(p);
    }
    return host;
  }
  window.wmsRenderState=renderState;
  function enhanceDocsRecords(){
    var table=document.querySelector('table');
    if(!table || table.getAttribute('data-records-enhanced')) return;
    table.setAttribute('data-records-enhanced','true');
    table.classList.add('docs-record-table');
    var title=document.querySelector('h1');
    if(title){
      title.textContent='业务记录查询';
      if(title.nextElementSibling) title.nextElementSibling.textContent='查看已入库、已出库及其它业务单据，点击记录查看全链路明细';
    }
    var crumb=document.querySelector('header b');
    if(crumb) crumb.textContent='业务记录查询 · 全链路追溯';
    var tbody=table.tBodies[0]; if(!tbody) return;
    var rows=[].slice.call(tbody.querySelectorAll('tr'));
    function recordTypeFor(id){return /^SL/.test(id)?'receipt':/^ZS|^CK/.test(id)?'issue':/^DB/.test(id)?'transfer':/^LY|^TL/.test(id)?'workshop':/^CP|^JJ/.test(id)?'finished':/^PD|^EX/.test(id)?'stocktake':'other';}
    var detailDrawer=document.getElementById('d'), detailLastFocus=null, detailPreviousOverflow='';
    var detailClose=detailDrawer&&detailDrawer.querySelector('button[aria-label],button');
    var detailHeading=detailDrawer&&detailDrawer.querySelector('b');
    if(detailDrawer){
      detailDrawer.setAttribute('role','dialog');
      detailDrawer.setAttribute('aria-modal','true');
      detailDrawer.setAttribute('aria-hidden',detailDrawer.classList.contains('hidden')?'true':'false');
      if(detailHeading) detailHeading.id=detailHeading.id||'record-detail-title';
      if(detailHeading) detailDrawer.setAttribute('aria-labelledby',detailHeading.id);
    }
    function detailFocusable(){
      return detailDrawer?[].slice.call(detailDrawer.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(el){return !el.disabled&&el.offsetParent!==null;}):[];
    }
    function closeRecordDetail(){
      if(!detailDrawer) return;
      detailDrawer.classList.add('hidden');
      detailDrawer.setAttribute('aria-hidden','true');
      document.body.style.overflow=detailPreviousOverflow;
      if(detailLastFocus&&typeof detailLastFocus.focus==='function') detailLastFocus.focus();
    }
    function openRecordDetail(row){
      var d=detailDrawer; if(!d) return;
      var id=(row.cells[0]&&row.cells[0].textContent||'').trim();
      if(detailHeading) detailHeading.textContent=id+' · 记录详情';
      detailLastFocus=document.activeElement;
      detailPreviousOverflow=document.body.style.overflow;
      d.classList.remove('hidden');
      d.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      window.setTimeout(function(){if(detailClose) detailClose.focus();},0);
    }
    if(detailDrawer){
      if(detailClose) detailClose.addEventListener('click',closeRecordDetail);
      document.addEventListener('click',function(e){
        if(detailDrawer.classList.contains('hidden')) return;
        if(detailDrawer.contains(e.target)) return;
        if(e.target.closest('tr,[data-doc],[data-record-action]')) return;
        closeRecordDetail();
      });
      document.addEventListener('keydown',function(e){
        if(detailDrawer.classList.contains('hidden')) return;
        if(e.key==='Escape'){e.preventDefault();closeRecordDetail();return;}
        if(e.key!=='Tab') return;
        var focusable=detailFocusable(); if(!focusable.length) return;
        var first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      });
    }
    function attachRecordAction(row){
      if(row.querySelector('[data-record-action]')) return;
      var cell=document.createElement('td'); cell.className='docs-record-actions';
      cell.innerHTML='<button type="button" class="docs-record-action" data-record-action="view">查看</button>';
      cell.querySelector('button').addEventListener('click',function(e){e.stopPropagation();openRecordDetail(row);});
      row.appendChild(cell);
    }
    rows.forEach(function(row){
      var id=(row.cells[0]&&row.cells[0].textContent||'').trim();
      row.setAttribute('data-record-type',recordTypeFor(id));
      attachRecordAction(row);
    });
    var seeds=[
      ['LY2026091208','领料','缝制一车间 → 车间工位','牛津布 800米','已签收 / 李小明','09:22','已完成','workshop'],
      ['CP2026091210','成品输出','缝制一车间 → 外仓 WH-A','成品夹克 420件','待入仓 / 张建国','09:45','处理中','finished'],
      ['PD2026091203','盘点','外仓 WH-A-05','拉链 2000件','差异复核 / 王芳','10:02','待复核','stocktake'],
      ['EX2026091202','异常','内仓1 → 外仓','牛津布差异 20米','异常处理 / 张建国','10:08','待处理','stocktake']
    ];
    seeds.forEach(function(item){
      var tr=document.createElement('tr'); tr.className='border-b hover:bg-blue-50 cursor-pointer'; tr.setAttribute('data-record-type',item[7]);
      tr.innerHTML='<td class="py-2 text-blue-700 font-bold">'+item[0]+' · '+item[1]+'</td><td>'+item[2]+'</td><td>'+item[3]+'</td><td>'+item[4]+'</td><td>'+item[5]+'</td><td><span class="bg-slate-100 text-slate-600 px-2 rounded-full">'+item[6]+'</span></td>';
      tr.addEventListener('click',function(){openRecordDetail(tr);});
      attachRecordAction(tr);
      tbody.appendChild(tr);
    });
    var headRow=table.tHead&&table.tHead.rows[0];
    if(headRow&&!headRow.querySelector('[data-record-operation-header]')){var opHead=document.createElement('th');opHead.textContent='操作';opHead.setAttribute('data-record-operation-header','true');headRow.appendChild(opHead);}
    var toolbar=document.createElement('div');
    toolbar.id='record-filter-toolbar';
    toolbar.className='flex items-center gap-2 flex-wrap mt-3';
    toolbar.setAttribute('aria-label','按业务类型查看记录');
    toolbar.innerHTML='<span class="text-slate-500 font-bold">快捷查看</span>';
    var filters=[
      ['all','全部记录'],['receipt','已入库记录'],['issue','已出库记录'],['transfer','调拨记录'],
      ['workshop','领料/退料记录'],['finished','成品记录'],['stocktake','盘点/异常记录']
    ];
    var selected=(new URLSearchParams(location.search).get('tab')||'all');
    function applyFilter(type){
      selected=type||'all';
      tbody.querySelectorAll('tr').forEach(function(row){row.hidden=selected!=='all'&&row.getAttribute('data-record-type')!==selected;});
      toolbar.querySelectorAll('[data-record-filter]').forEach(function(btn){var on=btn.getAttribute('data-record-filter')===selected;btn.setAttribute('aria-pressed',on?'true':'false');btn.classList.toggle('bg-blue-600',on);btn.classList.toggle('text-white',on);btn.classList.toggle('bg-white',!on);});
      var visible=[].slice.call(tbody.querySelectorAll('tr')).filter(function(row){return !row.hidden;}).length;
      var status=document.getElementById('record-filter-status'); if(status) status.textContent='当前显示 '+visible+' 条记录';
    }
    filters.forEach(function(pair){var btn=document.createElement('button');btn.type='button';btn.setAttribute('data-record-filter',pair[0]);btn.setAttribute('aria-pressed','false');btn.className='min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-blue-300';btn.textContent=pair[1];btn.addEventListener('click',function(){applyFilter(pair[0]);showRecords();});toolbar.appendChild(btn);});
    var status=document.createElement('span'); status.id='record-filter-status'; status.className='text-slate-400'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); toolbar.appendChild(status);
    var listHead=document.createElement('div'); listHead.className='docs-list-head'; listHead.setAttribute('aria-labelledby','docs-list-title');
    listHead.innerHTML='<div><h2 id="docs-list-title" class="docs-list-title">业务记录列表</h2><p class="docs-list-meta">进入页面即可查看全量记录；支持筛选、查看详情和新建记录。</p></div><div class="docs-list-actions"><button type="button" aria-label="刷新记录列表" class="docs-secondary-action" data-record-refresh><i class="fa-solid fa-rotate mr-1" aria-hidden="true"></i>刷新列表</button><button type="button" aria-label="新建业务记录" class="docs-primary-action" data-record-new><i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>新建记录</button></div>';
    var state=document.createElement('section'); state.id='record-state'; state.className='wms-state'; state.hidden=true; state.setAttribute('aria-label','记录查询状态');
    var tableWrap=table.parentNode;
    var listCard=tableWrap.classList.contains('wms-table-scroll')?tableWrap.parentNode:tableWrap;
    listCard.insertBefore(listHead,tableWrap);
    listCard.insertBefore(toolbar,tableWrap);
    listCard.insertBefore(state,tableWrap);
    window.setDocType=applyFilter;
    function showRecords(){
      var hasVisibleRow=[].slice.call(tbody.querySelectorAll('tr')).some(function(row){return !row.hidden;});
      if(hasVisibleRow){state.hidden=true;table.hidden=false;return;}
      table.hidden=true;
      renderState(state,'empty',{action:function(){applyFilter('all');showRecords();},actionLabel:'显示全部记录'});
    }
    function runQuery(){
      var query=(document.querySelector('input[placeholder]')||{}).value||'';
      table.hidden=true; renderState(state,'loading',{body:'正在读取业务记录，请稍候。'});
      window.setTimeout(function(){
        if(/无权限|权限/.test(query)){ renderState(state,'permission',{action:function(){query='';runQuery();},actionLabel:'清空条件'}); return; }
        if(/失败|错误/.test(query)){ renderState(state,'error',{retry:runQuery}); return; }
        if(/无|空/.test(query)){ renderState(state,'empty',{action:function(){var i=document.querySelector('input[placeholder]');if(i)i.value='';applyFilter('all');showRecords();},actionLabel:'清空筛选'}); return; }
        applyFilter(selected); showRecords();
      },260);
    }
    var queryBtn=document.querySelector('button.bg-slate-900');
    if(!queryBtn){queryBtn=[].slice.call(document.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('查询')>-1;});}
    if(queryBtn){queryBtn.addEventListener('click',function(e){e.preventDefault();runQuery();});}
    var recordDialog=document.createElement('div'); recordDialog.className='record-dialog'; recordDialog.hidden=true; recordDialog.setAttribute('role','dialog'); recordDialog.setAttribute('aria-modal','true'); recordDialog.setAttribute('aria-labelledby','record-dialog-title');
    recordDialog.innerHTML='<div class="record-dialog-panel"><div class="record-dialog-header"><div><h2 id="record-dialog-title" class="record-dialog-title">新建业务记录</h2><p class="record-dialog-subtitle">创建后会立即出现在当前记录列表，可继续查看详情。</p></div><button type="button" data-record-close aria-label="关闭新建记录" title="关闭" class="text-slate-500 px-2"><i class="fa-solid fa-xmark text-lg" aria-hidden="true"></i></button></div><form id="record-create-form" novalidate><div class="record-form-grid"><label class="record-form-field">记录类型<select id="record-type" aria-label="记录类型"><option value="receipt">送料/入库</option><option value="issue">出库/直送</option><option value="transfer">调拨</option><option value="workshop">领料/退料</option><option value="finished">成品记录</option><option value="stocktake">盘点/异常</option></select></label><label class="record-form-field">状态<select id="record-status" aria-label="记录状态"><option value="处理中">处理中</option><option value="待处理">待处理</option><option value="已完成">已完成</option></select></label><label class="record-form-field">来源 <input id="record-source" aria-label="记录来源" required aria-describedby="record-form-error" placeholder="例如：恒达服饰或外仓 WH-A" /></label><label class="record-form-field">去向/目标 <input id="record-target" aria-label="记录去向或目标" required aria-describedby="record-form-error" placeholder="例如：内仓1或缝制一车间" /></label><label class="record-form-field full">物料/数量 <input id="record-material" aria-label="物料和数量" required aria-describedby="record-form-error" placeholder="例如：牛津布 800米" /></label><label class="record-form-field">数量 <input id="record-qty" aria-label="记录数量" type="number" min="0.001" step="0.001" value="1" required aria-describedby="record-form-error" /></label><label class="record-form-field">备注 <input id="record-note" aria-label="记录备注" placeholder="可选" /></label></div><p id="record-form-error" class="record-form-error" role="alert" aria-live="assertive"></p><div class="record-dialog-actions"><button type="button" data-record-close class="docs-secondary-action">取消</button><button type="submit" class="docs-primary-action">创建记录</button></div></form></div>';
    document.body.appendChild(recordDialog);
    var recordTrigger=listHead.querySelector('[data-record-new]'),recordForm=recordDialog.querySelector('#record-create-form'),recordError=recordDialog.querySelector('#record-form-error'),recordLastFocus=null;
    function closeRecordDialog(){recordDialog.hidden=true;document.body.style.overflow='';if(recordLastFocus)recordLastFocus.focus();}
    function openRecordDialog(source){recordLastFocus=source||recordTrigger;recordDialog.hidden=false;document.body.style.overflow='hidden';recordError.textContent='';recordForm.querySelectorAll('[aria-invalid="true"]').forEach(function(control){control.removeAttribute('aria-invalid');});window.setTimeout(function(){recordDialog.querySelector('#record-source').focus();},0);}
    recordTrigger.addEventListener('click',function(){openRecordDialog(recordTrigger);});
    listHead.querySelector('[data-record-refresh]').addEventListener('click',function(){runQuery();});
    recordDialog.querySelectorAll('[data-record-close]').forEach(function(btn){btn.addEventListener('click',closeRecordDialog);});
    recordDialog.addEventListener('click',function(e){if(e.target===recordDialog)closeRecordDialog();});
    document.addEventListener('keydown',function(e){if(!recordDialog.hidden&&e.key==='Escape')closeRecordDialog();});
    function recordEsc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
    recordForm.addEventListener('submit',function(e){
      e.preventDefault();
      var type=recordDialog.querySelector('#record-type').value,statusValue=recordDialog.querySelector('#record-status').value,source=recordDialog.querySelector('#record-source').value.trim(),target=recordDialog.querySelector('#record-target').value.trim(),material=recordDialog.querySelector('#record-material').value.trim(),qty=Number(recordDialog.querySelector('#record-qty').value),note=recordDialog.querySelector('#record-note').value.trim();
      if(!source||!target||!material||!Number.isFinite(qty)||qty<=0){recordError.textContent='请填写来源、去向、物料/数量，并确认数量大于 0。';[recordDialog.querySelector('#record-source'),recordDialog.querySelector('#record-target'),recordDialog.querySelector('#record-material'),recordDialog.querySelector('#record-qty')].forEach(function(control){if(!control.value.trim()||control===recordDialog.querySelector('#record-qty')&&qty<=0)control.setAttribute('aria-invalid','true');else control.removeAttribute('aria-invalid');});var first=recordDialog.querySelector('[aria-invalid="true"]');if(first)first.focus();return;}
      var prefix={receipt:'SL',issue:'ZS',transfer:'DB',workshop:'LY',finished:'CP',stocktake:'PD'}[type]||'RD',now=new Date(),date=now.getFullYear()+('0'+(now.getMonth()+1)).slice(-2)+('0'+now.getDate()).slice(-2),hm=('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2),id=prefix+date+String(Date.now()).slice(-4),typeLabel={receipt:'送料',issue:'直送',transfer:'调拨',workshop:'领料/退料',finished:'成品记录',stocktake:'盘点/异常'}[type];
      var tr=document.createElement('tr'); tr.className='border-b hover:bg-blue-50 cursor-pointer'; tr.setAttribute('data-record-type',type); tr.innerHTML='<td class="py-2 text-blue-700 font-bold">'+recordEsc(id)+' · '+recordEsc(typeLabel)+'</td><td>'+recordEsc(source)+' → '+recordEsc(target)+'</td><td>'+recordEsc(material)+' · '+qty+'</td><td>'+recordEsc(statusValue)+' / 张建国'+(note?' · '+recordEsc(note):'')+'</td><td>'+hm+'</td><td><span class="bg-slate-100 text-slate-600 px-2 rounded-full">'+recordEsc(statusValue)+'</span></td>';tr.addEventListener('click',function(){openRecordDetail(tr);});attachRecordAction(tr);tbody.insertBefore(tr,tbody.firstChild);applyFilter(selected);showRecords();closeRecordDialog();recordForm.reset();recordDialog.querySelector('#record-qty').value='1';if(typeof window.toast==='function')window.toast('记录 '+id+' 已创建');
    });
    applyFilter(selected); showRecords();
  }
  function enhanceRecordLinks(){
    var file=currentFile();
    if(file==='docs.html'){ enhanceDocsRecords(); return; }
  }
  function enhanceReceiptDestinations(){
    if(currentFile()!=='receipt.html' || document.getElementById('receipt-routing')) return;
    var step=document.getElementById('st4');
    if(!step) return;
    var style=document.createElement('style'); style.id='receipt-routing-style';
    style.textContent='.receipt-material-scope{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px;border:1px solid #dbeafe;border-radius:10px;background:#fff}.receipt-material-scope label{display:flex;align-items:center;gap:6px;min-height:32px;padding:4px 8px;border-radius:7px;background:#f8fafc}.receipt-allocation-row{display:grid;grid-template-columns:minmax(180px,1.7fr) 100px minmax(150px,1.25fr) minmax(150px,1.25fr) 92px 36px;gap:8px;align-items:end}.receipt-allocation-row label{display:block;min-width:0}.receipt-allocation-row input,.receipt-allocation-row select{width:100%;min-width:0;box-sizing:border-box}.receipt-allocation-remove{min-width:36px!important;width:36px!important;padding:0!important}@media(max-width:900px){.receipt-allocation-row{grid-template-columns:1fr 1fr}.receipt-allocation-row .receipt-allocation-wide{grid-column:1/-1}.receipt-allocation-remove{width:100%!important}.receipt-routing{margin-left:-.25rem;margin-right:-.25rem}}';
    document.head.appendChild(style);
    var root=document.createElement('section'); root.id='receipt-routing'; root.className='receipt-routing mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3';
    root.setAttribute('aria-labelledby','receipt-routing-title');
    root.innerHTML='<div class="flex items-start justify-between gap-2 flex-wrap"><div><h3 id="receipt-routing-title" class="text-sm font-bold text-slate-800">去向分配（按物料）</h3><p class="text-[11px] text-slate-500 mt-1">先选择本次需要分配的物料，再为每种物料分别设置仓库或车间；同一物料可拆分多个去向。</p></div><button type="button" id="receipt-add-allocation" aria-label="为所选物料新增去向" title="新增去向" class="min-h-[40px] px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"><i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>新增去向</button></div><fieldset class="receipt-material-scope"><legend class="px-1 text-[11px] font-bold text-slate-600">选择需要分配去向的物料（可多选）</legend><label><input type="checkbox" checked>HD-OXF-001 牛津布 · 1200米</label><label><input type="checkbox" checked>HD-ZP-011 拉链 · 2000件</label><label><input type="checkbox">HD-NK-005 纽扣 · 500件</label></fieldset><div id="receipt-allocation-rows" class="space-y-2 mt-3"></div><div id="receipt-allocation-summary" class="mt-3" role="status" aria-live="polite" aria-atomic="true"></div>';
    step.innerHTML='';step.appendChild(root);
    var ITEMS=[
      {id:'oxf',name:'HD-OXF-001 牛津布藏青',total:1200,unit:'米',required:true},
      {id:'zip',name:'HD-ZP-011 拉链黑',total:2000,unit:'件',required:true},
      {id:'btn',name:'HD-NK-005 纽扣白',total:500,unit:'件',required:false}
    ];
    var materialChecks=root.querySelectorAll('.receipt-material-scope input[type="checkbox"]');
    ITEMS.forEach(function(item,index){if(materialChecks[index]) item.required=materialChecks[index].checked;});
    var DEST={warehouse:['外仓 WH-A','内仓1 WH-B','内仓2 WH-C'],workshop:['缝制一车间','组装二车间','包装三车间']};
    var allocations=[
      {item:'oxf',type:'warehouse',dest:'外仓 WH-A',place:'WH-A-05-02-03',qty:800},
      {item:'oxf',type:'workshop',dest:'缝制一车间',place:'一监区 / 2栋 / 2层',qty:400},
      {item:'zip',type:'warehouse',dest:'内仓1 WH-B',place:'WH-B-02-01',qty:1200},
      {item:'zip',type:'workshop',dest:'组装二车间',place:'二监区 / 1栋 / 1层',qty:800}
    ];
    var rows=root.querySelector('#receipt-allocation-rows'), summary=root.querySelector('#receipt-allocation-summary');
    function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
    function sync(){allocations=[].slice.call(rows.querySelectorAll('.receipt-allocation-row')).map(function(row){return {item:row.querySelector('[data-field="item"]').value,type:row.querySelector('[data-field="type"]').value,dest:row.querySelector('[data-field="dest"]').value,place:row.querySelector('[data-field="place"]').value,qty:Math.max(0,Number(row.querySelector('[data-field="qty"]').value)||0)};});}
    function options(list,current){return list.map(function(v){return '<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>';}).join('');}
    function render(){
      rows.innerHTML=allocations.map(function(a,index){var item=ITEMS.find(function(x){return x.id===a.item;})||ITEMS[0];var dests=DEST[a.type]||DEST.warehouse;var dest=dests.indexOf(a.dest)>-1?a.dest:dests[0];return '<div class="receipt-allocation-row rounded-lg border border-slate-200 bg-white p-2" data-index="'+index+'"><label class="receipt-allocation-wide text-[11px] text-slate-500">物料<select data-field="item" class="field mt-1" aria-label="去向分配物料">'+ITEMS.filter(function(x){return x.required;}).map(function(x){return '<option value="'+x.id+'"'+(x.id===a.item?' selected':'')+'>'+esc(x.name)+' · '+x.total+x.unit+'</option>';}).join('')+'</select></label><label class="text-[11px] text-slate-500">类型<select data-field="type" class="field mt-1" aria-label="去向类型"><option value="warehouse"'+(a.type==='warehouse'?' selected':'')+'>仓库</option><option value="workshop"'+(a.type==='workshop'?' selected':'')+'>车间</option></select></label><label class="text-[11px] text-slate-500">目标<select data-field="dest" class="field mt-1" aria-label="去向目标">'+options(dests,dest)+'</select></label><label class="text-[11px] text-slate-500">库区 / 监区 / 工位<input data-field="place" class="field mt-1" aria-label="库区监区或工位" value="'+esc(a.place)+'" placeholder="如 WH-A-05-02-03 / 一监区" /></label><label class="text-[11px] text-slate-500">数量（'+esc(item.unit)+'）<input data-field="qty" type="number" min="0" step="1" class="field mt-1" aria-label="分配数量" value="'+a.qty+'" /></label><button type="button" class="receipt-allocation-remove border border-slate-200 rounded-lg text-slate-500 hover:text-red-600" data-action="remove" aria-label="删除此去向" title="删除此去向"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div>';}).join('');
      rows.querySelectorAll('[data-field]').forEach(function(control){control.addEventListener('change',function(){var row=control.closest('.receipt-allocation-row');sync();if(control.getAttribute('data-field')==='type'){var i=Number(row.getAttribute('data-index'));var type=allocations[i].type;allocations[i].dest=(DEST[type]||DEST.warehouse)[0];render();}else{renderSummary();}});control.addEventListener('input',function(){sync();renderSummary();});});
      rows.querySelectorAll('[data-action="remove"]').forEach(function(btn){btn.addEventListener('click',function(){sync();var i=Number(btn.closest('.receipt-allocation-row').getAttribute('data-index'));allocations.splice(i,1);render();});});
      renderSummary();
    }
    function renderSummary(message){
      var totals={}; allocations.forEach(function(a){totals[a.item]=(totals[a.item]||0)+a.qty;});
      var ok=true; var html='<div class="flex flex-wrap gap-2">';
      ITEMS.forEach(function(item){var actual=totals[item.id]||0;if(!item.required){html+='<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] bg-slate-100 text-slate-500"><i class="fa-solid fa-minus" aria-hidden="true"></i>'+esc(item.name.split(' ')[0])+' 未勾选</span>';return;}var diff=actual-item.total,good=diff===0;ok=ok&&good;html+='<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] '+(good?'bg-emerald-100 text-emerald-700':'bg-orange-100 text-orange-700')+'"><i class="fa-solid '+(good?'fa-check':'fa-triangle-exclamation')+'" aria-hidden="true"></i>'+esc(item.name.split(' ')[0])+' '+actual+'/'+item.total+item.unit+(good?' 已配平':(diff>0?' 超配':' 待分配'))+'</span>';});
      var hasSelected=ITEMS.some(function(item){return item.required;});ok=ok&&hasSelected;html+='</div><p class="mt-2 text-[11px] '+(ok?'text-emerald-700':'text-orange-700')+'">'+(message||(!hasSelected?'请至少选择一种需要分配去向的物料。':ok?'所选物料均已分别配平，可以继续。':'请补齐或减少去向数量；每种所选物料都必须单独配平。'))+'</p>';
      summary.innerHTML=html; summary.dataset.valid=ok?'true':'false';
    }
    root.querySelector('#receipt-add-allocation').addEventListener('click',function(){sync();var selected=ITEMS.filter(function(item){return item.required;});if(!selected.length){if(typeof window.toast==='function')window.toast('请先选择需要分配去向的物料',true);materialChecks[0].focus();return;}var lastAllocation=allocations[allocations.length-1],base=lastAllocation&&selected.some(function(item){return item.id===lastAllocation.item;})?lastAllocation:{item:selected[0].id,type:'warehouse',dest:DEST.warehouse[0],place:'',qty:0};allocations.push({item:base.item,type:base.type,dest:base.dest,place:'',qty:0});render();var last=rows.lastElementChild;if(last){last.querySelector('[data-field="place"]').focus();}});
    materialChecks.forEach(function(check,index){check.addEventListener('change',function(){var item=ITEMS[index];item.required=check.checked;if(check.checked && !allocations.some(function(a){return a.item===item.id;})){allocations.push({item:item.id,type:'warehouse',dest:DEST.warehouse[0],place:'',qty:item.total});}if(!check.checked) allocations=allocations.filter(function(a){return a.item!==item.id;});render();});});
    render();
    window.receiptRoutingValid=function(){return summary.dataset.valid==='true'?{ok:true}:{ok:false,msg:'请至少选择一种物料，并确保每种所选物料的去向数量分别配平'};};
    var list=document.getElementById('recBody');
    if(list){var trs=list.querySelectorAll('tr');if(trs[0]&&trs[0].children.length>3){trs[0].children[2].innerHTML='牛津布 1200米 · <b class="text-blue-700">2个去向</b>';trs[0].children[3].innerHTML='<span class="block">外仓 WH-A · 800米</span><span class="block text-slate-500">缝制一车间 · 400米</span>';}if(trs[1]&&trs[1].children.length>3){trs[1].children[2].innerHTML='拉链 2000件 · <b class="text-blue-700">2个去向</b>';trs[1].children[3].innerHTML='<span class="block">内仓1 WH-B · 1200件</span><span class="block text-slate-500">组装二车间 · 800件</span>';}}
    var oldToast=window.toast;
    if(typeof oldToast==='function' && !oldToast.__receiptRouting){var wrapped=function(msg,err){if(String(msg).indexOf('提交成功')===0 && summary.dataset.valid!=='true'){renderSummary('当前去向尚未配平，已阻止入账；请检查每个物料的分配数量。');var bad=rows.querySelector('input[data-field="qty"]');if(bad)bad.focus();return;}return oldToast.apply(this,arguments);};wrapped.__receiptRouting=true;window.toast=wrapped;}
  }

  function enhanceBomFlow(){
    if(currentFile()!=='base.html' || document.getElementById('bom-list')) return;
    var p1=document.getElementById('p1');
    if(!p1) return;
    var boms=[
      {id:'bom-hd-jk-24-v3',product:'HD-JK-24款',version:'V3',owner:'张建国',updated:'2026-09-12 08:20',status:'active',statusText:'启用',items:[['HD-OXF-001 牛津布','藏青 150D','米','2.0','3%'],['HD-ZP-011 拉链','黑色 20cm','条','1.0','1%'],['HD-NK-005 纽扣','白色 四孔','个','5.0','2%']]},
      {id:'bom-hd-jk-24-v2',product:'HD-JK-24款',version:'V2',owner:'张建国',updated:'2026-08-26 16:10',status:'stopped',statusText:'停用',items:[['HD-OXF-001 牛津布','藏青 150D','米','2.1','3%'],['HD-ZP-011 拉链','黑色 20cm','条','1.0','1%']]},
      {id:'bom-hd-dk-24-v1',product:'HD-DK-24冬款',version:'V1',owner:'李小明',updated:'2026-09-09 14:42',status:'active',statusText:'启用',items:[['HD-OXF-001 牛津布','藏青 150D','米','2.4','4%'],['HD-NK-005 纽扣','白色 四孔','个','6.0','2%']]}
    ];
    var selectedId=boms[0].id;
    function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
    function statusHtml(bom){return '<span class="bom-status '+bom.status+'"><i class="fa-solid '+(bom.status==='active'?'fa-circle-check':bom.status==='draft'?'fa-pen':'fa-circle-pause')+'" aria-hidden="true"></i>'+esc(bom.statusText)+'</span>';}
    var list=document.createElement('section');
    list.id='bom-list'; list.className='bom-list'; list.setAttribute('aria-labelledby','bom-list-title');
    list.innerHTML='<div class="bom-list-header"><div><h2 id="bom-list-title" class="bom-list-title">BOM 列表</h2><p class="bom-list-meta" id="bom-list-meta" role="status" aria-live="polite"></p></div><button type="button" aria-label="新建 BOM" data-bom-new class="bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-bold"><i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>新建 BOM</button></div><div class="bom-list-scroll"><table class="bom-list-table"><thead><tr><th>成品/款号</th><th>版本</th><th>状态</th><th>负责人</th><th>最近更新</th><th>操作</th></tr></thead><tbody id="bom-list-body"></tbody></table></div>';
    p1.insertBefore(list,p1.firstElementChild);
    var bomTable=list.querySelector('.bom-list-table'); bomTable.style.setProperty('min-width','650px','important'); bomTable.style.setProperty('max-width','none','important'); bomTable.style.setProperty('width','650px','important');
    var body=list.querySelector('#bom-list-body'),meta=list.querySelector('#bom-list-meta');
    var detailCard=p1.querySelector('.card.col-span-2')||p1.querySelector('.card');
    var detailTitle=detailCard&&detailCard.querySelector('b');
    var detailBody=detailCard&&detailCard.querySelector('table tbody');
    function renderDetail(bom){
      if(!bom) return;
      if(detailTitle) detailTitle.textContent='BOM 版本 · '+bom.product+' '+bom.version;
      if(detailBody) detailBody.innerHTML=bom.items.map(function(item){return '<tr class="border-b"><td class="py-2">'+esc(item[0])+'</td><td>'+esc(item[1])+'</td><td>'+esc(item[2])+'</td><td><b>'+esc(item[3])+'</b></td><td>'+esc(item[4])+'</td><td>'+statusHtml({status:'active',statusText:'启用'})+'</td></tr>';}).join('');
    }
    function renderList(){
      body.innerHTML=boms.map(function(bom){var on=bom.id===selectedId;return '<tr class="bom-list-row '+(on?'is-selected':'')+'" data-bom-row="'+esc(bom.id)+'"><td><b>'+esc(bom.product)+'</b></td><td>'+esc(bom.version)+'</td><td>'+statusHtml(bom)+'</td><td>'+esc(bom.owner)+'</td><td>'+esc(bom.updated)+'</td><td><button type="button" class="bom-list-select" data-bom-select="'+esc(bom.id)+'" aria-pressed="'+(on?'true':'false')+'">'+(on?'当前版本':'查看 BOM')+'</button></td></tr>';}).join('');
      meta.textContent='共 '+boms.length+' 个 BOM · 当前查看 '+(boms.find(function(x){return x.id===selectedId;})||boms[0]).product+' '+(boms.find(function(x){return x.id===selectedId;})||boms[0]).version;
      body.querySelectorAll('[data-bom-select]').forEach(function(btn){btn.addEventListener('click',function(){selectedId=btn.getAttribute('data-bom-select');renderList();renderDetail(boms.find(function(x){return x.id===selectedId;}));});});
    }
    renderList(); renderDetail(boms[0]);
    var dialog=document.createElement('div'); dialog.className='bom-dialog'; dialog.hidden=true; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','bom-dialog-title');
    dialog.innerHTML='<div class="bom-dialog-panel"><div class="bom-dialog-header"><div><h2 id="bom-dialog-title" class="bom-dialog-title">新建 BOM</h2><p class="bom-dialog-subtitle">先建立产品版本，再补充物料用量。</p></div><button type="button" data-bom-close aria-label="关闭新建 BOM" title="关闭" class="text-slate-500 px-2"><i class="fa-solid fa-xmark text-lg" aria-hidden="true"></i></button></div><form id="bom-create-form" novalidate><div class="bom-form-grid"><label class="bom-form-field full">成品/款号 <input id="bom-product" aria-label="成品或款号" required aria-describedby="bom-form-error" placeholder="例如：HD-JK-25款" /></label><label class="bom-form-field">版本 <input id="bom-version" aria-label="BOM 版本" required aria-describedby="bom-form-error" placeholder="例如：V1" /></label><label class="bom-form-field">状态 <select id="bom-status" aria-label="BOM 状态"><option value="draft">草稿</option><option value="active">启用</option></select></label><label class="bom-form-field full">首个物料 <select id="bom-material" aria-label="首个物料"><option>HD-OXF-001 牛津布 · 米</option><option>HD-ZP-011 拉链 · 条</option><option>HD-NK-005 纽扣 · 个</option></select></label><label class="bom-form-field">单耗 <input id="bom-qty" aria-label="单耗" type="number" min="0.001" step="0.001" value="1" required aria-describedby="bom-form-error" /></label><label class="bom-form-field">损耗率 <input id="bom-loss" aria-label="损耗率" type="number" min="0" max="100" step="0.1" value="0" aria-describedby="bom-form-error" /></label></div><p id="bom-form-error" class="bom-form-error" role="alert" aria-live="assertive"></p><div class="bom-dialog-actions"><button type="button" data-bom-close class="border border-slate-200 rounded-lg px-4 py-2 text-xs">取消</button><button type="submit" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-bold">创建 BOM</button></div></form></div>';
    document.body.appendChild(dialog);
    var trigger=document.querySelector('[data-bom-new]'),form=dialog.querySelector('#bom-create-form'),product=dialog.querySelector('#bom-product'),version=dialog.querySelector('#bom-version'),error=dialog.querySelector('#bom-form-error'),lastFocus=null;
    function closeDialog(){dialog.hidden=true;document.body.style.overflow='';if(lastFocus)lastFocus.focus();}
    function openDialog(source){lastFocus=source||trigger;dialog.hidden=false;document.body.style.overflow='hidden';error.textContent='';product.removeAttribute('aria-invalid');version.removeAttribute('aria-invalid');window.setTimeout(function(){product.focus();},0);}
    trigger.addEventListener('click',function(){openDialog(trigger);});
    var detailNew=detailCard&&[].slice.call(detailCard.querySelectorAll('button')).find(function(btn){return btn.textContent.trim()==='新建';});
    if(detailNew){detailNew.onclick=function(e){e.preventDefault();openDialog(detailNew);};}
    dialog.querySelectorAll('[data-bom-close]').forEach(function(btn){btn.addEventListener('click',closeDialog);});
    dialog.addEventListener('click',function(e){if(e.target===dialog)closeDialog();});
    document.addEventListener('keydown',function(e){if(!dialog.hidden&&e.key==='Escape')closeDialog();});
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var productValue=product.value.trim(),versionValue=version.value.trim().toUpperCase(),qty=Number(dialog.querySelector('#bom-qty').value),loss=Number(dialog.querySelector('#bom-loss').value);
      var duplicate=boms.some(function(bom){return bom.product===productValue&&bom.version===versionValue;});
      if(!productValue||!versionValue||!Number.isFinite(qty)||qty<=0||!Number.isFinite(loss)||loss<0||loss>100||duplicate){
        error.textContent=duplicate?'这个成品和版本已经存在，请换一个版本。':'请填写成品/款号、版本，并检查单耗和损耗率。';
        if(!productValue||duplicate)product.setAttribute('aria-invalid','true');else product.removeAttribute('aria-invalid');
        if(!versionValue||duplicate)version.setAttribute('aria-invalid','true');else version.removeAttribute('aria-invalid');
        if(!productValue||duplicate)product.focus();else version.focus(); return;
      }
      var material=dialog.querySelector('#bom-material').value.split(' · '), status=dialog.querySelector('#bom-status').value;
      var bom={id:'bom-new-'+Date.now(),product:productValue,version:versionValue,owner:'张建国',updated:new Date().toISOString().slice(0,16).replace('T',' '),status:status,statusText:status==='active'?'启用':'草稿',items:[[material[0],material[1]||'',material[1]==='米'?'米':material[1]==='条'?'条':'个',String(qty),String(loss)+'%']]};
      boms.unshift(bom);selectedId=bom.id;renderList();renderDetail(bom);closeDialog();form.reset();dialog.querySelector('#bom-qty').value='1';dialog.querySelector('#bom-loss').value='0';if(typeof window.toast==='function')window.toast('BOM '+bom.product+' '+bom.version+' 已创建，当前已切换到新版本');
    });
  }

  function enhanceAdvancedFilters(){
    if(currentFile()==='equipment.html') return;
    var configs={
      'docs.html':{body:'#recBody',fields:[['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]],['仓库/去向',[['外仓 WH-A','外仓|WH-A'],['内仓1 WH-B','内仓1|WH-B'],['车间','车间']]],['负责人',[['张建国','张建国'],['王芳','王芳'],['李小明','李小明']]]]},
      'receipt.html':{body:'#recBody',fields:[['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]],['去向',[['外仓','外仓'],['内仓','内仓'],['车间直送','车间|直送']]],['办理状态',[['待确认','待确认'],['处理中','处理中'],['已完成','已完成']]]]},
      'issue.html':{body:'#recBody',fields:[['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]],['接收车间',[['裁剪车间','裁剪车间'],['缝制一车间','缝制一车间']]],['接收情况',[['待接收','待接收'],['运输中','运输中'],['已完成','已完成']]]]},
      'transfer.html':{body:'#recBody',fields:[['来源仓库',[['外仓','外仓→'],['内仓','内仓→']]],['目标仓库',[['内仓1','→内仓1'],['内仓2','→内仓2'],['外仓','→外仓']]],['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]]]},
      'return.html':{body:'#recBody',fields:[['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]],['判定结果',[['待判定','待判定'],['可用','可用'],['待检','待检'],['损坏/污染','损坏|污染']]],['物料类别',[['面料','牛津布|里布'],['辅料','拉链|纽扣|织带']]]]},
      'finished.html':{body:'#recBody',fields:[['客户',[['恒达服饰','恒达'],['宏远纺织','宏远']]],['去向',[['外部客户','外部客户'],['外仓','外仓'],['内仓','内仓']]],['交接状态',[['待交接','待交接'],['已交接','已交接'],['已暂存','已暂存']]]]},
      'stocktake.html':{body:'#recBody',fields:[['仓库/库区',[['外仓 WH-A','WH-A'],['内仓1 WH-B','WH-B'],['A-05区','A-05'],['A-06区','A-06']]],['盘点结果',[['盘亏','-'],['盘盈','+'],['实盘中','实盘中']]],['处理状态',[['待复核','待复核'],['待原因','待原因'],['已关闭','已关闭']]]]},
      'equipment.html':{body:'#eqBody',fields:[['负责人',[['王班长','王班长'],['张建国','张建国'],['王芳','王芳']]],['保养周期',[['月保','月保'],['季保','季保'],['半年保','半年保']]],['风险情况',[['有预警','逾期|预警'],['维修中','维修中'],['停机','停机']]]]},
      'inventory.html':{body:'#view1 tbody',fields:[['物料类别',[['面料','牛津布|里布'],['辅料','拉链|纽扣|织带']]],['库存情况',[['有待检','待检'],['混放库区','混放'],['仅可用','可用']]],['更新时间',[['08:00以后','08:'],['今日更新','07:|08:|09:']]]]},
      'location.html':{body:'#binBody',fields:[['占用情况',[['高占用','38/42|30/42'],['空闲','空闲|0/42'],['锁定/冻结','锁定|冻结']]],['物料类别',[['面料','牛津布|里布'],['辅料','拉链|纽扣|织带'],['无物料','空 · 可分配']]],['二维码状态',[['已核验','已核验'],['已绑定','AQ-WHA'],['需处理','不一致|未绑定']]]]},
      'users.html':{body:'#utb',fields:[['账号状态',[['启用','启用'],['停用','停用'],['锁定','锁定']]],['角色',[['仓库人员','仓库'],['车间人员','车间'],['财务人员','财务'],['管理人员','管理员|管理层']]],['数据范围',[['全部仓库','外仓/内仓'],['一监区','一监区'],['指定车间','缝制一车间|裁剪车间']]]]},
      'workshop.html':{body:'#recBody',fields:[['物料类别',[['面料','牛津布|里布'],['辅料','拉链|纽扣|织带']]],['业务状态',[['申请中','申请中'],['直送中','直送中'],['已发料','已发料'],['已接收','已接收']]],['数量区间',[['500以下','120米|30米'],['500及以上','500米|800米|1200米']]]]}
    };
    var cfg=configs[currentFile()];if(!cfg)return;
    var tbody=document.querySelector(cfg.body);if(!tbody||document.querySelector('.wms-more-filters'))return;
    var table=tbody.closest('table'),scope=table&&table.closest('.card');if(!scope)return;
    var toolbar=[].slice.call(scope.querySelectorAll('.flex')).find(function(el){return !el.closest('table')&&el.querySelector('input,select');});
    if(!toolbar&&currentFile()==='users.html'){var userSearch=document.getElementById('kw');toolbar=userSearch&&userSearch.parentElement;}
    if(!toolbar)return;
    if(!document.getElementById('wms-more-filter-style')){var fs=document.createElement('style');fs.id='wms-more-filter-style';fs.textContent='.wms-more-filters{position:relative}.wms-more-filters>summary{list-style:none;min-height:36px;display:flex;align-items:center;padding:7px 11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;font-size:12px;font-weight:700;cursor:pointer}.wms-more-filters>summary::-webkit-details-marker{display:none}.wms-more-filter-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:35;width:min(520px,calc(100vw - 32px));display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:11px;border:1px solid #bfdbfe;border-radius:12px;background:#fff;box-shadow:0 14px 32px rgba(30,99,148,.2)}.wms-more-filter-field{display:grid;gap:4px;font-size:10px;color:#64748b}.wms-more-filter-field select{width:100%;min-width:0;height:36px;border:1px solid #dbe4ee;border-radius:8px;padding:0 8px;background:#fff;color:#334155;font-size:11px}.wms-more-filter-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:3px}.wms-more-filter-reset{min-height:34px;padding:6px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#475569;font-size:11px}.wms-more-filter-count{font-size:10px;color:#64748b}@media(max-width:620px){.wms-more-filter-panel{position:fixed;left:16px;right:16px;top:20%;width:auto;grid-template-columns:1fr;max-height:65vh;overflow:auto}.wms-more-filter-actions{grid-column:1}}';document.head.appendChild(fs);}
    var details=document.createElement('details');details.className='wms-more-filters';details.innerHTML='<summary>更多筛选</summary><div class="wms-more-filter-panel"></div>';
    var panel=details.querySelector('.wms-more-filter-panel');
    cfg.fields.forEach(function(field,index){var label=document.createElement('label');label.className='wms-more-filter-field';label.textContent=field[0];var select=document.createElement('select');select.setAttribute('data-more-filter',String(index));select.setAttribute('aria-label',field[0]);select.innerHTML='<option value="">全部'+field[0]+'</option>'+field[1].map(function(option){return '<option value="'+option[1]+'">'+option[0]+'</option>';}).join('');label.appendChild(select);panel.appendChild(label);});
    var actions=document.createElement('div');actions.className='wms-more-filter-actions';actions.innerHTML='<span class="wms-more-filter-count" role="status" aria-live="polite"></span><button type="button" class="wms-more-filter-reset">清空更多筛选</button>';panel.appendChild(actions);
    var spacer=[].slice.call(toolbar.children).find(function(el){return el.classList&&el.classList.contains('flex-1');});toolbar.insertBefore(details,spacer||null);
    details.open=true;
    if(!document.getElementById('wms-more-filter-inline-style')){var inlineStyle=document.createElement('style');inlineStyle.id='wms-more-filter-inline-style';inlineStyle.textContent='.wms-more-filters{position:static!important;display:contents}.wms-more-filters>summary{display:none!important}.wms-more-filter-panel{position:static!important;display:flex!important;align-items:center;flex-wrap:wrap;gap:8px;width:auto!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.wms-more-filter-field{display:flex!important;align-items:center;gap:5px;min-width:150px;white-space:nowrap}.wms-more-filter-field select{height:36px}.wms-more-filter-actions{display:flex!important;align-items:center;gap:8px;padding:0!important}.wms-more-filter-reset{min-height:36px}@media(max-width:760px){.wms-more-filter-panel{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%!important}.wms-more-filter-field{min-width:0;display:grid!important;white-space:normal}.wms-more-filter-actions{grid-column:1/-1}}';document.head.appendChild(inlineStyle);}
    var existingToolbarText=toolbar.textContent||'';panel.querySelectorAll('.wms-more-filter-field').forEach(function(field){var select=field.querySelector('select');var optionLabels=[].slice.call(select.options).slice(1).map(function(option){return option.textContent;});if(optionLabels.length&&optionLabels.every(function(label){return existingToolbarText.indexOf(label)>-1;}))field.remove();});
    var rows=[].slice.call(tbody.querySelectorAll('tr')),count=actions.querySelector('.wms-more-filter-count');
    function applyMoreFilters(){var selected=[].slice.call(details.querySelectorAll('[data-more-filter]')).map(function(el){return el.value;});rows.forEach(function(row){if(row.dataset.moreFilterHidden==='1'){row.style.display='';row.dataset.moreFilterHidden='';}});if(typeof window.doQ==='function')try{window.doQ();}catch(e){}rows.forEach(function(row){if(row.style.display==='none')return;var text=row.textContent.replace(/\s+/g,' ');var ok=selected.every(function(value){return !value||value.split('|').some(function(token){return text.indexOf(token)>-1;});});if(!ok){row.style.display='none';row.dataset.moreFilterHidden='1';}});var visible=rows.filter(function(row){return row.style.display!=='none';}).length;count.textContent='当前显示 '+visible+' 条';if(typeof window.doCount==='function')try{window.doCount();}catch(e){}var empty=document.getElementById('empty')||document.getElementById('recEmpty');if(empty)empty.classList.toggle('hidden',visible>0);}
    details.querySelectorAll('[data-more-filter]').forEach(function(el){el.addEventListener('change',applyMoreFilters);});actions.querySelector('button').addEventListener('click',function(){details.querySelectorAll('[data-more-filter]').forEach(function(el){el.value='';});applyMoreFilters();});toolbar.querySelectorAll('input,select').forEach(function(el){if(!el.hasAttribute('data-more-filter')){el.addEventListener('input',function(){setTimeout(applyMoreFilters,0);});el.addEventListener('change',function(){setTimeout(applyMoreFilters,0);});}});document.querySelectorAll('.area-card,.mode-tab').forEach(function(el){el.addEventListener('click',function(){setTimeout(applyMoreFilters,0);});});applyMoreFilters();
  }

  function enhanceBusinessClassification(){
    var supported=['receipt.html','issue.html','transfer.html','return.html','finished.html','docs.html'];
    if(supported.indexOf(currentFile())===-1) return;
    var orderPattern=/(?:SL|ZS|CK|DB|SQ|LY|TL|CP|PD|YC|EX)\d{10}/;
    var typeByPrefix={SL:'新进物料',ZS:'直送领料',CK:'普通出库',DB:'仓间调拨',SQ:'申请领料',LY:'普通领料',TL:'车间退料',CP:'成品流转',PD:'盘点',YC:'异常处理',EX:'异常处理'};
    function classify(row){
      var text=row.textContent.replace(/\s+/g,' ').trim(),match=text.match(orderPattern);
      if(!match) return null;
      var id=match[0],prefix=id.slice(0,2),type=typeByPrefix[prefix]||'业务工单',action='不直接变动库存';
      if(prefix==='SL') action='入库（按去向分配）';
      if(prefix==='ZS'||prefix==='CK'||prefix==='LY') action='来源库存扣减';
      if(prefix==='DB') action='来源仓扣减 + 目的仓增加';
      if(prefix==='TL') action='退料入库';
      if(prefix==='PD') action='复核后差异调整';
      if(prefix==='CP'){
        if(/外部客户|客户交付|发货/.test(text)){type='成品交付';action='成品出库';}
        else if(/内仓|外仓|暂存|入库/.test(text)){type='成品入库';action='成品入库';}
        else action='按去向入库或出库';
      }
      return {id:id,type:type,action:action,prefix:prefix};
    }
    function decorate(table,row){
      if(!row.cells||!row.cells.length||row.dataset.businessClassified==='true') return;
      var info=classify(row);if(!info)return;
      var first=row.cells[0],raw=(first.innerText||first.textContent).replace(/\s+/g,' ').trim();
      var related=(raw.match(new RegExp(orderPattern.source,'g'))||[]).filter(function(id){return id!==info.id;});
      first.innerHTML='<span class="wms-business-type">'+info.type+'</span><br><b class="text-blue-700">'+info.id+'</b>'+(related.length?'<br><span class="wms-related-order">关联 '+related.join(' / ')+'</span>':'');
      first.dataset.businessType=info.type;first.dataset.orderId=info.id;
      var actionCell=document.createElement('td');actionCell.className='wms-inventory-action';actionCell.innerHTML='<span>'+info.action+'</span>';actionCell.dataset.inventoryAction=info.action;
      var actionHead=[].slice.call(table.tHead.rows[table.tHead.rows.length-1].cells).find(function(cell){return cell.dataset.inventoryActionHead==='true';});
      var commonViewCell=row.querySelector('[data-record-action]')&&row.querySelector('[data-record-action]').closest('td'),needsHandlingPlaceholder=commonViewCell&&actionHead&&commonViewCell.cellIndex<actionHead.cellIndex;
      while(commonViewCell&&actionHead&&commonViewCell.cellIndex<actionHead.cellIndex){var placeholder=document.createElement('td');placeholder.className='text-slate-300';placeholder.textContent='—';row.insertBefore(placeholder,commonViewCell);}
      row.insertBefore(actionCell,actionHead&&row.cells[actionHead.cellIndex]?row.cells[actionHead.cellIndex]:null);
      if(needsHandlingPlaceholder&&commonViewCell){var handling=document.createElement('td');handling.className='text-slate-300';handling.textContent='—';row.insertBefore(handling,commonViewCell);}
      row.dataset.businessClassified='true';
    }
    if(!document.getElementById('wms-business-classification-style')){
      var style=document.createElement('style');style.id='wms-business-classification-style';style.textContent='.wms-business-type{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:10px;font-weight:800;line-height:1.5;white-space:nowrap}.wms-related-order{color:#94a3b8;font-size:10px;font-weight:500}.wms-inventory-action span{display:inline-flex;max-width:180px;padding:4px 8px;border:1px solid #dbeafe;border-radius:8px;background:#f8fcff;color:#315b7d;font-size:10px;font-weight:700;line-height:1.45}.wms-inventory-ledger{margin-top:14px;border:1px solid #bfdbfe;border-radius:12px;overflow:hidden;background:#fff}.wms-inventory-ledger-title{padding:10px 12px;background:#eff8ff;color:#0f4f82;font-size:12px;font-weight:800}.wms-ledger-row{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border-top:1px solid #eaf1f7;font-size:12px}.wms-ledger-kind{color:#64748b}.wms-ledger-place{color:#1e3a5f;font-weight:700;overflow-wrap:anywhere}.wms-ledger-value{font-weight:800;white-space:nowrap}.wms-ledger-value.minus{color:#dc2626}.wms-ledger-value.plus{color:#059669}.wms-ledger-value.pending{color:#d97706}.wms-ledger-foot{padding:9px 12px;border-top:1px solid #eaf1f7;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.5}@media(max-width:620px){.wms-inventory-action span{max-width:140px}.wms-ledger-row{grid-template-columns:82px minmax(0,1fr);gap:6px}.wms-ledger-value{grid-column:2}}';document.head.appendChild(style);
    }
    document.querySelectorAll('table').forEach(function(table){
      var body=table.tBodies&&table.tBodies[0],head=table.tHead&&table.tHead.rows[table.tHead.rows.length-1];if(!body||!head)return;
      var rows=[].slice.call(body.rows),hasOrders=rows.some(function(row){return row.cells[0]&&orderPattern.test(row.cells[0].textContent);});if(!hasOrders)return;
      var firstHead=head.cells[0];if(firstHead)firstHead.textContent='业务类型 / 单号';
      if(![].slice.call(head.cells).some(function(cell){return cell.dataset.inventoryActionHead==='true';})){
        var actionHead=document.createElement('th');actionHead.textContent='库存动作';actionHead.dataset.inventoryActionHead='true';
        var operationHead=[].slice.call(head.cells).find(function(cell){return /操作/.test(cell.textContent);});head.insertBefore(actionHead,operationHead||null);
      }
      var operationHeads=[].slice.call(head.cells).filter(function(cell){return /操作|办理|查看/.test(cell.textContent);});
      if(operationHeads.length>1){operationHeads[0].textContent='办理';operationHeads[operationHeads.length-1].textContent='查看';}
      rows.forEach(function(row){decorate(table,row);});
    });
    if(!document.body.dataset.businessClassificationObserve){document.body.dataset.businessClassificationObserve='true';new MutationObserver(function(records){records.forEach(function(record){[].slice.call(record.addedNodes).forEach(function(node){if(node.nodeType!==1)return;var rows=[];if(node.matches&&node.matches('tr'))rows.push(node);if(node.querySelectorAll)rows=rows.concat([].slice.call(node.querySelectorAll('tr')));rows.forEach(function(row){var table=row.closest('table');if(table&&table.tHead&&row.cells[0]&&orderPattern.test(row.cells[0].textContent))decorate(table,row);});});});}).observe(document.body,{childList:true,subtree:true});}
  }

  function enhanceWorkOrderDrawers(){
    var orderPattern=/(?:SL|ZS|CK|DB|SQ|LY|TL|CP|PD|YC|EX)\d{10}/;
    var rows=[].slice.call(document.querySelectorAll('table tbody tr')).filter(function(row){return row.cells[0]&&orderPattern.test(row.cells[0].textContent);});
    if(!rows.length) return;
    var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});};
    var backdrop=document.getElementById('wms-order-backdrop'),drawer=document.getElementById('wms-order-drawer'),lastFocus=null,previousOverflow='';
    if(!drawer){
      var style=document.createElement('style');style.id='wms-order-drawer-style';style.textContent='.wms-order-backdrop{position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.22);opacity:0;visibility:hidden;transition:opacity .16s ease,visibility .16s ease}.wms-order-backdrop.is-open{opacity:1;visibility:visible}.wms-order-drawer{position:fixed;right:0;top:0;z-index:71;width:min(460px,94vw);height:100vh;overflow:auto;padding:0;background:#fff;border-left:1px solid #dbeafe;box-shadow:-18px 0 42px rgba(15,23,42,.18);transform:translateX(100%);transition:transform .18s ease}.wms-order-drawer.is-open{transform:translateX(0)}.wms-order-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 15px;background:rgba(255,255,255,.97);border-bottom:1px solid #e2e8f0}.wms-order-drawer-kicker{font-size:11px;color:#2563eb;font-weight:700}.wms-order-drawer-title{margin-top:3px;font-size:17px;line-height:1.35;color:#0f4f82;font-weight:800}.wms-order-drawer-close{display:inline-flex;align-items:center;justify-content:center;min-width:38px;width:38px;height:38px;border:1px solid #dbe4ee;border-radius:10px;color:#64748b;background:#fff}.wms-order-drawer-body{padding:18px 20px 24px}.wms-order-summary{padding:13px;border:1px solid #bfdbfe;border-radius:12px;background:#eff8ff;color:#334155;font-size:12px;line-height:1.65}.wms-order-fields{margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.wms-order-field{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;padding:11px 12px;border-bottom:1px solid #eef2f7;font-size:12px;line-height:1.55}.wms-order-field:last-child{border-bottom:0}.wms-order-field dt{color:#64748b}.wms-order-field dd{margin:0;color:#1e3a5f;font-weight:650;overflow-wrap:anywhere}.wms-order-note{margin-top:14px;padding:11px 12px;border-left:3px solid #60a5fa;border-radius:0 9px 9px 0;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.6}.wms-order-link{display:block;width:100%;min-height:36px;padding:4px 0;border:0;background:transparent;color:#1d4ed8;font:inherit;font-weight:700;text-align:left;cursor:pointer}.wms-order-row{cursor:pointer}.wms-order-row:hover{background:#eff6ff}.wms-order-row:focus-within{background:#eff6ff}@media(max-width:620px){.wms-order-drawer{width:100vw;max-width:100vw}.wms-order-drawer-head{padding:16px}.wms-order-drawer-body{padding:14px 16px 22px}.wms-order-field{grid-template-columns:92px minmax(0,1fr)}}@media(prefers-reduced-motion:reduce){.wms-order-backdrop,.wms-order-drawer{transition:none}}';document.head.appendChild(style);
      backdrop=document.createElement('div');backdrop.id='wms-order-backdrop';backdrop.className='wms-order-backdrop';backdrop.hidden=true;
      drawer=document.createElement('div');drawer.id='wms-order-drawer';drawer.className='wms-order-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-hidden','true');drawer.setAttribute('aria-labelledby','wms-order-drawer-title');drawer.innerHTML='<div class="wms-order-drawer-head"><div><div class="wms-order-drawer-kicker">工单详情</div><h2 id="wms-order-drawer-title" class="wms-order-drawer-title">业务工单</h2></div><button type="button" class="wms-order-drawer-close" aria-label="关闭工单详情" title="关闭"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="wms-order-drawer-body"><div id="wms-order-summary" class="wms-order-summary"></div><dl id="wms-order-fields" class="wms-order-fields"></dl><section id="wms-inventory-ledger" class="wms-inventory-ledger" aria-labelledby="wms-inventory-ledger-title" hidden></section><div class="wms-order-note">这里只查看本单完整数据；需要继续处理时，请关闭抽屉后点击列表中的“继续办理”。</div></div>';
      document.body.appendChild(backdrop);document.body.appendChild(drawer);
    }
    var closeButton=drawer.querySelector('.wms-order-drawer-close'),title=drawer.querySelector('#wms-order-drawer-title'),summary=drawer.querySelector('#wms-order-summary'),fields=drawer.querySelector('#wms-order-fields'),ledger=drawer.querySelector('#wms-inventory-ledger');
    function focusable(){return [].slice.call(drawer.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(el){return !el.disabled&&el.offsetParent!==null;});}
    function close(){if(drawer.getAttribute('aria-hidden')==='true')return;drawer.classList.remove('is-open');backdrop.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.style.overflow=previousOverflow;window.setTimeout(function(){backdrop.hidden=true;if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus();},180);}
    function open(row,source){
      var table=row.closest('table'),heads=table&&table.tHead?[] .slice.call(table.tHead.rows[table.tHead.rows.length-1].cells):[];
      var values=[];[].slice.call(row.cells).forEach(function(cell,index){var label=(heads[index]&&heads[index].textContent||('字段'+(index+1))).trim();if(/操作|办理|查看/.test(label))return;var value=cell.textContent.replace(/\s+/g,' ').trim()||'—';if(index===0&&cell.dataset.businessType&&cell.dataset.orderId)value=cell.dataset.businessType+' · '+cell.dataset.orderId;values.push([label,value]);});
      var first=values[0]&&values[0][1]||'业务工单',ids=first.match(new RegExp(orderPattern.source,'g'))||[],status=values.filter(function(item){return /状态|节点|进度/.test(item[0]);}).map(function(item){return item[1];}).filter(Boolean).join(' · ');
      title.textContent=(ids[0]||first)+' · 详情';summary.innerHTML='<b>'+esc(ids.length>1?ids.join(' / '):(ids[0]||first))+'</b><br>'+esc(status||'当前工单数据已加载')+(ids.length>1?'<br><span style="color:#64748b">关联单据：'+esc(ids.slice(1).join('、'))+'</span>':'');
      fields.innerHTML=values.map(function(item){return '<div class="wms-order-field"><dt>'+esc(item[0])+'</dt><dd>'+esc(item[1])+'</dd></div>';}).join('');
      if(ledger){
        var id=ids[0]||'',isTransfer=id.indexOf('DB')===0;ledger.hidden=!isTransfer;ledger.innerHTML='';
        if(isTransfer){
          var route=values.find(function(item){return /源仓|来源.*目标/.test(item[0]);});var routeText=route?route[1]:'';var places=routeText.split(/\s*(?:→|->)\s*/);var sourcePlace=places[0]||'来源仓库',targetPlace=places[1]||'目的仓库';
          var material=values.find(function(item){return /客户.*物料|物料/.test(item[0]);});var materialText=material?material[1]:'';var qtyMatch=materialText.match(/([\d.]+)\s*(米|件|个|卷|箱|套|公斤|kg)?\s*$/i);var requested=qtyMatch?qtyMatch[1]:'—',unit=qtyMatch&&qtyMatch[2]?qtyMatch[2]:'';
          var counts=values.find(function(item){return /申请.*已发.*已收/.test(item[0]);});var countParts=counts?counts[1].split('/').map(function(value){return value.trim();}):[];var sent=countParts[1]&&countParts[1]!=='—'?countParts[1]:requested;var received=countParts[2]&&countParts[2]!=='—'?countParts[2]:'';var pending=!received;var diff=!pending&&Number(sent)!==Number(received)?Math.abs(Number(sent)-Number(received)):0;
          ledger.innerHTML='<div id="wms-inventory-ledger-title" class="wms-inventory-ledger-title">库存记录 · 一张调拨单，两条库存变化</div><div class="wms-ledger-row"><span class="wms-ledger-kind">来源仓扣减</span><span class="wms-ledger-place">'+esc(sourcePlace)+'</span><span class="wms-ledger-value minus">−'+qtyUnit(sent,unit)+'</span></div><div class="wms-ledger-row"><span class="wms-ledger-kind">目的仓增加</span><span class="wms-ledger-place">'+esc(targetPlace)+'</span><span class="wms-ledger-value '+(pending?'pending':'plus')+'">'+(pending?'待接收 +':'')+qtyUnit(received||sent,unit)+'</span></div><div class="wms-ledger-foot">'+(diff?'当前差异 '+qtyUnit(diff,unit)+'，需复核后关闭调拨单。':pending?'来源仓已扣减，目的仓接收后增加；仍属于同一张调拨工单。':'调拨已完成，系统总库存不变；列表不会拆成普通出库和普通入库。')+'</div>';
        }
      }
      lastFocus=source||document.activeElement;previousOverflow=document.body.style.overflow;backdrop.hidden=false;drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';requestAnimationFrame(function(){backdrop.classList.add('is-open');drawer.classList.add('is-open');closeButton.focus();});
    }
    if(!drawer.dataset.bound){drawer.dataset.bound='true';closeButton.addEventListener('click',close);backdrop.addEventListener('pointerdown',close);document.addEventListener('keydown',function(e){if(drawer.getAttribute('aria-hidden')==='true')return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}if(e.key!=='Tab')return;var list=focusable();if(!list.length)return;var first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});}
    function bind(row){
      if(row.dataset.orderDrawerBound)return;row.dataset.orderDrawerBound='true';row.classList.add('wms-order-row');
      var cell=row.cells[0],button=document.createElement('button'),cellLabel=(cell.innerText||cell.textContent).replace(/\s+/g,' ').trim();button.type='button';button.className='wms-order-link';button.setAttribute('aria-label','查看工单 '+cellLabel+' 详情');while(cell.firstChild)button.appendChild(cell.firstChild);cell.appendChild(button);
      button.addEventListener('click',function(e){e.stopPropagation();open(row,button);});row.addEventListener('click',function(e){if(e.target.closest('button,a,input,select,textarea,label'))return;open(row,row);});
    }
    rows.forEach(bind);
    if(!document.body.dataset.orderDrawerObserve){document.body.dataset.orderDrawerObserve='true';new MutationObserver(function(records){records.forEach(function(record){[].slice.call(record.addedNodes).forEach(function(node){if(node.nodeType!==1)return;var candidates=[];if(node.matches&&node.matches('tr'))candidates.push(node);if(node.querySelectorAll)candidates=candidates.concat([].slice.call(node.querySelectorAll('tr')));candidates.forEach(function(row){if(row.cells&&row.cells[0]&&orderPattern.test(row.cells[0].textContent))bind(row);});});});}).observe(document.body,{childList:true,subtree:true});}
    window.wmsOpenOrderDetail=function(row,source){open(row,source);};
  }

  function enhanceOcrWorkspace(){
    if(currentFile()!=='ocr.html' || document.getElementById('wms-ocr-records')) return;
    var content=document.querySelector('.p-6'); if(!content) return;
    var sourcePanel=content.querySelector('.card');
    var workspace=content.querySelector('.grid'); if(!sourcePanel||!workspace) return;
    var style=document.createElement('style');style.id='wms-ocr-record-style';style.textContent='.wms-ocr-records{border:1px solid #bfdbfe;border-radius:14px;background:#fff;overflow:hidden}.wms-ocr-record-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e2e8f0;background:#f8fcff}.wms-ocr-record-title{font-size:15px;font-weight:800;color:#0f4f82}.wms-ocr-record-subtitle{margin-top:4px;font-size:11px;color:#64748b}.wms-ocr-record-actions{display:flex;gap:8px;flex-wrap:wrap}.wms-ocr-record-actions button{min-height:36px;padding:7px 12px;border-radius:9px;font-size:12px;font-weight:700}.wms-ocr-record-primary{border:1px solid #2563eb;background:#2563eb;color:#fff}.wms-ocr-record-secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}.wms-ocr-record-filter{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid #eef2f7}.wms-ocr-record-filter select,.wms-ocr-record-filter input{height:36px;min-width:150px;border:1px solid #dbe4ee;border-radius:8px;padding:0 9px;font-size:11px;color:#334155;background:#fff}.wms-ocr-record-table{width:100%;min-width:760px;border-collapse:collapse;font-size:12px}.wms-ocr-record-table th{padding:10px 14px;background:#eff8ff;color:#64748b;text-align:left;font-weight:700}.wms-ocr-record-table td{padding:12px 14px;border-top:1px solid #eef2f7;color:#334155}.wms-ocr-record-table tbody tr:hover{background:#f8fcff}.wms-ocr-type{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:700}.wms-ocr-type.scan{background:#dcfce7;color:#047857}.wms-ocr-type.upload{background:#e0e7ff;color:#4338ca}.wms-ocr-type.photo{background:#fef3c7;color:#b45309}.wms-ocr-status{display:inline-flex;padding:4px 8px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:10px}.wms-ocr-open{border:0;background:transparent;color:#2563eb;font-size:12px;font-weight:700;cursor:pointer}.wms-ocr-empty{padding:34px;text-align:center;color:#94a3b8;font-size:12px}@media(max-width:720px){.wms-ocr-record-head{display:block}.wms-ocr-record-actions{margin-top:12px}.wms-ocr-record-filter select,.wms-ocr-record-filter input{flex:1;min-width:0}.wms-ocr-table-scroll{overflow-x:auto}}';document.head.appendChild(style);
    var records=[
      ['OCR2026091201','送货单','扫描件','Fujitsu fi-7160','恒达服饰 · 送货单 SL2026091209','处理中','08:31'],
      ['OCR2026091202','物料箱贴','扫码','PDA-03','HD-ZP-011 拉链 · 箱码 BX2026091003-02','已识别','08:28'],
      ['OCR2026091198','送货单','上传照片','张建国','宏远纺织 · 送货单 SL2026091205','已确认','昨日 17:42'],
      ['OCR2026091196','物料箱贴','上传照片','李小明','HD-OXF-001 牛津布 · 箱码 BX2026090901-01','待复核','昨日 16:10']
    ];
    var list=document.createElement('section');list.id='wms-ocr-records';list.className='wms-ocr-records';list.setAttribute('aria-labelledby','wms-ocr-record-title');list.innerHTML='<div class="wms-ocr-record-head"><div><h1 id="wms-ocr-record-title" class="wms-ocr-record-title">OCR 扫描记录</h1><p class="wms-ocr-record-subtitle">送货单与物料箱贴统一留痕 · 支持扫描件、上传照片和移动端扫码</p></div><div class="wms-ocr-record-actions"><button type="button" class="wms-ocr-record-secondary" data-ocr-upload>上传照片</button><button type="button" class="wms-ocr-record-primary" data-ocr-open>扫描单据</button></div></div><div class="wms-ocr-record-filter"><input type="search" placeholder="搜索记录号 / 单号 / 物料 / 箱码" aria-label="搜索 OCR 扫描记录" data-ocr-search><select aria-label="扫描对象筛选" data-ocr-kind><option value="">全部对象</option><option>送货单</option><option>物料箱贴</option></select><select aria-label="来源方式筛选" data-ocr-source><option value="">全部来源</option><option>扫描件</option><option>上传照片</option><option>扫码</option></select><span class="text-[11px] text-slate-400 self-center" data-ocr-count></span></div><div class="wms-ocr-table-scroll"><table class="wms-ocr-record-table"><thead><tr><th>记录号</th><th>扫描对象</th><th>来源方式</th><th>设备/人员</th><th>关联单据/内容</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody data-ocr-body></tbody></table></div>';
    content.insertBefore(list,content.firstElementChild);sourcePanel.remove();workspace.remove();
    var body=list.querySelector('[data-ocr-body]'),count=list.querySelector('[data-ocr-count]'),search=list.querySelector('[data-ocr-search]'),kind=list.querySelector('[data-ocr-kind]'),source=list.querySelector('[data-ocr-source]');
    function esc(value){return String(value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
    function typeClass(value){return value==='扫码'?'scan':value==='上传照片'?'upload':'photo';}
    function openResult(id){
      var target='ocr-result.html?tab='+encodeURIComponent(id)+'&from=ocr';
      try{
        if(inFrame&&window.parent&&typeof window.parent.go==='function'){
          window.parent.go('ocrResult',id);
          return;
        }
      }catch(e){}
      if(currentFile()!=='ocr-result.html'){
        location.href=target;
        return;
      }
      if(typeof window.toast==='function')window.toast(id+'：已进入OCR扫描结果页');
    }
    function render(){var q=(search.value||'').trim().toLowerCase(),k=kind.value,s=source.value,visible=records.filter(function(r){return (!q||r.join(' ').toLowerCase().indexOf(q)>-1)&&(!k||r[1]===k)&&(!s||r[2]===s);});body.innerHTML=visible.length?visible.map(function(r){return '<tr><td><button type="button" class="wms-ocr-open" data-ocr-open-row="'+esc(r[0])+'"><b class="text-blue-700">'+esc(r[0])+'</b></button></td><td>'+esc(r[1])+'</td><td><span class="wms-ocr-type '+typeClass(r[2])+'">'+esc(r[2])+'</span></td><td>'+esc(r[3])+'</td><td>'+esc(r[4])+'</td><td><span class="wms-ocr-status">'+esc(r[5])+'</span></td><td class="text-slate-400">'+esc(r[6])+'</td><td><button type="button" class="wms-ocr-open" data-ocr-open-row="'+esc(r[0])+'">查看结果</button></td></tr>';}).join(''):'<tr><td colspan="8" class="wms-ocr-empty">暂无匹配扫描记录</td></tr>';count.textContent='共 '+visible.length+' 条';body.querySelectorAll('[data-ocr-open-row]').forEach(function(btn){btn.addEventListener('click',function(){openResult(btn.dataset.ocrOpenRow);});});}
    list.querySelector('[data-ocr-open]').addEventListener('click',function(){openResult('OCR2026091201');});list.querySelector('[data-ocr-upload]').addEventListener('click',function(){var input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;input.addEventListener('change',function(){var file=input.files&&input.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){try{localStorage.setItem('jm_ocr_result_image',reader.result);}catch(e){}openResult('OCR2026091201');};reader.readAsDataURL(file);});input.click();});[search,kind,source].forEach(function(el){el.addEventListener('input',render);el.addEventListener('change',render);});
    render();
  }

  function enhancePage(){
    normalizePageTop();
    document.querySelectorAll('main h1,main h2,.p-6 h1,.p-6 h2').forEach(function(heading){
      var explanation=heading.nextElementSibling;
      if(explanation&&explanation.tagName==='P'&&!explanation.closest('[role="dialog"],dialog')) explanation.remove();
    });
    if(document.getElementById('wms-common-a11y')) return;
    if(currentFile()==='base.html'){
      var baseTabs=document.querySelector('.tab');
      if(baseTabs&&baseTabs.parentElement){baseTabs.parentElement.hidden=true;baseTabs.parentElement.setAttribute('aria-hidden','true');}
    }
    if(currentFile()==='workshop.html' || currentFile()==='docs.html'){
      var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),node;
      while(node=walker.nextNode()){
        node.nodeValue=node.nodeValue.replace(/申请\/领料\/接收/g,'申请领料/接收').replace(/申请\/领料/g,'申请领料').replace(/申请 \/ 领料/g,'申请领料').replace(/物料申请 · 领料 · 接收/g,'申请领料 · 接收');
      }
      if(currentFile()==='workshop.html') document.title='车间管理 · 申请领料/接收';
    }
    var st=document.createElement('style'); st.id='wms-common-a11y';
    st.textContent='.hidden,#m.hidden,#modal.hidden,#drawer.hidden,#d.hidden{display:none!important}body{overflow-x:hidden;min-width:0}button,a,input,select,textarea{min-height:36px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}table{min-width:640px}table.w-full{width:100%}.wms-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.45rem;min-height:180px;padding:1.25rem;text-align:center;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569}.wms-state[hidden]{display:none!important}.wms-state-icon{font-size:1.6rem;color:#2563eb}.wms-state-title{margin:0;font-size:14px;font-weight:700;color:#0f172a}.wms-state-body{margin:0;max-width:34rem;font-size:12px;line-height:1.6}.wms-state-action{min-height:40px;margin-top:.35rem;padding:.55rem .9rem;border-radius:9px;border:1px solid #2563eb;background:#2563eb;color:white;font-size:12px;font-weight:700}.wms-state[data-state="error"] .wms-state-icon{color:#dc2626}.wms-state[data-state="permission"] .wms-state-icon{color:#d97706}@media(max-width:900px){html,body{width:100%!important;max-width:100vw!important}aside{display:none!important}body>div.flex{display:block!important;min-height:100vh;width:100vw!important;max-width:100vw!important}body>div.flex>div.flex-1{width:100%!important;min-width:0!important}.p-6{padding:1rem!important}.p-6{width:calc(100vw - 2rem)!important;box-sizing:border-box!important}.p-6>.flex.justify-between{width:100%!important}.p-6,.p-6>*{min-width:0;max-width:100%}.font-mono{overflow-wrap:anywhere}.p-6 *{min-width:0!important;max-width:100%!important}.p-6 .grid,.p-6 .card{width:100%!important;min-width:0!important}.flex.gap-2{width:100%!important;min-width:0!important;max-width:100%!important}.p-6 .wms-table-scroll table{width:100%!important;min-width:760px!important;max-width:none!important}.p-6 .wms-table-scroll th{white-space:nowrap}.p-6>.flex.items-center.justify-between,.p-6>.flex.justify-between{flex-wrap:wrap;gap:.75rem}.p-6>.flex.justify-between>div:first-child{min-width:0}.p-6>.flex.justify-between>div:last-child{width:calc(100vw - 2rem)!important;max-width:100%!important;display:grid!important;grid-template-columns:1fr!important}.flex.gap-2{flex-wrap:wrap}.flex.gap-2>button{flex:1 1 0;min-width:0;white-space:normal}.grid-cols-6{grid-template-columns:repeat(3,minmax(0,1fr))!important}.grid-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))!important}.grid-cols-3,.grid-cols-2{grid-template-columns:1fr!important}.col-span-2{grid-column:span 1/span 1!important}[class*="w-["]{max-width:calc(100vw - 2rem)}.fixed.inset-0{padding:1rem}.fixed.inset-0>div{max-height:calc(100vh - 2rem);overflow:auto}.overflow-x-auto{scrollbar-width:thin}.wms-state{min-height:160px;padding:.9rem}.wms-state-body{overflow-wrap:anywhere}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}';
    document.head.appendChild(st);
    var mobileSt=document.createElement('style'); mobileSt.id='wms-mobile-layout';
    mobileSt.textContent='@media(max-width:900px){header{width:100%!important;max-width:100%!important;box-sizing:border-box!important;flex-wrap:wrap!important;gap:.75rem!important}header>.flex-1{min-width:0!important;max-width:100%!important;flex-basis:100%!important}header>[class*="w-["]{width:100%!important;max-width:100%!important}header input{min-width:0!important;max-width:100%!important}header button span.absolute{right:0!important}.p-6{overflow-x:hidden!important}}';
    document.head.appendChild(mobileSt);
    if(!document.querySelector('.wms-skip-link')){
      var main=document.querySelector('.p-6')||document.querySelector('main');
      if(main){main.id=main.id||'wms-main-content';var skip=document.createElement('a');skip.className='wms-skip-link';skip.href='#'+main.id;skip.textContent='跳到主要内容';document.body.insertBefore(skip,document.body.firstChild);}
    }
    document.querySelectorAll('table').forEach(function(table){
      if(table.parentElement.classList.contains('wms-table-scroll')) return;
      var wrap=document.createElement('div'); wrap.className='wms-table-scroll'; wrap.style.cssText='overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch';
      table.parentNode.insertBefore(wrap,table); wrap.appendChild(table);
      wrap.setAttribute('tabindex','0'); wrap.setAttribute('role','region'); wrap.setAttribute('aria-label','可横向滚动的数据表');
    });
    document.querySelectorAll('img:not([alt])').forEach(function(img){img.alt='物料管理系统业务图片';});
    document.querySelectorAll('input,select,textarea').forEach(function(control){
      if(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
      var label=control.closest('label'), text='';
      if(label){
        var clone=label.cloneNode(true);
        clone.querySelectorAll('input,select,textarea').forEach(function(x){x.remove();});
        text=clone.textContent.trim().replace(/[*：:]+$/,'').replace(/\s+/g,' ');
      }
      if(!text) text=control.getAttribute('place'+'holder')||'';
      if(!text){
        var type=(control.getAttribute('type')||'').toLowerCase();
        text=type==='checkbox'?'选择项':type==='date'?'日期':type==='datetime-local'?'日期时间':control.tagName.toLowerCase()==='select'?'选择项':'输入项';
      }
      control.setAttribute('aria-label',text);
    });
    var notice=null;
    document.querySelectorAll('header button').forEach(function(btn){if(!notice && btn.querySelector('span.absolute') && !btn.querySelector('i.fa-bell')) notice=btn;});
    if(notice){
      notice.className='relative text-slate-500 px-2';
      notice.innerHTML='<i class="fa-regular fa-bell text-lg" aria-hidden="true"></i><span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">5</span>';
      notice.onclick=function(){if(typeof window.toast==='function') window.toast('3 条待办');};
    }
    document.querySelectorAll('button').forEach(function(btn){
      if(!btn.getAttribute('aria-label') && !btn.textContent.trim()){
        var icon=btn.querySelector('i'); btn.setAttribute('aria-label',icon&&icon.className.indexOf('xmark')>-1?'关闭':'操作');
      }
      if(btn.querySelector('i') && !btn.textContent.trim() && !btn.title) btn.title=btn.getAttribute('aria-label')||'操作';
    });
    ['modal','drawer','m'].forEach(function(id){var el=document.getElementById(id);if(el){el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');}});
    ['toast','t','wms-toast'].forEach(function(id){var el=document.getElementById(id);if(el){el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');}});
    var oldToast=window.toast;
    if(typeof oldToast==='function' && !oldToast.__wmsA11y){
      var wrapped=function(){var args=[].slice.call(arguments);var result=oldToast.apply(this,args);var target=document.getElementById('toast')||document.getElementById('t');if(target){target.setAttribute('role',args[1]?'alert':'status');target.setAttribute('aria-live',args[1]?'assertive':'polite');target.setAttribute('aria-atomic','true');}return result;};
      wrapped.__wmsA11y=true; window.toast=wrapped;
    }
    if(window.MutationObserver && !document.body.__wmsA11yObserver){
      document.body.__wmsA11yObserver=true;
      new MutationObserver(function(){document.querySelectorAll('input,select,textarea').forEach(function(control){
        if(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
        var id=control.id||'', type=(control.getAttribute('type')||'').toLowerCase();
        control.setAttribute('aria-label',id==='receiptSignReady'?'签收准备':type==='checkbox'?'选择项':type==='date'?'日期':type==='datetime-local'?'日期时间':control.tagName.toLowerCase()==='select'?'选择项':'输入项');
      });}).observe(document.body,{childList:true,subtree:true});
    }
    enhanceReceiptDestinations();
    enhanceRecordLinks();
    if(currentFile()==='inventory.html'){
      var inventoryLabels={tA:'\u5916\u4ed3 WH-A',tB:'\u5185\u4ed31 WH-B',tC:'\u5185\u4ed32 WH-C'};
      Object.keys(inventoryLabels).forEach(function(id){var el=document.getElementById(id);if(el)el.textContent=inventoryLabels[id];});
      var inventoryDrill=document.getElementById('v2'),inventoryDrillView=document.getElementById('view2');
      if(inventoryDrill) inventoryDrill.remove();
      if(inventoryDrillView) inventoryDrillView.remove();
      var inventoryCards=[].slice.call(document.querySelectorAll('.p-6 > .grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-4 > .card'));
      if(inventoryCards.length===4&&!inventoryCards[0].classList.contains('inventory-summary-card')){
        var inventoryStyle=document.createElement('style');
        inventoryStyle.textContent='.inventory-summary-card{position:relative;min-height:92px;display:flex;flex-direction:column;justify-content:center;overflow:visible!important;cursor:default}.inventory-summary-label{font-size:11px;color:#94a3b8}.inventory-summary-value{margin-top:5px;font-size:20px;font-weight:800;color:#075985}.inventory-summary-note{margin-top:3px;font-size:10px;color:#64748b}.inventory-summary-detail{position:absolute;left:0;top:calc(100% + 7px);z-index:30;width:min(330px,calc(100vw - 40px));padding:12px;border:1px solid #bfdbfe;border-radius:10px;background:#fff;color:#334155;box-shadow:0 14px 30px rgba(30,99,148,.2);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .16s ease,transform .16s ease,visibility .16s ease}.inventory-summary-card:last-child .inventory-summary-detail{left:auto;right:0}.inventory-summary-card:hover .inventory-summary-detail,.inventory-summary-card:focus-within .inventory-summary-detail{opacity:1;visibility:visible;transform:translateY(0)}@media(max-width:620px){.inventory-summary-detail{position:fixed;left:20px!important;right:20px!important;top:25%;width:auto}}';
        document.head.appendChild(inventoryStyle);
        var cardSummary=[['库存数量','3 种单位','悬停查看账面、可用和待检'],['库区占用','82%','A-05区达到 96% 预警'],['混放库区','1 处','2 种物料 · 2 种单位'],['最后更新','08:28','实时 · 扫码即入账']];
        inventoryCards.forEach(function(card,index){var detail=card.innerHTML,s=cardSummary[index];card.className+=' inventory-summary-card';card.tabIndex=0;card.innerHTML='<div class="inventory-summary-label">'+s[0]+'</div><div class="inventory-summary-value">'+s[1]+'</div><div class="inventory-summary-note">'+s[2]+'</div><div class="inventory-summary-detail">'+detail+'</div>';});
      }
    }
    if(currentFile()==='location.html'){
      var areaRow=document.getElementById('areaRow');
      if(areaRow){
        var areaStyle=document.createElement('style');
        areaStyle.textContent='.area-summary{position:relative}.area-summary-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid #dbe7f2;border-radius:12px;background:#fff;text-align:left;color:#334155}.area-summary-trigger:hover,.area-summary-trigger:focus-visible{border-color:#60a5fa;background:#f8fbff}.area-summary-main{display:flex;align-items:center;gap:14px;min-width:0}.area-summary-main b{color:#0f4f82}.area-summary-meta{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.area-summary-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;display:none;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;max-height:320px;overflow:auto;padding:8px;border:1px solid #bfdbfe;border-radius:12px;background:#f8fcff;box-shadow:0 14px 30px rgba(30,99,148,.18)}.area-summary:hover .area-summary-menu,.area-summary:focus-within .area-summary-menu,.area-summary.open .area-summary-menu{display:grid}.area-summary-menu .area-card{min-height:72px;padding:9px;border:1px solid #dbe7f2;border-radius:9px;background:#fff;text-align:left}.area-summary-menu .area-card:hover,.area-summary-menu .area-card.on{border-color:#3b82f6;background:#eff6ff}.area-summary-menu .qr{font-size:9px}@media(max-width:760px){.area-summary-main{display:block}.area-summary-menu{grid-template-columns:1fr;max-height:55vh}}';
        document.head.appendChild(areaStyle);
        areaRow.className='area-summary text-xs';
        areaRow.innerHTML='<button type="button" class="area-summary-trigger" aria-expanded="false"><span class="area-summary-main"><b>库区概览</b><span class="area-summary-meta" id="area-summary-current">共 4 个库区 · 1 个预警 · 当前：全部库区</span></span><span>查看全部库区 ▾</span></button><div class="area-summary-menu"><button onclick="filterArea(\'\',this)" class="area-card on"><b>全部库区</b><div class="text-slate-400">168 库区 · 占用 82%</div></button><button onclick="filterArea(\'A-05\',this)" class="area-card"><b>A-05区 <span class="text-red-500">96%预警</span></b><div class="text-slate-400">48 库区 · 混放 8</div><div><span class="qr ok">AQ-WHA-A05</span></div></button><button onclick="filterArea(\'A-06\',this)" class="area-card"><b>A-06区</b><div class="text-slate-400">36 库区 · 空 12</div><div><span class="qr ok">AQ-WHA-A06</span></div></button><button onclick="filterArea(\'D01/G01\',this)" class="area-card"><b>待检区 / 隔离区</b><div class="text-slate-400">待检 220米 · 隔离 15米</div></button></div>';
        var areaTrigger=areaRow.querySelector('.area-summary-trigger');
        areaTrigger.addEventListener('click',function(){var open=areaRow.classList.toggle('open');areaTrigger.setAttribute('aria-expanded',open?'true':'false');});
        areaRow.querySelectorAll('.area-card').forEach(function(btn){btn.addEventListener('click',function(){var label=(btn.querySelector('b')||btn).textContent.trim();document.getElementById('area-summary-current').textContent='共 4 个库区 · 1 个预警 · 当前：'+label;areaRow.classList.remove('open');areaTrigger.setAttribute('aria-expanded','false');});});
      }
    }
    if(currentFile()==='receipt.html'){
      var scanButton=[].slice.call(document.querySelectorAll('#st1 button')).find(function(btn){return btn.textContent.indexOf('\u7ee7\u7eed\u62cd\u7167')>-1;});
      if(scanButton&&!document.getElementById('delivery-photo-upload')){
        scanButton.textContent='\u626b\u63cf\u5355\u636e';
        scanButton.setAttribute('aria-label','\u626b\u63cf\u9001\u8d27\u5355');
        scanButton.onclick=function(){if(typeof window.toast==='function')window.toast('\u5df2\u8fde\u63a5\u626b\u63cf\u8bbe\u5907\uff0c\u6b63\u5728\u626b\u63cf\u5355\u636e\u5e76\u8fdb\u5165 OCR \u961f\u5217');};
        var upload=document.createElement('input');upload.type='file';upload.id='delivery-photo-upload';upload.accept='image/*';upload.multiple=true;upload.hidden=true;upload.setAttribute('aria-label','\u4e0a\u4f20\u9001\u8d27\u5355\u7167\u7247');
        upload.addEventListener('change',function(){if(!upload.files.length)return;if(typeof window.toast==='function')window.toast('\u5df2\u4e0a\u4f20 '+Math.min(upload.files.length,6)+' \u5f20\u7167\u7247\uff0c\u6b63\u5728\u8fdb\u5165 OCR \u961f\u5217');});
        var uploadButton=document.createElement('button');uploadButton.type='button';uploadButton.className=scanButton.className;uploadButton.textContent='\u4e0a\u4f20\u7167\u7247';uploadButton.setAttribute('aria-label','\u4e0a\u4f20\u9001\u8d27\u5355\u7167\u7247');uploadButton.addEventListener('click',function(){upload.click();});
        scanButton.parentNode.insertBefore(upload,scanButton.nextSibling);scanButton.parentNode.insertBefore(uploadButton,upload.nextSibling);
      }
    }
    if(currentFile()==='report.html'){
      var reportTabRow=[].slice.call(document.querySelectorAll('.p-6 > .flex')).find(function(row){return row.querySelectorAll('.tab').length;});
      if(reportTabRow){
        reportTabRow.querySelectorAll('.tab').forEach(function(button){button.remove();});
        reportTabRow.querySelectorAll('.flex-1').forEach(function(spacer){spacer.remove();});
        if(!reportTabRow.querySelector('button')) reportTabRow.remove();
      }
      var reportSummary=document.querySelector('#p1 > .grid.grid-cols-4');
      if(reportSummary){
        var reportTrend=reportSummary.nextElementSibling;
        reportSummary.remove();
        if(reportTrend&&reportTrend.classList.contains('card')) reportTrend.remove();
      }
      var agentQuickActions=document.querySelectorAll('#agent > div:first-child button');
      agentQuickActions.forEach(function(button){button.remove();});
      [].slice.call(document.querySelectorAll('.tab')).filter(function(button){return /操作审计/.test(button.textContent);}).forEach(function(button){button.remove();});
      var reportPeriodButton=[].slice.call(document.querySelectorAll('#cats .cat')).find(function(button){return /日报|周报|月报/.test(button.textContent);});
      var reportPeriodKey=Object.keys(window.DATA||{}).find(function(key){return (window.DATA[key]||[]).some(function(row){return String(row[0]).indexOf('BB-DAY-')===0;});});
      if(reportPeriodButton&&reportPeriodKey){
        var periodRows=window.DATA[reportPeriodKey]||[];
        var periodData={
          '\u65e5\u62a5':periodRows.filter(function(row){return String(row[0]).indexOf('BB-DAY-')===0;}),
          '\u5468\u62a5':periodRows.filter(function(row){return String(row[0]).indexOf('BB-WEEK-')===0;}),
          '\u6708\u62a5':periodRows.filter(function(row){return String(row[0]).indexOf('BB-MON-')===0;})
        };
        var periodFragment=document.createDocumentFragment();
        Object.keys(periodData).forEach(function(label,index){
          var button=reportPeriodButton.cloneNode(false);
          button.textContent=label;
          button.classList.toggle('on',index===0);
          button.setAttribute('type','button');
          button.removeAttribute('onclick');
          button.addEventListener('click',function(){pickCat(label,button);});
          window.DATA[label]=periodData[label];
          periodFragment.appendChild(button);
        });
        reportPeriodButton.replaceWith(periodFragment);
        pickCat('\u65e5\u62a5',document.querySelector('#cats .cat'));
      }
      var reportListRenderer=window.renderList;
      if(typeof reportListRenderer==='function'&&!reportListRenderer.__previewOnly){
        var normalizeReportActions=function(){
          document.querySelectorAll('#rlist tr').forEach(function(row){
            var actions=row.lastElementChild;
            if(!actions) return;
            var exportButton=[].slice.call(actions.querySelectorAll('button')).find(function(button){return /导出/.test(button.textContent);});
            var publishButton=[].slice.call(actions.querySelectorAll('button')).find(function(button){return /发布/.test(button.textContent);});
            if(!publishButton) return;
            publishButton.textContent='预览';
            publishButton.className='text-violet-700 font-bold';
            publishButton.onclick=function(event){event.stopPropagation();if(typeof window.toast==='function')window.toast('已打开报表预览');};
            if(exportButton) actions.insertBefore(publishButton,exportButton);
          });
        };
        var wrappedReportList=function(){var result=reportListRenderer.apply(this,arguments);normalizeReportActions();return result;};
        wrappedReportList.__previewOnly=true;
        window.renderList=wrappedReportList;
        normalizeReportActions();
      }
    }
    if(currentFile()==='finished.html'){
      var finishedCard=document.querySelector('#listView .card');
      var finishedSummary=finishedCard&&finishedCard.querySelector('.grid.grid-cols-3');
      if(finishedCard&&finishedSummary&&finishedSummary.parentElement===finishedCard&&finishedCard.firstElementChild!==finishedSummary){
        finishedSummary.classList.remove('mt-3');
        finishedSummary.classList.add('mb-3');
        finishedCard.insertBefore(finishedSummary,finishedCard.firstElementChild);
      }
    }
    if(currentFile()==='dashboard.html'){
      var exitDash=document.getElementById('dash-new');
      if(exitDash&&!exitDash.dataset.homeExit){
        var exitClone=exitDash.cloneNode(false);
        exitClone.type='button';
        exitClone.id='dash-new';
        exitClone.className=exitDash.className;
        exitClone.setAttribute('aria-label','退出大屏，返回首页');
        exitClone.innerHTML='<i class="fa-solid fa-arrow-left mr-1" aria-hidden="true"></i>退出大屏';
        exitClone.dataset.homeExit='true';
        exitClone.addEventListener('click',function(){
          if(window.parent&&window.parent!==window&&typeof window.parent.go==='function') window.parent.go('home');
          else location.href='home.html';
        });
        exitDash.replaceWith(exitClone);
      }
    }
    if(currentFile()==='receipt.html'){
      [].slice.call(document.querySelectorAll('#st1 button')).filter(function(button){return /送货单确认/.test(button.textContent);}).forEach(function(button){button.remove();});
      var ocrStep=document.getElementById('st2');
      if(ocrStep&&!ocrStep.dataset.editableOcr){
        ocrStep.dataset.editableOcr='true';
        var ocrHint=ocrStep.querySelector('p');
        if(ocrHint) ocrHint.textContent='物料编码、物料名称和数量均可直接修改；低置信度字段请先修正，再进入下一步';
        ocrStep.querySelectorAll('tbody tr').forEach(function(row,index){
          var materialCell=row.cells&&row.cells[0];
          var cell=row.cells&&row.cells[1];
          if(!materialCell||!cell) return;
          var materialInput=document.createElement('input');
          materialInput.className='field w-full min-w-[190px] ocr-edit-material';
          materialInput.value=materialCell.textContent.trim();
          materialInput.setAttribute('aria-label','第'+(index+1)+'项物料编码和名称');
          materialCell.textContent='';materialCell.appendChild(materialInput);
          materialInput.addEventListener('input',function(){
            var checkRows=document.querySelectorAll('#st3 tbody tr');
            if(checkRows[index]&&checkRows[index].cells[0])checkRows[index].cells[0].textContent=materialInput.value;
          });
          var raw=cell.textContent.trim(),match=raw.match(/([\d,]+)/),unit=raw.replace(/.*?[\d,]+\s*/,'').trim();
          if(!match) return;
          cell.innerHTML='<div class="flex items-center gap-1"><input class="field w-full ocr-edit-value" type="number" min="0" step="1" value="'+match[1].replace(/,/g,'')+'" aria-label="OCR识别数量"><span class="text-slate-500 shrink-0">'+unit+'</span></div>';
          var input=cell.querySelector('input');
        });
      }
    }
    if(currentFile()==='workshop.html'){
      var workshopTabs=[].slice.call(document.querySelectorAll('.p-6 > .flex.gap-2.text-xs')).find(function(row){return row.querySelectorAll('.tab').length;});
      var workshopReceivePanel=document.getElementById('pb'),workshopRequestPanel=document.getElementById('pa');
      if(workshopTabs) workshopTabs.remove();
      if(workshopReceivePanel) workshopReceivePanel.remove();
      if(workshopRequestPanel) workshopRequestPanel.classList.remove('hidden');
    }
    if(currentFile()==='base.html'){
      var baseTabRow=[].slice.call(document.querySelectorAll('.p-6 > .flex')).find(function(row){return row.querySelectorAll('.tab').length>=2;});
      if(baseTabRow) baseTabRow.remove();
      [].slice.call(document.querySelectorAll('button')).forEach(function(button){
        var text=button.textContent.trim();
        if(text.indexOf('去成品档案')>-1){button.onclick=function(){navTo('base','5');};}
        if(text.indexOf('去BOM管理')>-1){button.onclick=function(){navTo('base','');};}
      });
      var orgList=document.getElementById('orgList'),orgWizard=document.getElementById('orgWiz');
      if(orgList&&!orgList.dataset.simplified){
        orgList.dataset.simplified='true';
        orgList.innerHTML='<div class="flex justify-between items-center flex-wrap gap-2"><div><b class="text-sm">组织架构与车间档案</b><p class="text-xs text-slate-500">维护监区、楼栋、楼层、车间、班组和工位，供领料、退料、成品登记及数据权限使用</p></div><button type="button" class="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-bold" data-org-add>+ 新增组织节点</button></div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs"><div class="card p-4"><b>组织结构树</b><div class="mt-3 space-y-2" data-org-tree><button type="button" class="w-full text-left font-bold text-blue-700">一监区</button><div class="ml-4 border-l border-blue-100 pl-3 space-y-2"><div><b>1栋 · 2层</b></div><button type="button" class="block text-blue-700">缝制一车间</button><div class="ml-4 text-slate-500">王班组 · 05工位</div><button type="button" class="block text-blue-700">裁剪车间</button></div><button type="button" class="w-full text-left font-bold text-slate-600 pt-2">二监区</button><div class="ml-4 border-l border-slate-200 pl-3 text-slate-500">2栋 · 1层 · 缝制二车间</div></div></div><div class="card p-4 lg:col-span-2"><div class="flex items-center justify-between gap-2"><b>组织节点列表</b><select class="border rounded-lg px-2 py-1.5" data-org-level><option value="">全部层级</option><option>车间</option><option>班组</option><option>工位</option></select></div><div class="overflow-x-auto"><table class="w-full min-w-[650px] mt-2"><thead><tr class="text-slate-400 text-left border-b"><th class="py-2">编码</th><th>名称</th><th>层级</th><th>上级节点</th><th>负责人</th><th>状态</th><th>操作</th></tr></thead><tbody data-org-body><tr class="border-b" data-level="车间"><td class="py-2">YJ-01-1D-2F-C01</td><td class="font-bold">缝制一车间</td><td>车间</td><td>一监区 / 1栋 / 2层</td><td>王建民警</td><td><span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span></td><td><button class="text-blue-600 font-bold" data-org-edit>编辑</button> <button class="text-orange-600" data-org-disable>停用</button></td></tr><tr class="border-b" data-level="车间"><td class="py-2">YJ-01-1D-2F-C02</td><td class="font-bold">裁剪车间</td><td>车间</td><td>一监区 / 1栋 / 2层</td><td>李师傅</td><td><span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span></td><td><button class="text-blue-600 font-bold" data-org-edit>编辑</button> <button class="text-orange-600" data-org-disable>停用</button></td></tr><tr class="border-b" data-level="班组"><td class="py-2">YJ-01-C01-G01</td><td class="font-bold">王班组</td><td>班组</td><td>缝制一车间</td><td>王班长</td><td><span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span></td><td><button class="text-blue-600 font-bold" data-org-edit>编辑</button> <button class="text-red-500" data-org-delete>删除</button></td></tr><tr data-level="工位"><td class="py-2">YJ-01-C01-G01-P05</td><td class="font-bold">05工位</td><td>工位</td><td>王班组</td><td>—</td><td><span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span></td><td><button class="text-blue-600 font-bold" data-org-edit>编辑</button> <button class="text-red-500" data-org-delete>删除</button></td></tr></tbody></table></div><p class="mt-2 text-[11px] text-slate-400">已被业务单据或用户权限引用的节点只能停用，不能删除。</p></div></div>';
        var orgBody=orgList.querySelector('[data-org-body]'),levelFilter=orgList.querySelector('[data-org-level]');
        levelFilter.addEventListener('change',function(){orgBody.querySelectorAll('tr').forEach(function(row){row.hidden=!!levelFilter.value&&row.dataset.level!==levelFilter.value;});});
        orgList.querySelector('[data-org-add]').addEventListener('click',function(){var row=document.createElement('tr');row.className='border-b bg-blue-50';row.dataset.level='车间';row.innerHTML='<td class="py-2">YJ-NEW-'+String(orgBody.rows.length+1).padStart(2,'0')+'</td><td class="font-bold">新建组织节点</td><td>车间</td><td>待选择</td><td>待填写</td><td><span class="bg-orange-100 text-orange-600 px-2 rounded-full">未启用</span></td><td><button class="text-blue-600 font-bold" data-org-edit>编辑</button> <button class="text-red-500" data-org-delete>删除</button></td>';orgBody.prepend(row);if(typeof window.toast==='function')window.toast('已新增组织节点，请点击编辑补充信息');});
        orgList.addEventListener('click',function(event){var row=event.target.closest('tr');if(event.target.closest('[data-org-edit]')){if(typeof window.toast==='function')window.toast('已打开组织节点编辑');}if(event.target.closest('[data-org-disable]')&&row){row.querySelector('td:nth-child(6)').innerHTML='<span class="bg-slate-200 text-slate-600 px-2 rounded-full">停用</span>';if(typeof window.toast==='function')window.toast('组织节点已停用');}if(event.target.closest('[data-org-delete]')&&row){row.remove();if(typeof window.toast==='function')window.toast('未被引用的组织节点已删除');}});
      }
      if(orgWizard) orgWizard.remove();
    }
    if(currentFile()==='equipment.html'){
      var equipmentList=document.getElementById('listView');
      var equipmentHeader=document.querySelector('header b');
      if(equipmentHeader) equipmentHeader.textContent='系统接入设备管理';
      if(equipmentList){
        equipmentList.innerHTML='<div class="flex justify-between items-center flex-wrap gap-2"><div><h1 class="text-xl font-extrabold">设备管理</h1><p class="text-xs text-slate-500">管理连接本系统的扫码枪、PDA、作业平板、扫描仪和标签打印机，查看绑定位置与在线状态</p></div><div class="flex gap-2 text-xs"><button type="button" class="px-3 py-2 bg-white border rounded-lg" data-eq-export>导出设备清单</button><button type="button" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold" data-eq-new>+ 新增设备</button></div></div>'+
          '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs"><div class="card p-3"><div class="text-slate-400">接入设备</div><div class="font-extrabold text-lg">28</div><div class="text-[11px] text-slate-400">扫码设备 12 · 平板 8 · 其它 8</div></div><div class="card p-3"><div class="text-slate-400">当前在线</div><div class="font-extrabold text-lg text-emerald-600">24</div><div class="text-[11px] text-slate-400">在线率 85.7%</div></div><div class="card p-3 border-orange-200 bg-orange-50/50"><div class="text-orange-600">连接异常</div><div class="font-extrabold text-lg">3</div><div class="text-[11px] text-slate-500">超过 10 分钟未上报心跳</div></div><div class="card p-3"><div class="text-slate-400">已停用</div><div class="font-extrabold text-lg">1</div><div class="text-[11px] text-slate-400">旧设备已解除绑定</div></div></div>'+
          '<div class="card p-4"><div class="flex gap-2 text-xs flex-wrap"><input id="eqConnectSearch" placeholder="搜索：设备编号 / 名称 / 绑定位置" class="border rounded-lg px-3 py-2 w-64"><select id="eqConnectStatus" class="border rounded-lg px-2 py-2"><option value="">全部状态</option><option>在线</option><option>离线</option><option>停用</option></select><select id="eqConnectType" class="border rounded-lg px-2 py-2"><option value="">全部类型</option><option>扫码枪</option><option>手持PDA</option><option>作业平板</option><option>单据扫描仪</option><option>标签打印机</option></select><select id="eqConnectPlace" class="border rounded-lg px-2 py-2"><option value="">全部位置</option><option>外仓 WH-A</option><option>内仓1 WH-B</option><option>缝制一车间</option><option>收货办公室</option></select><span class="flex-1"></span><span id="eqConnectCount" class="text-slate-400 self-center">共 7 台设备</span></div><div class="overflow-x-auto"><table class="w-full text-xs mt-3 min-w-[900px]"><thead><tr class="text-slate-400 text-left border-b"><th class="py-2">编号 / 设备名称</th><th>设备类型</th><th>绑定位置</th><th>连接状态</th><th>最近心跳</th><th>设备标识 / 版本</th><th>操作</th></tr></thead><tbody id="eqConnectBody"></tbody></table></div><div id="eqConnectEmpty" class="hidden text-center text-slate-400 text-xs py-6">暂无匹配设备</div><div class="mt-2 text-[11px] text-slate-400">设备仅用于连接和操作本系统；离线设备不会接收新任务，停用后解除账号与位置绑定。</div></div>';
        var connectedDevices=[
          ['DEV-SG-001','仓库扫码枪 01','扫码枪','外仓 WH-A','在线','刚刚','USB-HID · 固件 2.3.1'],
          ['DEV-PDA-007','收发货 PDA 07','手持PDA','外仓 WH-A','在线','1分钟前','Android 14 · App 3.6.0'],
          ['DEV-TAB-003','车间接收平板 03','作业平板','缝制一车间','在线','2分钟前','Android 13 · App 3.6.0'],
          ['DEV-SCN-002','送货单扫描仪 02','单据扫描仪','收货办公室','在线','5分钟前','USB · OCR组件 2.1'],
          ['DEV-PRT-004','库区标签打印机 04','标签打印机','内仓1 WH-B','离线','18分钟前','网络打印 · 192.168.2.44'],
          ['DEV-SG-009','库区扫码枪 09','扫码枪','内仓1 WH-B','在线','3分钟前','蓝牙 · 固件 1.9.8'],
          ['DEV-TAB-001','旧作业平板 01','作业平板','缝制一车间','停用','09-10 16:20','已解除绑定']
        ];
        var equipmentBody=document.getElementById('eqConnectBody');
        function equipmentStatusClass(status){return status==='在线'?'bg-emerald-100 text-emerald-700':status==='离线'?'bg-orange-100 text-orange-600':'bg-slate-200 text-slate-600';}
        function renderConnectedDevices(){
          var keyword=document.getElementById('eqConnectSearch').value.trim().toLowerCase(),status=document.getElementById('eqConnectStatus').value,type=document.getElementById('eqConnectType').value,place=document.getElementById('eqConnectPlace').value;
          var rows=connectedDevices.filter(function(device){return (!keyword||device.join(' ').toLowerCase().indexOf(keyword)>-1)&&(!status||device[4]===status)&&(!type||device[2]===type)&&(!place||device[3]===place);});
          equipmentBody.innerHTML=rows.map(function(device){return '<tr class="border-b hover:bg-blue-50"><td class="py-2"><b class="text-blue-700">'+device[0]+'</b><br><span class="text-slate-600">'+device[1]+'</span></td><td>'+device[2]+'</td><td>'+device[3]+'</td><td><span class="px-2 rounded-full '+equipmentStatusClass(device[4])+'">'+device[4]+'</span></td><td class="text-slate-500">'+device[5]+'</td><td class="text-slate-500">'+device[6]+'</td><td><button type="button" class="text-blue-600 font-bold" data-eq-detail="'+device[0]+'">详情</button> <button type="button" class="text-slate-500" data-eq-edit="'+device[0]+'">编辑</button></td></tr>';}).join('');
          document.getElementById('eqConnectCount').textContent='共 '+rows.length+' 台设备';document.getElementById('eqConnectEmpty').classList.toggle('hidden',rows.length>0);
          equipmentBody.querySelectorAll('[data-eq-detail]').forEach(function(button){button.addEventListener('click',function(){if(typeof window.toast==='function')window.toast('正在查看设备 '+button.dataset.eqDetail+' 的连接详情');});});
          equipmentBody.querySelectorAll('[data-eq-edit]').forEach(function(button){button.addEventListener('click',function(){if(typeof window.toast==='function')window.toast('已打开设备 '+button.dataset.eqEdit+' 的绑定设置');});});
        }
        ['eqConnectSearch','eqConnectStatus','eqConnectType','eqConnectPlace'].forEach(function(id){var control=document.getElementById(id);control.addEventListener('input',renderConnectedDevices);control.addEventListener('change',renderConnectedDevices);});
        equipmentList.querySelector('[data-eq-new]').addEventListener('click',function(){if(typeof window.toast==='function')window.toast('已打开新增系统接入设备');});
        equipmentList.querySelector('[data-eq-export]').addEventListener('click',function(){if(typeof window.toast==='function')window.toast('设备清单已导出');});
        renderConnectedDevices();
      }
      var equipmentWizard=document.getElementById('wizView');if(equipmentWizard) equipmentWizard.remove();
    }
    if(currentFile()==='location.html'){
      var qrInput=document.getElementById('wQr');
      if(qrInput&&!document.getElementById('wms-location-qr')){
        var qrStyle=document.createElement('style');
        qrStyle.id='wms-location-qr-style';
        qrStyle.textContent='.wms-location-qr{display:flex;align-items:center;gap:10px;margin-top:7px;padding:8px;border:1px solid #cde8f7;border-radius:8px;background:#f8fdff}.wms-location-qr img{width:72px;height:72px;flex:0 0 72px;border-radius:4px;background:#fff}.wms-location-qr-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;font-weight:700;color:#16456f;word-break:break-all}.wms-location-qr-note{margin-top:3px;font-size:10px;font-weight:400;color:#648eaa}';
        document.head.appendChild(qrStyle);
        var qrVisual=document.createElement('div');
        qrVisual.id='wms-location-qr';
        qrVisual.className='wms-location-qr';
        qrVisual.innerHTML='<img alt="库区二维码图片"><div><div class="wms-location-qr-code"></div><div class="wms-location-qr-note">现场张贴二维码，移动端扫码定位库区</div></div>';
        qrInput.insertAdjacentElement('afterend',qrVisual);
        function refreshLocationQr(){
          var value=(qrInput.value||'').trim();
          var image=qrVisual.querySelector('img');
          qrVisual.querySelector('.wms-location-qr-code').textContent=value||'未生成二维码';
          image.src=value?'https://api.qrserver.com/v1/create-qr-code/?size=96x96&margin=4&data='+encodeURIComponent(value):'';
          image.alt=value?'库区二维码：'+value:'库区二维码图片';
        }
        refreshLocationQr();
        var areaSelect=document.getElementById('wArea');
        if(areaSelect) areaSelect.addEventListener('change',function(){window.setTimeout(refreshLocationQr,0);});
      }
    }
    var workflowRail=document.getElementById('railStep');
    var workflowRailCard=workflowRail&&workflowRail.closest('.card');
    if(workflowRailCard){
      var workflowGrid=workflowRailCard.parentElement;
      workflowRailCard.remove();
      if(workflowGrid&&workflowGrid.classList.contains('grid')){
        workflowGrid.classList.remove('grid-cols-3');
        workflowGrid.classList.add('grid-cols-1');
        var workflowMain=workflowGrid.querySelector('.col-span-2');
        if(workflowMain){workflowMain.classList.remove('col-span-2');workflowMain.classList.add('col-span-1');}
      }
    }
    if(currentFile()==='docs.html'){
      var docTypeLabels={SL:'送料',ZS:'直送',DB:'调拨',SQ:'申请',TL:'退料',CP:'成品',PD:'盘点'};
      var docHeader=[].slice.call(document.querySelectorAll('#recBody')).map(function(body){return body.closest('table');}).filter(Boolean)[0];
      if(docHeader){
        var firstHead=docHeader.querySelector('thead th');
        if(firstHead) firstHead.textContent='类型/单号';
      }
      document.querySelectorAll('#recBody tr[data-t]').forEach(function(row){
        var cell=row.cells&&row.cells[0], code=row.getAttribute('data-t');
        if(!cell||cell.dataset.typeFirst==='true') return;
        var match=cell.textContent.trim().match(/^([A-Z]{2}\d+)\s*[·•]\s*(.+)$/);
        if(!match) return;
        cell.innerHTML='<span class="text-slate-600">'+(docTypeLabels[code]||match[2])+'</span><span class="mx-1 text-slate-300">·</span><b class="text-blue-700">'+match[1]+'</b>';
        cell.dataset.typeFirst='true';
      });
    }
    enhanceAdvancedFilters();
    enhanceBusinessClassification();
    enhanceWorkOrderDrawers();
    enhanceOcrWorkspace();
    var rightDrawers=[].slice.call(document.querySelectorAll('#d,#qaDrawer,#whDrawer'));
    if(rightDrawers.length&&!document.getElementById('wms-drawer-responsive')){
      var drawerStyle=document.createElement('style');drawerStyle.id='wms-drawer-responsive';drawerStyle.textContent='@media(max-width:900px){#d,#qaDrawer,#whDrawer{width:92vw!important;max-width:92vw!important}}';document.head.appendChild(drawerStyle);
    }
    rightDrawers.forEach(function(drawer){
      if(drawer.id==='d'){drawer.style.backgroundColor='#fff';drawer.style.opacity='1';drawer.style.backdropFilter='none';}
      if(drawer.dataset.outsideClose) return;
      drawer.dataset.outsideClose='true';
      document.addEventListener('click',function(e){
        if(drawer.classList.contains('hidden')||drawer.contains(e.target)) return;
        if(e.target.closest('tr,[data-doc],[data-record-action]')) return;
        var trigger=e.target.closest('button,a,[role="button"]');
        var onclick=trigger&&trigger.getAttribute('onclick')||'';
        if(trigger&&/(qaDrawer|whDrawer|getElementById\(\s*["']d["']\s*\))/i.test(onclick)) return;
        drawer.classList.add('hidden');
      });
    });
  }
  document.addEventListener('DOMContentLoaded',function(){
    splitQuantityText(document.body);
    var observer=new MutationObserver(function(mutations){mutations.forEach(function(m){[].forEach.call(m.addedNodes,function(n){if(n.nodeType===1)splitQuantityText(n)})})});
    observer.observe(document.body,{childList:true,subtree:true});
  });
  function normalizePageTop(){
    var headers=document.querySelectorAll('body header');
    headers.forEach(function(header){
      if(header.closest('[role="dialog"],dialog')||header.classList.contains('dash-head')||header.classList.contains('ai-bg')) return;
      header.classList.add('wms-page-header');
      header.setAttribute('data-page-header','true');
    });
    var titles=document.querySelectorAll('main h1,main h2,.p-6 h1,.p-6 h2,.h1 h2,#main h1,#main h2');
    titles.forEach(function(title){
      if(title.closest('[role="dialog"],dialog,.dash-head,.ai-bg')) return;
      title.classList.add('wms-page-title');
    });
    if(!document.getElementById('wms-page-top-style')){
      var style=document.createElement('style');style.id='wms-page-top-style';style.textContent='.wms-page-header{min-height:44px!important;height:44px!important;display:flex!important;align-items:center!important;gap:8px!important;padding:0 24px!important;box-sizing:border-box!important;white-space:nowrap!important;overflow:hidden!important}.wms-page-header>b{font-weight:800!important;color:#163f63!important}.wms-page-title{margin:0!important;font-size:21px!important;line-height:1.3!important;font-weight:800!important;color:#143b5d!important}.h1:has(.wms-page-title),main>.flex.justify-between:has(.wms-page-title),.p-6>div:first-child:has(.wms-page-title){min-height:52px;align-items:center}.wms-page-header span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';document.head.appendChild(style);
    }
  }
  window.wmsEnhancePage=enhancePage;
  if(SPA_SHELL)return;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

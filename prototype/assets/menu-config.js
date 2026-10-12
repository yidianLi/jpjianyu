/* WMS 菜单/路由唯一数据源：app.html 壳、assets/nav.js 独立页、mobile 共用。
 * 禁止在其它文件再维护菜单副本；改菜单只改这里。
 * 口径对照《监狱公司物料系统-菜单与页面数据库设计表》总表。
 * 口径（用户确认）：申请领料=进仓前不动账；车间接收=物料领用签收；车间退料=回仓进项；物料退库=出库/冲红 */
(function(){
  var FILE = {
    login:'login.html', home:'home.html', dashboard:'dashboard.html', location:'location.html', materialCode:'material-workbench.html',
    transfer:'transfer.html', approveFlow:'approve-flow.html',
    finished:'finished.html',
    base:'base.html', warehouseArchive:'warehouse-archive.html', locationArchive:'location-archive.html', customerArchive:'customer-archive.html', docs:'docs.html', ocr:'ocr.html', scanlog:'scanlog.html', qrcode:'qrcode.html',
    stocktake:'stocktake.html', report:'report.html', reportConfig:'report-config.html', audit:'audit.html', processingFee:'processing-fee.html', ai:'ai.html', users:'users.html', equipment:'equipment.html', ocrResult:'ocr-result.html',
    materialRequest:'material-workbench.html', materialReceive:'material-workbench.html', materialRegister:'material-workbench.html', materialReject:'material-workbench.html', materialInbound:'material-workbench.html', materialIssue:'material-workbench.html', materialWReturn:'material-workbench.html', materialReturn:'material-workbench.html', materialStock:'material-workbench.html',
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
    materialRequest:'materialRequest', materialReceive:'materialReceive', materialRegister:'materialRegister', materialReject:'materialReject', materialInbound:'materialInbound', materialIssue:'materialIssue', materialWReturn:'materialWReturn', materialReturn:'materialReturn', materialStock:'materialStock',
    inventoryOnhand:'inventoryOnhand', inventoryLedger:'inventoryLedger',
    finishedDetail:'finishedDetail', finishedRegister:'finishedRegister', finishedInbound:'finishedInbound', finishedReturn:'finishedReturn', finishedDeliver:'finishedDeliver', finishedOut:'finishedOut', finishedSign:'finishedSign'
  };
  var GROUPS = [
    {id:'g0', label:'工作台', icon:'fa-gauge', children:[
      {id:'home', label:'首页', tab:''},
      {id:'dashboard', label:'业务运营驾驶舱', tab:''},
      {id:'fieldApp', label:'现场作业APP', tab:''},
      {id:'ai', label:'AI问数', tab:''}]},
    /* g1 仓储作业含仓库库存/库存记录/库区管理/库存调仓/库存盘点；物料管理 8 个工单+明细（登记/入库/拒收三口并为到货验收） */
    {id:'g1', label:'仓储作业', icon:'fa-warehouse', children:[
      {id:'inventoryOnhand', label:'仓库库存', tab:'onhand'},
      {id:'inventoryLedger', label:'库存记录', tab:'ledger'},
      {id:'location', label:'库区管理', tab:''},
      {id:'transfer', label:'库存调仓', tab:''},
      {id:'stocktake', label:'库存盘点', tab:''}]},
    {id:'g2', label:'物料管理', icon:'fa-boxes-stacked', children:[
      {id:'materialCode', label:'物料明细', tab:'detail'},
      {id:'materialRequest', label:'申请领料', tab:'request'},
      {id:'materialReceive', label:'到货验收', tab:'receive'},
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
      {id:'warehouseArchive', label:'仓库档案', tab:''},
      {id:'locationArchive', label:'库区档案', tab:''},
      {id:'customerArchive', label:'客户档案', tab:''},
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
  /* 兼容映射：旧 id workshop → 申请领料，workshopReceive → 物料领用，return → 车间退料（tab 一律 view key） */
  var MATERIAL_ALIAS={workshop:['materialRequest','request'],workshopReceive:['materialIssue','issue'],return:['materialWReturn','wreturn'],receipt:['materialReceive','receive'],issue:['materialIssue','issue'],materialRegister:['materialReceive','receive'],materialReject:['materialReceive','receive'],materialInbound:['materialReceive','receive'],inventory:['inventoryOnhand','onhand'],finished:['finishedRegister','register'],finishedOut:['finishedRegister','register'],finishedSign:['finishedDeliver','deliver']};
  var MATERIAL_TAB={materialRequest:'request',materialReceive:'receive',materialRegister:'register',materialReject:'reject',materialInbound:'inbound',materialIssue:'issue',materialWReturn:'wreturn',materialReturn:'return',materialCode:'detail',inventoryOnhand:'onhand',inventoryLedger:'ledger',inventory:'onhand'};
  /* 基础资料 6 个子页共用 base.html：用独立 id 避免“同一文件+空tab”互相覆盖 */
  var BASE_TAB={baseBom:'',baseMat:'2',baseOrg:'3',baseLoc:'4',baseProd:'5',baseTpl:'6'};
  window.WMS_MENU={FILE:FILE,SECTION:SECTION,GROUPS:GROUPS,MATERIAL_ALIAS:MATERIAL_ALIAS,MATERIAL_TAB:MATERIAL_TAB,BASE_TAB:BASE_TAB};
  /* 兼容：app.html 壳读取 window.WMS_MENU_GROUPS */
  window.WMS_MENU_GROUPS=GROUPS;
})();

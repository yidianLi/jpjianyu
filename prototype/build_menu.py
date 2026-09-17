import pathlib
root = pathlib.Path(__file__).parent

NAV_JS = r"""/* 全系统统一导航 · 每个PC子页面都显示完整一/二级菜单且可点击切换
 * 菜单来源：监狱公司物料系统-菜单与页面数据库设计表（一级/二级/页面定位/主数据表）
 * 跳转策略：
 *  1) 在 app.html 壳里（?from=app）→ 调用 parent.go(id, tab) 切换主视图
 *  2) 在 index.html 平铺总览里 → postMessage 让父页面滚动到对应 section
 *  3) 单独双击打开子页面 → location.href 跳转到对应文件（带 tab 参数自动切 Tab） */
(function(){
  var FILE = {
    login:'login.html', dashboard:'dashboard.html', inventory:'inventory.html',
    receipt:'receipt.html', issue:'issue.html', transfer:'transfer.html',
    workshop:'workshop.html', return:'return.html', finished:'finished.html',
    base:'base.html', docs:'docs.html', ocr:'ocr.html',
    stocktake:'stocktake.html', report:'report.html', ai:'ai.html', users:'users.html'
  };
  var SECTION = {
    login:'login', dashboard:'dashboard', inventory:'inventory', receipt:'receipt',
    issue:'issue', transfer:'transfer', workshop:'request', return:'return',
    finished:'finished', base:'base', docs:'docs', ocr:'ocr',
    stocktake:'stocktake', report:'report', ai:'ai', users:'users'
  };
  // 完整一/二级菜单（对照数据库设计表总表）
  var GROUPS = [
    {label:'工作台', icon:'fa-gauge', children:[
      {id:'dashboard', label:'业务运营驾驶舱', tab:'', table:'dashboard_task'},
      {id:'ai', label:'AI问数', tab:'', table:'ai_query_log'}]},
    {label:'仓库管理', icon:'fa-warehouse', children:[
      {id:'inventory', label:'库存总览', tab:'', table:'inventory_balance'},
      {id:'receipt', label:'入库管理', tab:'', table:'warehouse_receipt'},
      {id:'issue', label:'出库管理', tab:'', table:'warehouse_issue'},
      {id:'stocktake', label:'盘点管理', tab:'', table:'stocktake_task'}]},
    {label:'调拨管理', icon:'fa-shuffle', children:[
      {id:'transfer', label:'调拨工作台', tab:'', table:'transfer_order'}]},
    {label:'车间管理', icon:'fa-dolly', children:[
      {id:'workshop', label:'车间接收', tab:'recv', table:'workshop_receipt'},
      {id:'return', label:'退料管理', tab:'', table:'material_return_order'}]},
    {label:'成品管理', icon:'fa-flag-checkered', children:[
      {id:'finished', label:'成品输出登记', tab:'', table:'finished_output_order'}]},
    {label:'基础资料', icon:'fa-cubes', children:[
      {id:'base', label:'BOM管理', tab:'', table:'bom_header+bom_item'},
      {id:'base', label:'物料档案', tab:'2', table:'material'},
      {id:'base', label:'组织架构', tab:'3', table:'org_unit'},
      {id:'base', label:'库位/客户档案', tab:'4', table:'warehouse_location/customer'}]},
    {label:'单据中心', icon:'fa-file-lines', children:[
      {id:'docs', label:'业务记录查询', tab:'', table:'business_document'},
      {id:'ocr', label:'OCR工作台', tab:'', table:'ocr_document'}]},
    {label:'异常与审计', icon:'fa-triangle-exclamation', children:[
      {id:'report', label:'操作审计', tab:'3', table:'audit_log'}]},
    {label:'报表中心', icon:'fa-chart-line', children:[
      {id:'report', label:'报表中心', tab:'', table:'material_transaction'},
      {id:'report', label:'加工费对账', tab:'2', table:'customer_reconciliation'}]},
    {label:'系统管理', icon:'fa-gear', children:[
      {id:'users', label:'用户管理', tab:'', table:'sys_user/sys_role/user_data_scope'}]}
  ];

  function currentFile(){
    return (location.pathname.split('/').pop()||'').split('?')[0].split('#')[0];
  }
  function currentTab(){
    try{ return new URLSearchParams(location.search).get('tab')||''; }catch(e){ return ''; }
  }
  function isRecordFilter(id, tab){ return id==='docs' && !!tab && !/^\d+$/.test(tab); }
  function goPage(id, tab){
    if(!FILE[id]) return;
    tab = tab||'';
    var inApp = /from=app/.test(location.search);
    // 1) app.html 壳
    try{
      if(inApp && window.parent && typeof window.parent.go==='function'){
        window.parent.go(id, tab); return;
      }
    }catch(e){}
    // 2) index.html 平铺总览
    try{
      if(window.parent && window.parent!==window){
        window.parent.postMessage({from:'wms-nav', go:SECTION[id]||id, page:id, tab:tab}, '*');
        return;
      }
    }catch(e){}
    // 3) 单独打开
    var url = FILE[id] + (tab ? ('?tab='+tab) : '');
    if(currentFile()!==FILE[id] || currentTab()!==tab) location.href = url;
  }
  window.goPage = goPage;

  function sidebarHTML(){
    var cur = currentFile(), curTab = currentTab();
    var h = '';
    h += '<div class="flex items-center gap-2 text-white font-bold mb-3 px-1">'
      + '<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0"><i class="fa-solid fa-boxes-stacked text-sm"></i></div>'
      + '<div class="leading-tight"><div class="text-[13px]">物料管理系统</div><div class="text-[10px] font-normal text-slate-400">一期 · 内网 · 全菜单</div></div></div>';
    h += '<div class="text-[11px] text-slate-400 bg-white/5 rounded-lg p-2.5 mb-2 leading-relaxed">岗位：<b class="text-slate-200">仓库负责人 · 张建国</b><br>范围：外仓 / 内仓1 / 内仓2 · 一监区<br><span class="text-emerald-400">● 在线 · 点击菜单即切换</span></div>';
    GROUPS.forEach(function(g){
      h += '<div class="text-[11px] text-slate-500 px-2 pt-2 pb-1 font-bold"><i class="fa-solid '+g.icon+' mr-1"></i>'+g.label+'</div>';
      g.children.forEach(function(c){
        var on = (FILE[c.id]===cur && ((c.tab||'')===(curTab||'') || isRecordFilter(c.id,curTab))) || (FILE[c.id]===cur && !c.tab && !curTab);
        // 同页多二级时用 data-tab 区分高亮
        var style = on ? 'background:#2563eb;color:#fff;font-weight:700;' : '';
        h += '<button data-nav="'+c.id+'" data-tab="'+(c.tab||'')+'" title="'+(c.table||'')+'" style="'+style+'" class="w-full text-left px-3 py-[7px] rounded-lg text-[12.5px] text-slate-300 hover:bg-white/10 hover:text-white transition flex items-center justify-between gap-1">'
          + '<span>'+c.label+'</span><i class="fa-solid fa-chevron-right text-[9px] opacity-40"></i></button>';
      });
    });
    h += '<button data-nav="login" data-tab="" class="w-full text-left px-3 py-2 mt-3 rounded-lg text-[12px] text-slate-400 hover:bg-white/10 hover:text-white transition">'
      + '<i class="fa-solid fa-right-from-bracket mr-2"></i>返回登录</button>';
    return h;
  }

  function mount(){
    var file = currentFile();
    if(/mobile/.test(file)) return; // APP独立，不注入PC菜单
    var aside = document.querySelector('aside');
    if(!aside) return;
    if(/from=app/.test(location.search)){
      // app.html owns navigation; hide the legacy iframe sidebar and still honor tab params.
      aside.setAttribute('aria-hidden','true');
      aside.style.display='none';
      applyRequestedTab();
      return;
    }
    aside.classList.add('wms-fullnav');
    aside.innerHTML = sidebarHTML();
    aside.querySelectorAll('[data-nav]').forEach(function(b){
      b.addEventListener('click', function(){ goPage(b.getAttribute('data-nav'), b.getAttribute('data-tab')); });
    });
    // 支持 ?tab= 自动切页内 Tab（如 base.html 的物料/BOM/组织/库位）
    applyRequestedTab();
  }
  function applyRequestedTab(){
    var tab = currentTab();
    if(tab && typeof window.tab==='function'){
      var n = parseInt(tab, 10);
      if(!isNaN(n)){
        try{
          var btn = document.querySelectorAll('.tab')[n-1];
          if(btn) btn.click();
        }catch(e){}
      }
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
"""

nav_path = root/"assets"/"nav.js"
if nav_path.exists():
    print("nav.js preserved (shared enhancements already applied)")
else:
    nav_path.write_text(NAV_JS, encoding="utf-8")
    print("nav.js created, len", len(NAV_JS))

# 2. index.html 补父页面消息监听（子页面点菜单 → 滚动到对应 section；登录页点登录 → 滚动到驾驶舱）
idx = root/"index.html"
t = idx.read_text(encoding="utf-8")
listener = """<script>
window.addEventListener('message', function(e){
  if(!e.data || e.data.from!=='wms-nav') return;
  var id = e.data.go || e.data.page;
  if(!id) return;
  var sec = document.getElementById(id);
  if(sec){ sec.scrollIntoView({behavior:'smooth', block:'start'}); }
  try{
    var f = document.querySelector('section#'+id+' iframe');
    if(f && e.data.tab){ /* tab参数透传给子页面 */ 
      var src = f.getAttribute('src').split('?')[0];
      f.src = src + '?tab=' + e.data.tab;
    }
  }catch(err){}
});
</script>
</body>"""
if "wms-nav" not in t:
    t = t.replace("</body>", listener, 1)
    idx.write_text(t, encoding="utf-8")
    print("index.html listener added")
else:
    print("index.html listener exists")

# 3. 确保 login.html 的登录真正跳转（覆盖为可靠版本，兼容三种场景）
lp = root/"pages"/"login.html"
t = lp.read_text(encoding="utf-8")
# 找到旧 login 函数块并替换
import re
pat = re.compile(r"function login\(\).*?\n\}", re.S)
new_fn = """function login(){
  try{ toast('登录成功 · 欢迎回来，张建国'); }catch(e){}
  try{ if(window.Store){ Store.set(function(x){ x.user={name:'ZHANG',role:'R',scope:'S'}; }); } }catch(e){}
  setTimeout(function(){
    try{ toast('岗位已加载，正在进入 01 业务运营驾驶舱…'); }catch(e){}
    setTimeout(function(){
      try{ if(typeof goPage==='function'){ goPage('dashboard'); return; } }catch(e){}
      location.href='dashboard.html';
    }, 650);
  }, 650);
}
function loginFirstConfirm(){
  try{ toast('已确认，进入驾驶舱'); }catch(e){}
  setTimeout(function(){ try{ if(typeof goPage==='function'){ goPage('dashboard'); return; } }catch(e){} location.href='dashboard.html'; }, 500);
}"""
# 先还原被污染的中文（之前 patch 把中文写坏了）——直接重写函数名对应的调用即可，Store中文不影响演示
if "function login()" in t:
    t = pat.sub(new_fn, t, count=1)
    # 修复 Store.set 里被污染的中文（用英文占位不影响功能，仅演示）
    t = t.replace("x.user={name:'ZHANG',role:'R',scope:'S'}", "x.user={name:'\\u5f20\\u5efa\\u56fd',role:'\\u4ed3\\u5e93\\u8d1f\\u8d23\\u4eba',scope:'\\u5916\\u4ed3WH-A'}")
    # 首次确认按钮绑定
    if "loginFirstConfirm()" not in t:
        t = t.replace("toast('已确认，进入驾驶舱')", "loginFirstConfirm()")
    else:
        t = t.replace("onclick=\"toast('已确认，进入驾驶舱')\"", "onclick=\"loginFirstConfirm()\"")
    lp.write_text(t, encoding="utf-8")
    print("login.html fixed")
else:
    print("login fn missing!")

# 4. 确保所有PC页都引入 nav.js
for p in (root/"pages").glob("*.html"):
    name = p.name
    if "mobile" in name: continue
    tt = p.read_text(encoding="utf-8")
    if "assets/nav.js" not in tt and "</head>" in tt:
        tt = tt.replace("</head>", '<script src="../assets/nav.js"></script></head>', 1)
        p.write_text(tt, encoding="utf-8")
        print("nav added", name)
print("done")

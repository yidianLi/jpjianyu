import pathlib
root = pathlib.Path(__file__).parent
# 1. 给所有 pages/*.html 注入 nav.js（如果缺失）
for p in (root/"pages").glob("*.html"):
    t = p.read_text(encoding="utf-8")
    if "assets/nav.js" not in t:
        tag = '<script src="../assets/nav.js"></script></head>'
        if "</head>" in t:
            t = t.replace("</head>", tag, 1)
            p.write_text(t, encoding="utf-8")
            print("nav injected", p.name)
        else:
            print("no head", p.name)
    else:
        print("skip nav", p.name)

# 2. 修复 login.html：登录必须跳到 01 驾驶舱
lp = root/"pages"/"login.html"
t = lp.read_text(encoding="utf-8")
old_login = "function login(){toast('登录成功 · 欢迎回来，张建国');setTimeout(()=>toast('岗位：外仓管理员 · 范围已加载'),1200)}"
new_login = """function login(){
  toast('登录成功 · 欢迎回来，张建国');
  try{ if(window.Store){ Store.set(function(x){ x.user={name:'张建国',role:'仓库负责人',scope:'外仓WH-A · 内仓1/2 · 一监区'}; }); } }catch(e){}
  setTimeout(function(){
    toast('岗位：外仓管理员 · 范围已加载，正在进入驾驶舱…');
    setTimeout(function(){
      try{
        if(typeof goPage==='function'){ goPage('dashboard'); }
        else{ location.href='dashboard.html'; }
      }catch(e){ location.href='dashboard.html'; }
    }, 600);
  }, 700);
}
function loginFirstConfirm(){
  toast('已确认，进入驾驶舱');
  setTimeout(function(){ try{ if(typeof goPage==='function'){ goPage('dashboard'); } else { location.href='dashboard.html'; } }catch(e){ location.href='dashboard.html'; } }, 500);
}"""
if old_login in t:
    t = t.replace(old_login, new_login)
    print("login fn patched")
else:
    print("login fn NOT found, check manually")
# 首次登录确认按钮也跳转
t = t.replace("onclick=\"toast('已确认，进入驾驶舱')\"", "onclick=\"loginFirstConfirm()\"")
lp.write_text(t, encoding="utf-8")
print("login.html done")

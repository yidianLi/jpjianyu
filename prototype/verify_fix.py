import pathlib
root = pathlib.Path(__file__).parent
t = (root/"pages"/"login.html").read_text(encoding="utf-8")
print("login has goPage:", "goPage" in t)
print("has nav.js:", "assets/nav.js" in t)
i = t.find("function login")
print(t[i:i+800])
print("---INDEX---")
idx = (root/"index.html").read_text(encoding="utf-8")
print("index has wms-nav:", "wms-nav" in idx)
print("---NAV---")
nv = (root/"assets"/"nav.js").read_text(encoding="utf-8")
print("has gongzuotai:", "label:" in nv)
# check aside pages
for p in sorted((root/"pages").glob("*.html")):
    tt = p.read_text(encoding="utf-8")
    if "mobile" in p.name: continue
    print(p.name, "aside" , ("<aside" in tt), "navjs", ("nav.js" in tt))

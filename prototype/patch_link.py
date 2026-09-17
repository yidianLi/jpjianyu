import pathlib
root = pathlib.Path(__file__).parent
for p in (root/"pages").glob("*.html"):
    t = p.read_text(encoding="utf-8")
    if "assets/store.js" in t:
        print("skip", p.name); continue
    tag = '<script src="../assets/store.js"></script><script src="../assets/link.js"></script></head>'
    if "</head>" in t:
        t = t.replace("</head>", tag, 1)
    else:
        t = tag + t
    p.write_text(t, encoding="utf-8")
    print("patched", p.name)

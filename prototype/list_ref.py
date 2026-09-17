import pathlib
root = pathlib.Path('E:/jianyu')
dirs = [p for p in root.iterdir() if p.is_dir() and p.name not in ('prototype', 'output', '.playwright-cli')]
print(dirs)
refbase = dirs[0]
subs = [p for p in refbase.iterdir()]
print(subs)
for s in subs:
    if s.is_dir():
        print('SUBDIR:', s)
        items = list(s.rglob('*'))
        print('total', len(items))
        for p in items[:80]:
            print(('D ' if p.is_dir() else 'F ') + p.name + ' ' + (str(p.stat().st_size) if p.is_file() else ''))

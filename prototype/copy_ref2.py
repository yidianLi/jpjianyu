import pathlib, shutil
root = pathlib.Path('E:/jianyu')
refbase = [p for p in root.iterdir() if p.is_dir() and p.name not in ('prototype', 'output', '.playwright-cli')][0]
subs = [p for p in refbase.iterdir() if p.is_dir()]
prev = [p for p in subs[0].rglob('*') if p.is_file() and p.suffix.lower() == '.png']
dst = pathlib.Path('ref_preview')
dst.mkdir(exist_ok=True)
for i, p in enumerate(sorted(prev, key=lambda x: x.name)):
    ext = p.suffix
    target = dst / ('ref_%02d%s' % (i + 1, ext))
    shutil.copyfile(p, target)
    print(target, '<-', p.name, p.stat().st_size)

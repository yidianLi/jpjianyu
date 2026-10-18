"""国产库就绪审计:静态检查后端 SQL 与生成的 DDL 是否跨库可移植.

检查项:
  A. 后端代码里残留的 MySQL 专有写法(应全部走 dialect 抽象):
     - 反引号标识符 `x`
     - LIMIT :o,:n (逗号分页, MySQL 专有)
     - AUTO_INCREMENT / ON DUPLICATE KEY / INSERT IGNORE 直接写死
     - CURDATE()/DATE(...) 等 MySQL 函数(应在应用层算日期)
  B. 生成的 wms_pg.sql / wms_dm.sql 关键点:
     - 无 AUTO_INCREMENT、无反引号、无 ENGINE=、无 CHARSET=
     - 有 IDENTITY 自增
     - 独立 CREATE INDEX 存在

无真库环境下给出静态结论;真库实测需在有达梦/金仓实例时执行
wms_pg.sql / wms_dm.sql 并跑 selfcheck.py 连该库.

用法: python backend/portable_audit.py
退出码: 0=静态审计通过; 1=发现问题.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "app")
SQLDIR = os.path.join(HERE, "sql")

ALLOW_FILES = {"dialect.py", "guards.py", "qwen.py"}

BAD_PATTERNS = [
    (re.compile(r"`[a-zA-Z_]\w*`"), "反引号标识符"),
    (re.compile(r"LIMIT\s+:\w+\s*,\s*:\w+"), "LIMIT 逗号分页(MySQL专有)"),
    (re.compile(r"\bAUTO_INCREMENT\b"), "AUTO_INCREMENT"),
    (re.compile(r"ON\s+DUPLICATE\s+KEY", re.I), "ON DUPLICATE KEY"),
    (re.compile(r"INSERT\s+IGNORE", re.I), "INSERT IGNORE 写死"),
    (re.compile(r"\bCURDATE\s*\(\s*\)", re.I), "CURDATE()"),
    (re.compile(r"\bDATE\s*\(\s*\w+\s*\)", re.I), "DATE() 函数"),
]


def scan_app():
    problems = []
    for root, _dirs, files in os.walk(APP):
        for fn in files:
            if not fn.endswith(".py") or fn in ALLOW_FILES:
                continue
            path = os.path.join(root, fn)
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                s = line.strip()
                if s.startswith("#") or s.startswith('"""') or s.startswith("'''"):
                    continue
                # 跨行上下文:本行及前后 2 行出现 IS_MYSQL/dialect. 视为已按方言分支
                ctx = "".join(lines[max(0, i - 2):i + 3])
                gated = ("IS_MYSQL" in ctx) or ("dialect." in ctx)
                for rx, name in BAD_PATTERNS:
                    if rx.search(line):
                        if gated and name in ("ON DUPLICATE KEY",
                                              "INSERT IGNORE 写死",
                                              "AUTO_INCREMENT"):
                            continue
                        problems.append("%s:%d  %s  -> %s"
                                        % (os.path.relpath(path, HERE),
                                           i + 1, name, s[:70]))
    return problems


def _strip_line_comments(sql):
    return "\n".join(l for l in sql.splitlines()
                     if not l.strip().startswith("--"))


def scan_ddl(name):
    path = os.path.join(SQLDIR, name)
    if not os.path.exists(path):
        return ["缺文件 %s(先跑 gen_portable_ddl.py)" % name], {}
    with open(path, encoding="utf-8") as f:
        sql = _strip_line_comments(f.read())
    issues = []
    if re.search(r"AUTO_INCREMENT", sql, re.I):
        issues.append("%s 残留 AUTO_INCREMENT" % name)
    if "`" in sql:
        issues.append("%s 残留反引号" % name)
    if re.search(r"ENGINE\s*=", sql, re.I):
        issues.append("%s 残留 ENGINE=" % name)
    if re.search(r"DEFAULT\s+CHARSET", sql, re.I):
        issues.append("%s 残留 DEFAULT CHARSET" % name)
    if not re.search(r"IDENTITY", sql, re.I):
        issues.append("%s 缺 IDENTITY 自增" % name)
    n_index = len(re.findall(r"CREATE\s+(?:UNIQUE\s+)?INDEX", sql, re.I))
    stats = {"create_index": n_index,
             "create_table": len(re.findall(r"CREATE\s+TABLE", sql, re.I))}
    return issues, stats


def main():
    print("=" * 64)
    print(" 国产库可移植性静态审计")
    print("=" * 64)
    fails = []

    print("\n[A] 后端 SQL 残留 MySQL 专有写法:")
    probs = scan_app()
    if probs:
        for p in probs:
            print("  [X] " + p)
        fails.extend(probs)
    else:
        print("  [OK] 未发现残留(均已走 dialect 抽象)")

    print("\n[B] 生成 DDL 关键点:")
    for name in ("wms_pg.sql", "wms_dm.sql"):
        issues, stats = scan_ddl(name)
        if issues:
            for it in issues:
                print("  [X] " + it)
            fails.extend(issues)
        else:
            print("  [OK] %s  table=%s index=%s"
                  % (name, stats.get("create_table"), stats.get("create_index")))

    print("\n" + "=" * 64)
    if fails:
        print(" 结论: 发现 %d 处问题,需处理" % len(fails))
        print("=" * 64)
        return 1
    print(" 结论: 静态审计通过(真库实测需在达梦/金仓实例执行 DDL + selfcheck)")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())

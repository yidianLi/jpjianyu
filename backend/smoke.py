"""冒烟测试:不连库,只验护栏/幂等/分页/白名单/公式/路由挂载.行数<=300."""
import sys
sys.path.insert(0, ".")
from app.core import guards, resp, idem, dash

fails = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


check("deny-insert", guards.check_sql("INSERT INTO doc_main VALUES(1)") != "")
check("allow-select", guards.check_sql("SELECT doc_no FROM doc_main") == "")
check("deny-cte", guards.check_sql("WITH a AS (SELECT 1) SELECT * FROM a") != "")
check("deny-q", guards.check_question("帮我过账这批货") != "")
p, s = resp.page_args(1, 9999)
check("page-clamp", s == 200)
out = idem.replay_or_put("UT:1:LY", lambda: {"v": 1})
out2 = idem.replay_or_put("UT:1:LY", lambda: {"v": 2})
check("idem-replay", out2["replay"] and out2["data"] == {"v": 1})
r = resp.ok([1, 2], total=2)
check("resp-shape", r["code"] == 200 and r["total"] == 2 and r["data"] == [1, 2])
f = dash.formula()
check("dash-formula", "product_code LIKE 'CP-%'" in f and "Σ(TK)/Σ(LY)" in f)
from app.routers import web, masters, sysadm, reports, transfer, produce, docparts, app_, ai
n = sum(len(m.router.routes) for m in
        (web, masters, sysadm, reports, transfer, produce, docparts, app_, ai))
check("routes-59", n == 59)
if fails:
    raise SystemExit("SMOKE FAIL:" + ",".join(fails))
print("SMOKE ALL PASS")

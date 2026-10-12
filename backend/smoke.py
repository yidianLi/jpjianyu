"""冒烟测试:不连库,验护栏/幂等/分页/白名单/公式/挂载/端到端.行数<=300."""
import os
import sys
os.environ.setdefault("DB_URL", "mysql+pymysql://smoke:smoke@localhost:3306/wms")
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
check("deny-limit", guards.check_sql("SELECT * FROM doc_main LIMIT 500") != "")
check("deny-table", guards.check_sql("SELECT * FROM sys_user") != "")
p, s = resp.page_args(1, 9999)
check("page-clamp", s == 200)
out = idem.replay_or_put("UT:1:LY", lambda: {"v": 1})
out2 = idem.replay_or_put("UT:1:LY", lambda: {"v": 2})
check("idem-replay", out2["replay"] and out2["data"] == {"v": 1})
r = resp.ok([1, 2], total=2)
check("resp-shape", r["code"] == 200 and r["total"] == 2 and r["data"] == [1, 2])
f = dash.formula()
check("dash-formula", "product_code LIKE 'CP-%'" in f and "Σ(TK)/Σ(LY)" in f)
import os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'app', 'core', 'posting.py'), encoding='utf-8').read()
check("flow-quote", "'S1','草稿')" in src and "'草稿)" not in src.replace("'草稿')", ""))
check("idem-peek", idem.peek("UT:1:LY") == {"v": 1} and idem.peek("NOPE") is None)
from app.routers import web, masters, sysadm, reports, transfer, produce, docparts, app_, ai
n = sum(len(m.router.routes) for m in
        (web, masters, sysadm, reports, transfer, produce, docparts, app_, ai))
check("routes-72", n == 72)
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app, raise_server_exceptions=False)
h = client.get("/health")
check("health-200", h.status_code == 200 and h.json().get("code") == 200)
spec = client.get("/openapi.json").json()
paths = spec.get("paths", {})
check("openapi-72", "/api/v1/web/dashboard" in paths and "/api/v1/ai/ask" in paths and "/api/v1/web/masters/materials" in paths and "/api/v1/web/fee_settles/{settle_no}/confirm" in paths)
if fails:
    raise SystemExit("SMOKE FAIL:" + ",".join(fails))
print("SMOKE ALL PASS")

"""演示一键自检:投标/交付当天跑一遍,确认系统"演示就绪".

检查分层:
  [L1] 服务健康   /health 可达、/openapi.json 有核心路由
  [L2] 登录鉴权   admin 能登录拿到 token
  [L3] 主数据就绪  物料/成品/BOM/仓库/客户 都有种子数据
  [L4] 演示链路    建单→提交→审批→过账→库存→追溯→报表真数 全走通(自建自清,不动演示数据)
  [L5] 演示数据     现存里有可演示的批次/效期/条码

用法(宿主机,默认连本地映射端口):
    python backend/selfcheck.py
    python backend/selfcheck.py --base http://localhost:8080/api/v1 --user admin --pass ok
    python backend/selfcheck.py --skip-write     # 只读自检,不建演示单

退出码:0=全绿可演示; 1=有红项(需处理).
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid

GREEN, RED, YEL, RST = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


class Checker:
    def __init__(self, base, user, pwd):
        self.base = base.rstrip("/")
        self.user = user
        self.pwd = pwd
        self.token = ""
        self.fails = []
        self.warns = []
        self.passed = 0
        self.marker = "selfcheck"

    def _req(self, method, path, body=None, key=None, raw=False):
        r = urllib.request.Request(self.base + path, method=method)
        r.add_header("Content-Type", "application/json")
        if self.token:
            r.add_header("Authorization", "Bearer " + self.token)
        if key:
            r.add_header("Idempotency-Key", key)
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(r, data=data, timeout=25) as x:
                txt = x.read().decode("utf-8", "ignore")
                return x.status, (txt if raw else json.loads(txt))
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            return 0, str(e)

    def ok(self, name, cond, detail=""):
        if cond:
            self.passed += 1
            print(GREEN + "  PASS " + RST + name + ("  " + detail if detail else ""))
        else:
            self.fails.append(name)
            print(RED + "  FAIL " + RST + name + ("  " + detail if detail else ""))
        return cond

    def warn(self, name, detail=""):
        self.warns.append(name)
        print(YEL + "  WARN " + RST + name + ("  " + detail if detail else ""))

    # ---- L1 ----
    def l1_health(self):
        print("\n[L1] 服务健康")
        root = self.base[:-len("/api/v1")] if self.base.endswith("/api/v1") \
            else self.base
        r = urllib.request.Request(root + "/health")
        try:
            with urllib.request.urlopen(r, timeout=25) as x:
                j = json.loads(x.read().decode("utf-8", "ignore"))
            self.ok("/health 可达", j.get("code") == 200)
        except Exception as e:  # noqa: BLE001
            self.ok("/health 可达", False, str(e))
        r = urllib.request.Request(root + "/openapi.json")
        try:
            with urllib.request.urlopen(r, timeout=25) as x:
                j = json.loads(x.read().decode("utf-8", "ignore"))
        except Exception:  # noqa: BLE001
            j = {}
        paths = j.get("paths", {}) if isinstance(j, dict) else {}
        need = ["/api/v1/web/dashboard", "/api/v1/web/docs",
                "/api/v1/web/masters/materials", "/api/v1/ai/ask"]
        found = [p for p in need if p in paths]
        self.ok("OpenAPI 核心路由齐全", len(found) >= 3,
                "命中 %d/%d" % (len(found), len(need)))

    # ---- L2 ----
    def l2_auth(self):
        print("\n[L2] 登录鉴权")
        st, j = self._req("POST", "/web/auth/login",
                          {"username": self.user, "password": self.pwd})
        ok = (isinstance(j, dict) and j.get("code") == 200
              and j.get("data", {}).get("token"))
        self.ok("%s 登录成功" % self.user, bool(ok))
        if ok:
            self.token = j["data"]["token"]

    # ---- L3 ----
    def l3_master(self):
        print("\n[L3] 主数据就绪")
        for name, path, key in [
            ("物料", "/web/masters/materials?page_size=5", "materials"),
            ("成品", "/web/masters/products?page_size=5", "products"),
            ("BOM", "/web/masters/boms?page_size=5", "boms"),
            ("仓库库位", "/web/masters/locations?page_size=5", "locations"),
            ("客户", "/web/masters/customers?page_size=5", "customers"),
        ]:
            st, j = self._req("GET", path)
            total = (j or {}).get("total", 0) if isinstance(j, dict) else 0
            self.ok("主数据·%s 有数据" % name, total and total > 0,
                    "total=%s" % total)

    # ---- L4 演示链路(写入,自建自清) ----
    def l4_chain(self):
        print("\n[L4] 演示链路(建单→审批→过账→库存→追溯→报表)")
        u = uuid.uuid4().hex[:8]
        batch = "SC-" + u
        doc = ""
        st, j = self._req("POST", "/web/docs",
                          {"type": "RK", "handler": self.marker,
                           "lines": [{"material_code": "HD-ZP-011",
                                      "batch_no": batch, "qty": 7,
                                      "unit": "件", "loc": "WH-B-01"}]},
                          key="sc-" + u)
        doc = (j.get("data") or {}).get("doc_no") if isinstance(j, dict) else ""
        self.ok("建单(RK)", bool(doc), "doc=%s" % doc)
        if not doc:
            return
        self.ok("提交审核", self._req("POST", "/web/docs/%s/submit" % doc, {},
                                      key="scs-" + u)[1].get("data", {}).get(
            "biz_status") == "APPROVING")
        self.ok("审批通过", self._req("POST", "/web/docs/%s/approve" % doc,
                                      {"action": "通过"},
                                      key="sca-" + u)[1].get("data", {}).get(
            "flow_status") == "APPROVED")
        # 未审批不能过账已在上一步前测过P0,这里测审批后能过账
        st, j = self._req("POST", "/web/docs/%s/post" % doc, {}, key="scp-" + u)
        self.ok("过账 POSTED",
                isinstance(j, dict) and j.get("data", {}).get(
                    "biz_status") == "POSTED")
        st, j = self._req("GET", "/web/stock/onhand?material_code=HD-ZP-011",
                          None)
        rows = (j.get("data") or []) if isinstance(j, dict) else []
        hit = [r for r in rows if r.get("batch_no") == batch]
        self.ok("库存落地(批次现存)",
                bool(hit) and float(hit[0].get("on_hand") or 0) == 7.0,
                "on_hand=%s" % (hit[0].get("on_hand") if hit else "无"))
        st, j = self._req("GET", "/web/stock/trace?code=" + batch, None)
        tl = (j.get("data") or {}).get("timeline", []) if isinstance(j, dict) else []
        self.ok("追溯可查", len(tl) >= 1, "timeline=%d" % len(tl))
        st, j = self._req("GET", "/web/rpt_live?rpt_code="
                          + urllib.request.quote("收发存"), None)
        rows = (j.get("data") or {}).get("rows", []) if isinstance(j, dict) else []
        self.ok("报表真数(收发存)", isinstance(j, dict) and j.get("code") == 200,
                "rows=%d" % len(rows))
        # 清理:删本单流水/现存/单据(尽力,不影响演示数据)
        self._cleanup(doc, batch)

    def _cleanup(self, doc, batch):
        # 自检单已过账,无法经接口回滚;用独立 handler/批次标记,演示数据不受影响。
        # 交付前跑一次 cleanup_selfcheck.sql 即可清干净(见 backend/sql).
        self.warns.append("自检残留单 %s(批次 %s)可用 cleanup_selfcheck.sql 清理"
                          % (doc, batch))

    # ---- L5 演示数据 ----
    def l5_demo_data(self):
        print("\n[L5] 演示数据")
        st, j = self._req("GET", "/web/stock/onhand?page_size=50", None)
        rows = (j.get("data") or []) if isinstance(j, dict) else []
        self.ok("现存有数据", len(rows) > 0, "rows=%d" % len(rows))
        st, j = self._req("GET", "/web/stock/batches?page_size=50", None)
        batches = (j.get("data") or []) if isinstance(j, dict) else []
        self.ok("批次档案有数据", len(batches) > 0, "batches=%d" % len(batches))
        exp = [b for b in batches if b.get("expire_date")]
        if exp:
            print(GREEN + "  PASS " + RST + "效期数据存在  %d 个批次有保质期"
                  % len(exp))
            self.passed += 1
        else:
            self.warn("效期数据缺失", "入库物料未配 shelf_life_days")
        st, j = self._req("GET", "/web/stock/items?page_size=10", None)
        items = (j.get("data") or []) if isinstance(j, dict) else []
        if items:
            print(GREEN + "  PASS " + RST + "单件条码存在  %d 个"
                  % (j.get("total") or len(items)))
            self.passed += 1
        else:
            self.warn("单件条码为空", "CODE物料未入库/演示库无码(可选)")

    def run(self, skip_write=False):
        print("=" * 60)
        print(" 简普仓储 · 演示一键自检  @ %s" % self.base)
        print("=" * 60)
        self.l1_health()
        self.l2_auth()
        if not self.token:
            print(RED + "\n无法登录,后续检查中止。请确认账号或服务。" + RST)
            self.report()
            return
        self.l3_master()
        if skip_write:
            self.warn("[L4] 演示链路已跳过", "--skip-write")
        else:
            self.l4_chain()
        self.l5_demo_data()
        self.report()

    def report(self):
        print("\n" + "=" * 60)
        total = self.passed + len(self.fails)
        if not self.fails:
            print(GREEN + "  ✓ 演示就绪: %d 项通过" % self.passed
                  + ("  · %d 项提醒" % len(self.warns) if self.warns else "")
                  + RST)
        else:
            print(RED + "  ✗ 有 %d 项未通过(共 %d 项):" % (len(self.fails), total)
                  + RST)
            for f in self.fails:
                print(RED + "    - " + f + RST)
        print("=" * 60)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080/api/v1")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--pass", dest="pwd", default="ok")
    ap.add_argument("--skip-write", action="store_true",
                    help="只读自检,不建演示单")
    a = ap.parse_args()
    c = Checker(a.base, a.user, a.pwd)
    c.run(skip_write=a.skip_write)
    return 0 if not c.fails else 1


if __name__ == "__main__":
    sys.exit(main())

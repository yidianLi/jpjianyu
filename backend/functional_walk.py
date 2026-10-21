"""全页面功能点巡检:按角色账号把每个页面的每个功能点跑一遍,出清单+权限矩阵+清理SQL.

用法(宿主机):
    python backend/functional_walk.py
    python backend/functional_walk.py --base http://localhost:8080/api/v1
    python backend/functional_walk.py --skip-write        # 只跑只读入口(不建单)
产出:
    终端: 逐页面 PASS/FAIL 清单 + 只读入口覆盖 + 功能权限矩阵 + 汇总
    文件: output/walk_cleanup.sql(本次产生的单据/报表的精确清理脚本)
退出码: 0=全通过; 1=有 FAIL; 2=登录失败
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

GREEN, RED, YEL, RST = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
MARK = "walk"                      # 巡检数据标记(handler/batch/客户)
READ_ENTRIES = [
    "/web/dashboard", "/web/stock/onhand", "/web/stock/ledger",
    "/web/stock/batches", "/web/stock/expiry", "/web/stock/items",
    "/web/docs", "/web/masters/materials?page_size=5",
    "/web/masters/products?page_size=5", "/web/masters/boms",
    "/web/masters/warehouses", "/web/masters/locations",
    "/web/masters/customers", "/web/masters/org_tree",
    "/web/masters/doc_templates", "/web/meta/biz_states",
    "/web/meta/bill_methods", "/web/rpt_configs", "/web/rpt_instances",
    "/web/print_templates", "/web/custom_reports/meta",
    "/web/custom_reports", "/web/system/audit_logs",
    "/web/flow_instances", "/web/system/scan_logs", "/web/system/users",
    "/web/system/roles", "/web/system/equipment",
    "/web/system/sync_queue", "/web/prod_plans", "/web/sale_orders",
    "/web/transfer_ships", "/web/pd_tasks", "/web/fee_settles",
    "/web/arrival_analysis", "/web/auth/me",
]


class Walk:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.tok = {}
        self.rows = []
        self.made = {}

    def req(self, m, p, b=None, who=None, key=None, raw=False):
        r = urllib.request.Request(self.base + p, method=m)
        r.add_header("Content-Type", "application/json")
        t = self.tok.get(who or "")
        if t:
            r.add_header("Authorization", "Bearer " + t)
        if key:
            r.add_header("Idempotency-Key", key)
        data = json.dumps(b).encode() if b is not None else None
        try:
            x = urllib.request.urlopen(r, data, timeout=25)
            txt = x.read()
            return x.status, (txt if raw else json.loads(txt.decode("utf-8", "ignore")))
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            return 0, str(e)

    @staticmethod
    def code(j):
        return j.get("code") if isinstance(j, dict) else None

    @staticmethod
    def data(j):
        return j.get("data") if isinstance(j, dict) else None

    def login(self, user, pwd):
        s, j = self.req("POST", "/web/auth/login",
                        {"username": user, "password": pwd})
        ok = s == 200 and isinstance(j, dict) and j.get("code") == 200
        self.tok[user] = j["data"]["token"] if ok else ""
        return ok

    def step(self, page, name, ok, detail=""):
        self.rows.append((page, name, bool(ok), str(detail)))
        print("  " + (GREEN + "PASS " + RST if ok else RED + "FAIL " + RST)
              + "[" + page + "] " + name + (("  " + str(detail)) if detail else ""))
        return bool(ok)


def build_walk(w, u, opt):
    who = w.tok
    batch = "WALK-" + u
    w.made["batch"] = batch
    ad, wh, sp, de, hd, fn, mt = (who.get(x, "") for x in
                                  ["admin", "whin", "sup", "demo", "head",
                                   "fin", "mat"])

    def need(name, t):
        if t:
            return True
        w.step(name, "角色账号未登录,跳过", True, "SKIP")
        return False

    print("\n== A 基础资料 g5(查看 + 修改) ==")
    for label, path in [("物料档案", "/web/masters/materials?page_size=5"),
                        ("成品档案", "/web/masters/products?page_size=5"),
                        ("BOM管理", "/web/masters/boms"),
                        ("仓库档案", "/web/masters/warehouses"),
                        ("库区档案", "/web/masters/locations"),
                        ("客户档案", "/web/masters/customers"),
                        ("组织架构", "/web/masters/org_tree")]:
        s, j = w.req("GET", path, None, "admin")
        w.step("基础资料", label + " 列表(查看)", w.code(j) == 200, str(s))
    if need("基础资料", ad):
        s, j = w.req("PATCH", "/web/masters/materials/HD-ZP-011/status",
                     {"enabled": "0"}, "admin")
        w.step("基础资料", "物料档案 状态停用(修改)", w.code(j) == 200, str(s))
        s, j = w.req("PATCH", "/web/masters/materials/HD-ZP-011/status",
                     {"enabled": "1"}, "admin")
        w.step("基础资料", "物料档案 状态恢复(修改)", w.code(j) == 200, str(s))

    print("\n== B 单据 g2/g4/g6(录入→审批→过账) ==")
    doc = ""
    if need("物料入库", wh) and need("审批", sp) and need("过账", de):
        s, j = w.req("POST", "/web/docs",
                     {"type": "RK", "handler": MARK,
                      "lines": [{"material_code": "HD-ZP-011",
                                 "batch_no": batch, "qty": 5,
                                 "unit": "件", "loc": "WH-A-01"}]},
                     "whin", key="wk-rk-" + u)
        d = w.data(j) or {}
        doc = d.get("doc_no", "")
        w.made["doc"] = doc
        w.step("物料入库", "建单 RK(录入)", bool(doc), doc)
        if doc:
            s, j = w.req("POST", "/web/docs/%s/submit" % doc, {}, "whin",
                         key="wk-s-" + u)
            d = w.data(j) or {}
            w.step("物料入库", "提交审核(录入)",
                   d.get("biz_status") == "APPROVING", str(s))
            s, j = w.req("POST", "/web/docs/%s/approve" % doc,
                         {"action": "通过"}, "sup", key="wk-a-" + u)
            d = w.data(j) or {}
            w.step("审批", "审批通过(审批)",
                   d.get("flow_status") == "APPROVED", str(s))
            s, j = w.req("POST", "/web/docs/%s/post" % doc, {}, "demo",
                         key="wk-p-" + u)
            d = w.data(j) or {}
            w.step("过账", "过账入账(过账)",
                   d.get("biz_status") == "POSTED", str(s))
    if doc and need("业务记录", wh):
        s, j = w.req("POST", "/web/docs/%s/attachments" % doc,
                     {"ref": "oss://walk/photo.jpg", "kind": "照片"}, "whin")
        w.step("业务记录", "上传附件(录入)", w.code(j) == 200, str(s))
        s, j = w.req("GET", "/web/docs/%s/attachments" % doc, None, "whin")
        rows = w.data(j) or []
        w.step("业务记录", "附件列表(查看)", w.code(j) == 200, str(s))
        if rows:
            aid = rows[0].get("id")
            s, j = w.req("DELETE", "/web/docs/%s/attachments/%s"
                         % (doc, aid), None, "whin")
            w.step("业务记录", "删除附件(修改)", w.code(j) == 200, str(s))
    if need("二维码中心", wh):
        s, j = w.req("POST", "/web/label_prints",
                     {"code": batch, "kind": "批次标签", "content": "walk"},
                     "whin")
        w.step("二维码中心", "标签打印(录入)", w.code(j) == 200, str(s))

    print("\n== C 仓库库存 g1(查看 + 确认) ==")
    stk = {}
    if need("仓库库存", wh):
        s, j = w.req("GET", "/web/stock/onhand?material_code=HD-ZP-011",
                     None, "whin")
        rows = w.data(j) or []
        hit = [r for r in rows if r.get("batch_no") == batch]
        w.step("仓库库存", "现存列表(查看)", w.code(j) == 200, str(s))
        w.step("仓库库存", "过账落地校验", bool(hit),
               ("on_hand=%s" % hit[0].get("on_hand")) if hit else "")
        stk = hit[0] if hit else {}
    base = {"material_code": stk.get("material_code", "HD-ZP-011"),
            "product_code": stk.get("product_code", ""), "batch_no": batch,
            "wh": stk.get("wh", ""), "loc": stk.get("loc", "WH-A-01")}

    def act(name, path, qty):
        body = dict(base)
        body["qty"] = qty
        s, j = w.req("POST", path, body, "whin")
        w.step("仓库库存", name + "(确认)", w.code(j) == 200,
               "%s/%s" % (s, w.code(j)))

    if stk and need("仓库库存", wh):
        act("冻结", "/web/stock/freeze", 2)
        act("解冻", "/web/stock/unfreeze", 2)
        act("待发占用", "/web/stock/reserve", 2)
        act("释放待发", "/web/stock/release", 2)

    print("\n== D 库存调仓 g1(录入) ==")
    if need("库存调仓", wh):
        s, j = w.req("POST", "/web/transfer_ships",
                     {"from_wh": "WH-A", "to_wh": "WH-B",
                      "lines": [{"qty": 1, "unit": "件"}],
                      "handler": MARK}, "whin", key="wk-t-" + u)
        d = w.data(j) or {}
        tr = d.get("doc_no", "")
        w.made["transfer"] = tr
        w.step("库存调仓", "建调仓单(录入)", bool(tr), tr)
        if tr:
            s, j = w.req("PATCH", "/web/transfer_ships/%s/receive" % tr,
                         {"n_qty": 1}, "whin")
            w.step("库存调仓", "收货复核(录入)", w.code(j) == 200, str(s))

    print("\n== E 库存盘点 g1(确认) ==")
    if need("库存盘点", wh):
        s, j = w.req("POST", "/web/pd_tasks",
                     {"wh_code": "WH-A", "mode": "人工临时",
                      "handler": MARK}, "whin")
        d = w.data(j) or {}
        pd = d.get("pd_no", "")
        w.made["pd"] = pd
        w.step("库存盘点", "建盘点任务(确认)", bool(pd), pd)
        if pd:
            s, j = w.req("GET", "/web/pd_tasks/%s/lines" % pd, None, "whin")
            lines = w.data(j) or []
            w.step("库存盘点", "盘点明细(查看)", w.code(j) == 200, str(s))
            l1 = lines[0] if lines else {}
            s, j = w.req("POST", "/web/pd_tasks/%s/confirm" % pd,
                         {"line_no": l1.get("line_no", 1),
                          "n_qty": l1.get("o_qty", 0)}, "whin")
            w.step("库存盘点", "盘点复核(确认)", w.code(j) == 200, str(s))
            s, j = w.req("POST", "/web/pd_tasks/%s/adjust" % pd, {}, "whin")
            w.step("库存盘点", "差异调整(确认)", w.code(j) == 200,
                   "%s/%s" % (s, w.code(j)))

    print("\n== F 生产/成品 g4/g6(录入) ==")
    prod = ""
    if need("生产", wh):
        s, j = w.req("GET", "/web/masters/boms", None, "whin")
        boms = w.data(j) or []
        pick = [b for b in boms if b.get("status") == "启用"]
        if not pick:
            w.step("生产", "取启用BOM(查看)", False, "无启用BOM")
        else:
            prod = pick[0].get("product_code", "")
            s, j = w.req("POST", "/web/sale_orders",
                         {"customer": "巡检客户", "product_code": prod,
                          "qty_order": 10, "due_date": "2026-12-31"},
                         "whin")
            d = w.data(j) or {}
            so = d.get("order_no", "")
            w.made["so"] = so
            w.step("生产", "销售下单(录入)", bool(so), so)
            s, j = w.req("POST", "/web/prod_plans",
                         {"order_no": so, "product_code": prod,
                          "qty_plan": 10, "workshop": "一车间"}, "whin")
            d = w.data(j) or {}
            pp = d.get("plan_no", "")
            w.made["pp"] = pp
            w.step("生产", "建生产计划(录入)", bool(pp), pp)
            if pp:
                s, j = w.req("GET", "/web/prod_plans/%s/demand" % pp,
                             None, "whin")
                w.step("生产", "需求展开(查看)", w.code(j) == 200, str(s))
                s, j = w.req("POST", "/web/prod_plans/%s/to_wo" % pp, {},
                             "whin")
                d = w.data(j) or {}
                wo = d.get("wo_no", "")
                w.made["wo"] = wo
                w.step("生产", "计划转工单(录入)", bool(wo), wo)
                if wo:
                    s, j = w.req("POST", "/web/wo_tasks/%s/issue" % wo,
                                 {"handler": MARK, "loc": "WH-A-01"},
                                 "whin")
                    d = w.data(j) or {}
                    w.made["ly"] = d.get("ly_no", "")
                    w.step("生产", "按BOM领料建LY(录入)", w.code(j) == 200,
                           "%s/%s" % (s, w.code(j)))
                    s, j = w.req("POST", "/web/wo_tasks/%s/finish" % wo,
                                 {"qty_done": 10, "handler": MARK}, "whin")
                    d = w.data(j) or {}
                    rk = d.get("rk_no", "")
                    w.made["rk"] = rk
                    w.step("生产", "完工建RK(录入)", bool(rk), rk)
                    if rk:
                        s, j = w.req("POST", "/web/deliver_signs",
                                     {"doc_no": rk, "receiver": "客户",
                                      "sign_time": "2026-10-21 10:00:00"},
                                     "whin")
                        w.step("成品交付", "交付签收(录入)", w.code(j) == 200,
                               str(s))

    print("\n== G 加工费对账 g6(录入→确认) ==")
    if need("加工费对账", mt):
        s, j = w.req("POST", "/web/fee_settles",
                     {"customer": "巡检客户", "period": "2026-10",
                      "lines": [{"material_code": "HD-ZP-011", "unit": "件",
                                 "qty_send": 5, "qty_issue": 3, "qty_fin": 2}],
                      "amount": 200}, "mat")
        d = w.data(j) or {}
        dz = d.get("settle_no", "")
        w.made["fee"] = dz
        w.step("加工费对账", "建对账单(录入)", bool(dz), dz)
        if dz:
            s, j = w.req("GET", "/web/fee_settles?customer="
                         + urllib.parse.quote("巡检客户"), None, "head")
            w.step("加工费对账", "对账查询(查看)", w.code(j) == 200, str(s))
            if need("加工费对账", hd):
                s, j = w.req("POST", "/web/fee_settles/%s/confirm" % dz,
                             {"confirmed": True, "note": "巡检"}, "head")
                d = w.data(j) or {}
                w.step("加工费对账", "对账确认(确认)",
                       d.get("biz_status") == "确认", str(s))

    print("\n== H 报表中心 g8(查看/审批) ==")
    if need("报表中心", hd):
        s, j = w.req("GET", "/web/rpt_live?rpt_code="
                     + urllib.parse.quote("收发存"), None, "head")
        w.step("报表中心", "即时预览(查看)", w.code(j) == 200, str(s))
        s, j = w.req("POST", "/web/rpt_instances/generate",
                     {"rpt_code": "收发存", "period": "2026-10"}, "head")
        d = w.data(j) or {}
        rpt = d.get("rpt_no", "")
        w.made["rpt"] = rpt
        w.step("报表中心", "生成报表(查看)", bool(rpt), rpt)
        if rpt and need("报表中心", sp):
            s, j = w.req("POST", "/web/rpt_instances/%s/publish" % rpt, {},
                         "sup")
            d = w.data(j) or {}
            w.step("报表中心", "发布报表(审批)",
                   d.get("biz_status") == "发布", str(s))
        s, j = w.req("GET", "/web/rpt_instances", None, "head")
        w.step("报表中心", "实例列表(查看)", w.code(j) == 200, str(s))

    print("\n== I 自定义报表 g8(修改) ==")
    if need("自定义报表", ad):
        s, j = w.req("POST", "/web/custom_reports",
                     {"name": "巡检自定义",
                      "defn": {"dataset": "onhand", "dims": ["wh"],
                               "measures": [{"fn": "SUM",
                                             "col": "on_hand"}]}}, "admin")
        d = w.data(j) or {}
        rc = d.get("rpt_code", "")
        w.made["rc"] = rc
        w.step("自定义报表", "新建(修改)", bool(rc), rc)
        if rc:
            s, j = w.req("GET", "/web/custom_reports/%s/run" % rc, None,
                         "admin")
            w.step("自定义报表", "运行(查看)", w.code(j) == 200, str(s))
            s, j = w.req("POST", "/web/custom_reports/%s/generate" % rc, {},
                         "admin")
            w.step("自定义报表", "生成实例(查看)", w.code(j) == 200, str(s))
            s, j = w.req("DELETE", "/web/custom_reports/%s" % rc, None,
                         "admin")
            w.step("自定义报表", "删除(修改)", w.code(j) == 200, str(s))

    print("\n== J 打印模板 g8(修改) ==")
    pt = ""
    if need("打印模板", ad):
        s, j = w.req("POST", "/web/print_templates",
                     {"name": "巡检模板", "doc_type": "RK",
                      "title": "验收单",
                      "columns": [{"k": "material_code", "label": "物料",
                                   "w": 120},
                                  {"k": "qty", "label": "数量", "w": 80}]},
                     "admin")
        d = w.data(j) or {}
        pt = d.get("tpl_code", "")
        w.made["pt"] = pt
        w.step("打印模板", "新建(修改)", bool(pt), pt)
        if pt and doc:
            s, j = w.req("GET", "/web/print_templates/%s/render?doc_no=%s"
                         % (pt, doc), None, "admin")
            w.step("打印模板", "渲染预览(查看)", w.code(j) == 200, str(s))

    print("\n== K 数据导出(导出) ==")
    if need("导出", fn):
        for name, path in [("库存台账", "/web/export/onhand.xlsx"),
                           ("单据明细", "/web/export/docs.xlsx"),
                           ("加工费", "/web/export/fee.xlsx"),
                           ("到货分析", "/web/export/arrival.xlsx")]:
            s, j = w.req("GET", path, None, "fin", raw=True)
            ok = s == 200 and isinstance(j, (bytes, bytearray))
            w.step("数据导出", name + " xlsx(导出)", ok,
                   ("bytes=%d" % len(j)) if ok else str(s))
        if pt and doc:
            s, j = w.req("GET", "/web/export/print.xlsx?tpl_code=%s&doc_no=%s"
                         % (pt, doc), None, "fin", raw=True)
            ok = s == 200 and isinstance(j, (bytes, bytearray))
            w.step("数据导出", "打印模板 xlsx(导出)", ok,
                   ("bytes=%d" % len(j)) if ok else str(s))
    if pt:
        s, j = w.req("DELETE", "/web/print_templates/%s" % pt, None, "admin")
        w.step("打印模板", "删除(修改)", w.code(j) == 200, str(s))

    print("\n== L 系统管理/审计 g7/g9 ==")
    if need("系统管理", ad):
        for name, path in [("操作审计", "/web/system/audit_logs"),
                           ("设备扫码记录", "/web/system/scan_logs"),
                           ("用户管理", "/web/system/users"),
                           ("角色管理", "/web/system/roles"),
                           ("设备管理", "/web/system/equipment"),
                           ("同步队列", "/web/system/sync_queue"),
                           ("审批流实例", "/web/flow_instances")]:
            s, j = w.req("GET", path, None, "admin")
            w.step("系统管理", name + "(查看)", w.code(j) == 200, str(s))
        uname = "walk_" + u
        s, j = w.req("POST", "/web/system/users",
                     {"username": uname, "name": "巡检账号",
                      "password": "Walk@2026", "roles": ["R-WS"]}, "admin")
        d = w.data(j) or {}
        w.made["user"] = uname
        w.step("用户管理", "建账号(修改)", bool(d.get("username")), uname)
        s, j = w.req("POST", "/web/system/users/%s/roles" % uname,
                     {"roles": ["R-WS", "R-FG"]}, "admin")
        w.step("用户管理", "多角色授权(修改)", w.code(j) == 200, str(s))


def read_matrix(w):
    print("\n== M 功能权限矩阵(√允许 / ×拒绝403) ==")
    probes = [("录入", "POST", "/web/docs/NOPE/submit", {}),
              ("审批", "POST", "/web/docs/NOPE/approve", {"action": "通过"}),
              ("过账", "POST", "/web/docs/NOPE/post", {}),
              ("确认", "POST", "/web/pd_tasks/NOPE/confirm", {}),
              ("修改", "DELETE", "/web/print_templates/NOPE", None),
              ("导出", "GET", "/web/export/onhand.xlsx", None),
              ("查看", "POST", "/web/custom_reports/run",
               {"defn": {"dataset": "x"}})]
    cols = [p[0] for p in probes]
    print("  " + "%-8s" % "账号" + " ".join("%-5s" % c for c in cols))
    for user in w.tok:
        if not w.tok[user]:
            continue
        row = []
        for act, m, p, b in probes:
            s, _j = w.req(m, p, b, user)
            row.append("×" if s == 403 else "√")
        print("  " + "%-8s" % user + " ".join("%-5s" % c for c in row))


def write_cleanup(w):
    m = w.made
    ids = [m.get(k) for k in ("doc", "transfer", "pd", "so", "pp", "wo",
                               "ly", "rk", "fee", "rpt", "rc", "pt", "user")]
    lines = ["-- 功能巡检残留清理(由 backend/functional_walk.py 生成)",
             "DELETE FROM audit_log WHERE doc_no IN (%s);"
             % ",".join("'%s'" % i for i in ids if i),
             "DELETE FROM deliver_sign WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM stock_ledger WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM material_item WHERE source_doc_no IN (SELECT doc_no"
             " FROM doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM flow_instance WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM transfer_ship WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM doc_attachment WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM doc_line WHERE doc_no IN (SELECT doc_no FROM"
             " doc_main WHERE handler='%s');" % MARK,
             "DELETE FROM doc_main WHERE handler='%s';" % MARK,
             "DELETE FROM stock_onhand WHERE batch_no LIKE 'WALK-%%';",
             "DELETE FROM batch WHERE batch_no LIKE 'WALK-%%';",
             "DELETE FROM label_print WHERE code LIKE 'WALK-%%';",
             "DELETE FROM pd_line WHERE pd_no IN (SELECT pd_no FROM pd_task"
             " WHERE handler='%s');" % MARK,
             "DELETE FROM pd_task WHERE handler='%s';" % MARK,
             "DELETE FROM fee_settle_line WHERE settle_no IN (SELECT"
             " settle_no FROM fee_settle WHERE customer='巡检客户');",
             "DELETE FROM fee_settle WHERE customer='巡检客户';",
             "DELETE FROM rpt_instance WHERE rpt_no='%s' OR rpt_code='%s';"
             % (m.get("rpt") or "", m.get("rc") or ""),
             "DELETE FROM sys_user_role WHERE username LIKE 'walk\\_%';",
             "DELETE FROM sys_user WHERE username LIKE 'walk\\_%';"]
    for key, table, col in (("so", "sale_order", "order_no"),
                             ("pp", "prod_plan", "plan_no"),
                             ("wo", "wo_task", "wo_no")):
        if m.get(key):
            lines.append("DELETE FROM %s WHERE %s='%s';"
                         % (table, col, m[key]))
    p = os.path.join("output", "walk_cleanup.sql")
    os.makedirs("output", exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080/api/v1")
    ap.add_argument("--admin-user", default="admin")
    ap.add_argument("--admin-pass", default="ok")
    ap.add_argument("--skip-write", action="store_true")
    a = ap.parse_args()
    w = Walk(a.base)
    print("=" * 66)
    print(" 全页面功能点巡检  @ %s" % a.base)
    print("=" * 66)
    accts = [(a.admin_user, a.admin_pass), ("demo", "demo123456"),
             ("whin", "WhIn@2026"), ("mat", "Mat@2026"),
             ("sup", "Sup@2026"), ("head", "Head@2026"),
             ("fin", "Fin@2026")]
    for u, p in accts:
        if not w.login(u, p):
            print("  登录失败: %s" % u)
    if not w.tok.get(a.admin_user):
        print(RED + "管理员登录失败,巡检中止" + RST)
        return 2
    print("\n== 1 只读入口覆盖(应全部 200) ==")
    bad = 0
    for path in READ_ENTRIES:
        s, j = w.req("GET", path, None, a.admin_user)
        if not (s == 200 and w.code(j) == 200):
            bad += 1
            print("  " + RED + "FAIL " + RST + path + " (%s)" % s)
    s, j = w.req("GET", "/web/rpt_live?rpt_code="
                 + urllib.parse.quote("收发存"), None, a.admin_user)
    if not (s == 200 and w.code(j) == 200):
        bad += 1
    tot = len(READ_ENTRIES) + 1
    print("  入口 %d/%d 通过%s" % (tot - bad, tot, "" if not bad else
                                 RED + " (缺 %d)" % bad + RST))
    if not a.skip_write:
        build_walk(w, uuid.uuid4().hex[:6], a)
    read_matrix(w)
    ok = sum(1 for r in w.rows if r[2])
    badrows = [r for r in w.rows if not r[2]]
    print("\n" + "=" * 66)
    print(" 功能点巡检: PASS %d / 共 %d" % (ok, len(w.rows)))
    for r in badrows:
        print(RED + "   FAIL [%s] %s %s" % (r[0], r[1], r[3]) + RST)
    p = write_cleanup(w)
    print(" 清理脚本已生成: %s" % p)
    print("=" * 66)
    return 1 if badrows else 0


if __name__ == "__main__":
    sys.exit(main())
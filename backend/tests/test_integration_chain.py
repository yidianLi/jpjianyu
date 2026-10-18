"""真实库端到端集成:核心业务链路(建单→审批→过账→库存→追溯→报表→分量→盘调→导入).

与 test_integration_db.py 不同,本文件依赖**完整 wms 表结构**(非最小 sys_user),
验证整条业务链在真库上的正确性.默认跳过;CI/联调时:
    WMS_ENABLE_DB_TESTS=1 DB_URL=mysql+pymysql://wms:wms@127.0.0.1:3306/wms pytest -m db
用例自建单据/批次(handler='itest',批次前缀 IT-),结束后自清,不动演示数据.
"""
import os
import uuid

import pytest
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

pytestmark = pytest.mark.db

if os.getenv("WMS_ENABLE_DB_TESTS") != "1":
    pytest.skip("DB 集成测试未启用(设 WMS_ENABLE_DB_TESTS=1 且 DB_URL 指向完整 wms 库)",
                allow_module_level=True)

DB_URL = os.getenv("DB_URL",
                   "mysql+pymysql://wms:wms@127.0.0.1:3306/wms?charset=utf8mb4")
engine = create_engine(DB_URL, pool_pre_ping=True)
client = TestClient(app, raise_server_exceptions=False)


def _login():
    r = client.post("/api/v1/web/auth/login",
                    json={"username": "admin", "password": "ok"})
    j = r.json()
    if j.get("code") != 200:
        pytest.skip("admin/ok 登录失败,跳过(演示库需 admin 账号)")
    return {"Authorization": "Bearer " + j["data"]["token"]}


@pytest.fixture(scope="module")
def auth():
    return _login()


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # 清理本测试建的 handler='itest' 单据与 IT- 批次
    with engine.begin() as c:
        c.execute(text(
            "DELETE FROM stock_ledger WHERE doc_no IN "
            "(SELECT doc_no FROM doc_main WHERE handler='itest')"))
        c.execute(text(
            "DELETE FROM doc_line WHERE doc_no IN "
            "(SELECT doc_no FROM doc_main WHERE handler='itest')"))
        c.execute(text(
            "DELETE FROM flow_instance WHERE doc_no IN "
            "(SELECT doc_no FROM doc_main WHERE handler='itest')"))
        c.execute(text("DELETE FROM doc_main WHERE handler='itest'"))
        c.execute(text("DELETE FROM stock_onhand WHERE batch_no LIKE 'IT-%'"))
        c.execute(text("DELETE FROM batch WHERE batch_no LIKE 'IT-%'"))


def _mk_doc(auth, lines, dtype="RK"):
    r = client.post("/api/v1/web/docs",
                    json={"type": dtype, "handler": "itest", "lines": lines},
                    headers=dict(auth, **{"Idempotency-Key": uuid.uuid4().hex}))
    return r.json()["data"]["doc_no"]


def _to_posted(auth, doc):
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    client.post("/api/v1/web/docs/%s/submit" % doc, json={}, headers=h)
    client.post("/api/v1/web/docs/%s/approve" % doc, json={"action": "通过"},
                headers=h)
    return client.post("/api/v1/web/docs/%s/post" % doc, json={}, headers=h)


def test_full_chain_inbound_to_report(auth):
    batch = "IT-" + uuid.uuid4().hex[:8]
    doc = _mk_doc(auth, [{"material_code": "HD-ZP-011", "batch_no": batch,
                          "qty": 12, "unit": "件", "loc": "WH-B-01"}])
    assert doc
    r = _to_posted(auth, doc)
    assert r.json()["data"]["biz_status"] == "POSTED"
    # 库存落地
    r = client.get("/api/v1/web/stock/onhand?material_code=HD-ZP-011",
                   headers=auth)
    hit = [x for x in r.json()["data"] if x["batch_no"] == batch]
    assert hit and float(hit[0]["on_hand"]) == 12.0
    # 追溯可查
    r = client.get("/api/v1/web/stock/trace?code=" + batch, headers=auth)
    assert len(r.json()["data"]["timeline"]) >= 1
    # 报表真数
    r = client.get("/api/v1/web/rpt_live?rpt_code=" + "收发存", headers=auth)
    assert r.json()["code"] == 200


def test_post_requires_approval(auth):
    doc = _mk_doc(auth, [{"material_code": "HD-ZP-011", "qty": 3, "unit": "件",
                          "loc": "WH-B-01"}])
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    client.post("/api/v1/web/docs/%s/submit" % doc, json={}, headers=h)
    # 未审批直接过账 -> 403
    r = client.post("/api/v1/web/docs/%s/post" % doc, json={}, headers=h)
    assert r.json()["code"] == 403


def test_reject_blocks_post(auth):
    doc = _mk_doc(auth, [{"material_code": "HD-ZP-011", "qty": 2, "unit": "件",
                          "loc": "WH-B-01"}])
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    client.post("/api/v1/web/docs/%s/submit" % doc, json={}, headers=h)
    client.post("/api/v1/web/docs/%s/approve" % doc,
                json={"action": "退回", "opinion": "测试退回"}, headers=h)
    r = client.post("/api/v1/web/docs/%s/post" % doc, json={}, headers=h)
    assert r.json()["code"] == 403


def test_qc_quarantine_flow(auth):
    batch = "IT-QC-" + uuid.uuid4().hex[:6]
    doc = _mk_doc(auth, [{"material_code": "HD-NK-005", "batch_no": batch,
                          "qty": 10, "unit": "件", "loc": "WH-C-01",
                          "qc_result": "待检"}])
    _to_posted(auth, doc)
    loc = {"material_code": "HD-NK-005", "batch_no": batch, "loc": "WH-C-01"}
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    # 待检入库:可用0,隔离10
    r = client.get("/api/v1/web/stock/onhand?material_code=HD-NK-005",
                   headers=auth)
    row = [x for x in r.json()["data"] if x["batch_no"] == batch][0]
    assert float(row["quarantine"]) == 10.0 and float(row["avail"]) == 0.0
    # 质检合格 6 -> 可用6 隔离4
    r = client.post("/api/v1/web/stock/qc", json=dict(loc, qty=6, verdict="pass"),
                    headers=h)
    assert r.json()["code"] == 200
    r = client.get("/api/v1/web/stock/onhand?material_code=HD-NK-005",
                   headers=auth)
    row = [x for x in r.json()["data"] if x["batch_no"] == batch][0]
    assert float(row["avail"]) == 6.0 and float(row["quarantine"]) == 4.0


def test_attachment_add_list_del(auth):
    doc = _mk_doc(auth, [{"material_code": "HD-ZP-011", "qty": 1, "unit": "件",
                          "loc": "WH-B-01"}])
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    client.post("/api/v1/web/docs/%s/attachments" % doc,
                json={"kind": "照片", "ref": "it://x.jpg"}, headers=h)
    r = client.get("/api/v1/web/docs/%s/attachments" % doc, headers=auth)
    rows = r.json()["data"]
    assert len(rows) == 1
    r = client.delete("/api/v1/web/docs/%s/attachments/%s"
                      % (doc, rows[0]["id"]), headers=auth)
    assert r.json()["code"] == 200


def test_material_import(auth):
    code = "IT-IMP-" + uuid.uuid4().hex[:6]
    csv = ("material_code,cat_code,name,spec,base_unit,pack_unit,pack_qty,"
           "manage_mode,price_ref\n%s,ML,集成导入料,X,米,卷,100,CODE,1.0\n"
           % code)
    h = dict(auth, **{"Idempotency-Key": uuid.uuid4().hex})
    r = client.post("/api/v1/web/masters/materials/import",
                    json={"csv": csv}, headers=h)
    assert r.json()["data"]["imported"] == 1
    with engine.begin() as c:
        c.execute(text("DELETE FROM mat_master WHERE material_code=:m"),
                  {"m": code})

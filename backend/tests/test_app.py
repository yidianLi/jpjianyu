"""应用级离线断言：健康检查 / openapi 路由表 / 重定向 / 原型静态挂载。

这些用例不连库，对应原 smoke.py 的端到端两项 + 路由计数，升级为结构化 pytest。
"""
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app, raise_server_exceptions=False)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    j = r.json()
    assert j["code"] == 200 and j["data"]["ok"]


def test_openapi_paths():
    spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    assert "/api/v1/web/dashboard" in paths
    assert "/api/v1/ai/ask" in paths


def test_route_count():
    from app.routers import ai, app_, docparts, masters, produce, reports, sysadm, transfer, web
    n = sum(len(m.router.routes) for m in
            (web, masters, sysadm, reports, transfer, produce, docparts, app_, ai))
    assert n == 69


def test_index_redirect():
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "dashboard" in r.headers.get("location", "")


def test_proto_mount_login():
    r = client.get("/proto/pages/login.html")
    assert r.status_code == 200

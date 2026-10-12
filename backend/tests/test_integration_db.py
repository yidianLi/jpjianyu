"""真实 MySQL 5.6 联调用例：验证 DB 链路 + 登录业务逻辑端到端。

默认跳过：本地开发不连库。CI 中通过 services 启动 MySQL 5.6 容器启用，
设置 WMS_ENABLE_DB_TESTS=1 与 DB_URL 后，用例自建最小 sys_user 表并清理，
不依赖 wms.sql 全量初始化，保证稳定可重复。
"""
import hashlib
import os

import pytest
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.db

if os.getenv("WMS_ENABLE_DB_TESTS") != "1":
    pytest.skip(
        "DB 集成测试未启用。设置 WMS_ENABLE_DB_TESTS=1 且 DB_URL 指向可达的 MySQL。",
        allow_module_level=True,
    )

DB_URL = os.getenv(
    "DB_URL",
    "mysql+pymysql://wms:wms@127.0.0.1:3306/wms?charset=utf8mb4",
)
engine = create_engine(DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _sha(p):
    return hashlib.sha256(("wms:" + str(p)).encode()).hexdigest()


@pytest.fixture(scope="module", autouse=True)
def schema():
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS sys_user"))  # noqa: S608
        c.execute(text(  # noqa: S608
            "CREATE TABLE sys_user("
            "username VARCHAR(32) PRIMARY KEY, name VARCHAR(32), "
            "password_hash VARCHAR(128), enabled TINYINT)"
        ))
        c.execute(text(  # noqa: S608
            "INSERT INTO sys_user(username,name,password_hash,enabled) "
            "VALUES(:u,:n,:p,1)"
        ), {"u": "ci_admin", "n": "CI", "p": _sha("ci_pass")})
    yield
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS sys_user"))  # noqa: S608


client = TestClient(app, raise_server_exceptions=False)


def test_login_success():
    r = client.post("/api/v1/web/auth/login",
                    json={"username": "ci_admin", "password": "ci_pass"})
    assert r.status_code == 200
    j = r.json()
    assert j["code"] == 200
    assert "token" in j["data"]


def test_login_wrong_password():
    r = client.post("/api/v1/web/auth/login",
                    json={"username": "ci_admin", "password": "wrong"})
    assert r.json()["code"] == 401


def test_login_unknown_user():
    r = client.post("/api/v1/web/auth/login",
                    json={"username": "ghost", "password": "x"})
    assert r.json()["code"] == 401

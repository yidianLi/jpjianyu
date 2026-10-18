"""真实 MySQL 5.6 联调用例：验证 DB 链路 + 登录业务逻辑端到端。

需要空 MySQL 库(无 wms 生产表,如 CI services)，设置
WMS_ENABLE_DB_TESTS=1 与 DB_URL 后运行。fixture 遇到已有生产数据的库
(含 doc_main/stock_ledger/fee_settle 或已有账号)会整模块跳过,绝不 DROP 真表。
最小 sys_user 由用例自建自清。
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


_T_USER = "ci_sys_user"


@pytest.fixture(scope="module", autouse=True)
def schema():
    # 安全护栏:该文件曾在联调时 DROP 过演示库的真实 sys_user(已修复回灌).
    # 若目标库已含 wms 生产表/doc_main 或 sys_user 有账号数据,说明是演示/生产库,
    # 拒绝在此建最小表,整模块跳过——CI 请用空 MySQL(无 wms 表)跑.
    with engine.begin() as c:
        real = c.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_name IN "
            "('doc_main','stock_ledger','fee_settle')")).scalar() or 0
        accounts = 0
        try:
            accounts = c.execute(text("SELECT COUNT(*) FROM sys_user")).scalar() or 0
        except Exception:
            accounts = -1  # 无 sys_user 表:空库,可建
    if real > 0 or accounts > 0:
        pytest.skip("拒绝在已有生产数据(含 %d 个账号)的库上 DROP sys_user;改用空库跑" % accounts)
    with engine.begin() as c:
        c.execute(text("CREATE TABLE sys_user("
                       "username VARCHAR(32) PRIMARY KEY, name VARCHAR(32), "
                       "password_hash VARCHAR(128), enabled TINYINT)"))
        c.execute(text(
            "INSERT INTO sys_user(username,name,password_hash,enabled) "
            "VALUES(:u,:n,:p,1)"
        ), {"u": "ci_admin", "n": "CI", "p": _sha("ci_pass")})
    yield
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS sys_user"))


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

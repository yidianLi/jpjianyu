"""pytest 公共 fixture：TestClient 与可注入的 FakeDB 桩。

离线用例不连库；db 标记的用例见 tests/test_integration_db.py，由环境变量启用。
"""
import pytest


class FakeResult:
    """模拟 SQLAlchemy Result：支持 .scalar() / .mappings().all() / .first()。"""

    def __init__(self, scalar=0, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar(self):
        return self._scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return (self._rows[0] if self._rows else None)


class FakeDB:
    """按 SQL 子串路由返回预设结果，用于不连库的单元/聚合逻辑测试。"""

    def __init__(self, mapping=None):
        self._m = mapping or {}

    def execute(self, stmt, params=None):
        sql = str(stmt).lower()
        for key, val in self._m.items():
            if key in sql:
                return FakeResult(scalar=val.get("scalar", 0),
                                  rows=val.get("rows", []))
        return FakeResult()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fake_db():
    return FakeDB()

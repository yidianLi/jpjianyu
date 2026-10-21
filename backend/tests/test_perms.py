"""多角色权限合并单元测试(用脚本化假 DB,不连库)。"""
from app.core import perms


class _R:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def mappings(self):
        return self


class FakeDB:
    def __init__(self, roles_of, role_defs):
        self._q = [roles_of, role_defs]

    def execute(self, sql, params=None):
        return self._q.pop(0)


def test_effective_union_and_admin():
    db = FakeDB(
        _R([("R-WH",), ("R-ADMIN",)]),
        _R([
            {"role_id": "R-WH", "func_allow": "查看,录入", "data_scope": "WH-A"},
            {"role_id": "R-ADMIN", "func_allow": "*", "data_scope": "*"},
        ]),
    )
    e = perms.effective(db, "u")
    assert e["roles"] == ["R-WH", "R-ADMIN"]
    assert e["is_admin"] is True
    assert "查看" in e["funcs"] and "*" in e["funcs"]
    assert e["data_scope"] == {"*"}


def test_non_admin_multi_role():
    db = FakeDB(
        _R([("R-A",), ("R-B",)]),
        _R([
            {"role_id": "R-A", "func_allow": "查看", "data_scope": "WH-A"},
            {"role_id": "R-B", "func_allow": "录入,审批", "data_scope": "WH-B"},
        ]),
    )
    e = perms.effective(db, "u")
    assert e["is_admin"] is False
    assert e["funcs"] == {"查看", "录入", "审批"}
    assert e["data_scope"] == {"WH-A", "WH-B"}


def test_no_roles_is_denied():
    e = perms.effective(FakeDB(_R([]), _R([])), "u")
    assert e["roles"] == [] and e["is_admin"] is False
    assert e["funcs"] == set()


def test_has_func_union():
    # 管理员:任意动作放行
    db = FakeDB(_R([("R-ADMIN",)]),
                _R([{"role_id": "R-ADMIN", "func_allow": "*", "data_scope": "*"}]))
    assert perms.has_func(db, "u", "过账") is True
    # 普通角色:按并集判断
    db2 = FakeDB(_R([("R-A",), ("R-B",)]),
                 _R([{"role_id": "R-A", "func_allow": "查看", "data_scope": ""},
                     {"role_id": "R-B", "func_allow": "审批", "data_scope": ""}]))
    assert perms.has_func(db2, "u", "审批") is True

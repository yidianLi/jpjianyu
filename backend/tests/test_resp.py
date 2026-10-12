"""统一返回体与分页钳制单元测试。"""
from app.core import resp


def test_ok_shape():
    r = resp.ok([1, 2], total=2)
    assert r == {"code": 200, "msg": "成功", "data": [1, 2], "total": 2}


def test_ok_none_data():
    r = resp.ok()
    assert r["data"] == {} and r["total"] == 1


def test_fail_shape():
    r = resp.fail(401, "X")
    assert r["code"] == 401 and r["msg"] == "X" and r["total"] == 0


def test_page_clamp_low():
    p, s = resp.page_args(0, 9999)
    assert p == 1 and s == 200


def test_page_clamp_high_size():
    p, s = resp.page_args(5, 9999)
    assert s == 200


def test_page_clamp_min_size():
    # 负数会被钳到下限 1
    p, s = resp.page_args(1, -5)
    assert s == 1


def test_page_default_when_zero():
    # 0 在 or 20 语义下回落为默认 20
    p, s = resp.page_args(1, 0)
    assert s == 20

"""驾驶舱聚合单元测试：公式字符串 + 三域 KPI（用 FakeDB 注入，不连库）+ 预警。"""
from app.core import dash

from tests.helpers import FakeDB


def test_formula():
    f = dash.formula()
    assert "Σledger WHERE biz='LY'" in f
    assert "Σ(TK)/Σ(LY)" in f
    assert "CP-%" in f


def test_kpi():
    db = FakeDB({
        "from doc_main": {"scalar": 3},
        "stock_onhand": {"scalar": 10.0},
        "pd_task": {"scalar": 2},
        "biz='ly'": {"scalar": 100.0},
        "product_code like 'cp-%'": {"scalar": 40.0},
        "biz='tk'": {"scalar": 5.0},
    })
    k = dash.kpi(db)
    assert k["todo"] == 3
    assert k["onhand"] == 10.0
    assert k["diff"] == 2
    assert k["turnover"]["issue"] == 100.0
    assert k["turnover"]["fin_in"] == 40.0
    assert k["capacity"]["back_qty"] == 5.0
    assert abs(k["capacity"]["back_rate"] - 0.05) < 1e-9


def test_alerts():
    db = FakeDB({"pd_task": {"rows": [{"doc": "PD-1", "reason": "盘点未关闭"}]}})
    a = dash.alerts(db)
    assert a[0]["doc"] == "PD-1"
    assert "/docs.html?code=PD-1" in a[0]["link"]

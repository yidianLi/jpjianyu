"""自定义报表受控聚合引擎单元测试:白名单校验与参数化 SQL(不连库)."""
import pytest

from app.core import customrpt


def test_reject_bad_dataset():
    with pytest.raises(ValueError):
        customrpt.normalize({"dataset": "nope", "dims": [],
                             "measures": [{"fn": "SUM", "col": "qty"}]})


def test_reject_bad_dim():
    with pytest.raises(ValueError):
        customrpt.normalize({"dataset": "onhand", "dims": ["on_hand; DROP"],
                             "measures": [{"fn": "SUM", "col": "on_hand"}]})


def test_reject_bad_agg_and_col():
    with pytest.raises(ValueError):
        customrpt.normalize({"dataset": "onhand", "dims": [],
                             "measures": [{"fn": "DROP", "col": "on_hand"}]})
    with pytest.raises(ValueError):
        customrpt.normalize({"dataset": "onhand", "dims": [],
                             "measures": [{"fn": "SUM", "col": "evil_col"}]})


def test_reject_empty_measures():
    with pytest.raises(ValueError):
        customrpt.normalize({"dataset": "onhand", "dims": [], "measures": []})


def test_build_is_parameterized():
    n = customrpt.normalize({
        "dataset": "ledger", "dims": ["material_code", "biz"],
        "measures": [{"fn": "SUM", "col": "qty"}],
        "filters": {"wh": ["WH-A"], "material_code": "HD-"},
        "start": "2026-10-01", "end": "2026-10-31"})
    sql, args = customrpt._build(customrpt.DATASETS["ledger"], n)
    # 用户值只出现在参数里,不进 SQL 文本
    assert "WH-A" not in sql and "HD-" not in sql
    assert args["wh0"] == "WH-A" and args["mc"] == "%HD-%"
    assert ":dt_s" in sql and ":dt_e" in sql
    assert "GROUP BY material_code, biz" in sql
    assert sql.strip().startswith("SELECT")

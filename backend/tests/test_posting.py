"""过账口径不变式：确保状态机首态引用 S1/草稿 的写法未被误改。"""
import os

from app.core import posting as posting  # 确保模块可导入（无副作用）


def _src():
    here = os.path.dirname(os.path.abspath(__file__))
    return open(os.path.join(here, "..", "app", "core", "posting.py"),
                encoding="utf-8").read()


def test_import_posting():
    assert posting is not None


def test_flow_quote_invariants():
    src = _src()
    assert "'S1','草稿')" in src
    stripped = src.replace("'S1','草稿')", "")
    assert "'草稿)" not in stripped

"""幂等键单元测试：replay / replay_or_put / peek / idem_key 头。"""
import uuid

import pytest
from app.core import idem
from fastapi import HTTPException


def _k(prefix: str) -> str:
    """每次运行用唯一键：idem 落库(idem_log)跨进程持久,固定键会让重跑时
    第一个断言就命中历史记录(replay=True),属于测试自身的隔离缺陷。"""
    return "%s:%s" % (prefix, uuid.uuid4().hex[:10])


def test_replay_after_put():
    key = _k("UT:1:LY")
    out = idem.replay_or_put(key, lambda: {"v": 1})
    assert not out["replay"] and out["data"] == {"v": 1}
    out2 = idem.replay_or_put(key, lambda: {"v": 2})
    assert out2["replay"] and out2["data"] == {"v": 1}


def test_peek():
    key = _k("PK:1")
    idem.replay_or_put(key, lambda: {"x": 9})
    assert idem.peek(key) == {"x": 9}
    assert idem.peek("NOPE-" + uuid.uuid4().hex[:8]) is None


def test_replay_missing():
    assert idem.replay("MISS") is None


def test_idem_key_required():
    with pytest.raises(HTTPException):
        idem.idem_key("")


def test_idem_key_ok():
    assert idem.idem_key("abc") == "abc"

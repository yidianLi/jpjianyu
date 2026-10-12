"""幂等键单元测试：replay / replay_or_put / peek / idem_key 头。"""
import pytest
from app.core import idem
from fastapi import HTTPException


def test_replay_after_put():
    out = idem.replay_or_put("UT:1:LY", lambda: {"v": 1})
    assert not out["replay"] and out["data"] == {"v": 1}
    out2 = idem.replay_or_put("UT:1:LY", lambda: {"v": 2})
    assert out2["replay"] and out2["data"] == {"v": 1}


def test_peek():
    idem.replay_or_put("PK:1", lambda: {"x": 9})
    assert idem.peek("PK:1") == {"x": 9}
    assert idem.peek("NOPE") is None


def test_replay_missing():
    assert idem.replay("MISS") is None


def test_idem_key_required():
    with pytest.raises(HTTPException):
        idem.idem_key("")


def test_idem_key_ok():
    assert idem.idem_key("abc") == "abc"

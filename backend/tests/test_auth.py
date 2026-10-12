"""鉴权单元测试：Token 签发 / Bearer / 时间戳防重放 / 设备白名单。"""
import time

import pytest
from app.core import auth
from fastapi import HTTPException


def test_issue_token():
    t = auth.issue_token("u1")
    assert isinstance(t, str) and len(t) >= 16
    assert auth.TOKENS[t]["username"] == "u1"


def test_need_auth_valid():
    t = auth.issue_token("u2")
    res = auth.need_auth(authorization="Bearer " + t,
                         x_device_id="PDA-03",
                         x_timestamp=str(int(time.time() * 1000)))
    assert res["username"] == "u2"


def test_need_auth_missing_bearer():
    with pytest.raises(HTTPException):
        auth.need_auth(authorization="", x_device_id="PDA-03", x_timestamp="")


def test_need_auth_short_token():
    with pytest.raises(HTTPException):
        auth.need_auth(authorization="Bearer abc", x_device_id="", x_timestamp="")


def test_need_auth_expired_timestamp():
    t = auth.issue_token("u3")
    with pytest.raises(HTTPException):
        auth.need_auth(authorization="Bearer " + t, x_timestamp="0")


def test_need_auth_unknown_token():
    with pytest.raises(HTTPException):
        auth.need_auth(authorization="Bearer " + ("z" * 40),
                       x_timestamp=str(int(time.time() * 1000)))


def test_need_app_device_ok():
    assert auth.need_app_device({"device": "PDA-04"})["device"] == "PDA-04"


def test_need_app_device_denied():
    with pytest.raises(HTTPException):
        auth.need_app_device({"device": "WEB-99"})

"""统一返回 {code,msg,data,total}.阿里规约:函数短小,命名见名知意."""
from typing import Any


def ok(data: Any = None, total: int = 1) -> dict:
    if data is None:
        data = {}
    return {"code": 200, "msg": "成功", "data": data, "total": total}


def fail(code: int, msg: str, data: Any = None) -> dict:
    if data is None:
        data = {}
    return {"code": code, "msg": msg, "data": data, "total": 0}


def page_args(page: int = 1, page_size: int = 20) -> tuple:
    page = max(1, int(page or 1))
    size = min(200, max(1, int(page_size or 20)))
    return page, size

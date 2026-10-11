"""幂等:Idempotency-Key=doc_no:line_no:biz,重复直接返原结果."""
from fastapi import Header, HTTPException

_STORE: dict = {}

def replay(key: str):
    if key in _STORE:
        return {"replay": True, "data": _STORE[key]}
    return None


def idem_key(key: str = Header(default="", alias="Idempotency-Key")) -> str:
    if not key:
        raise HTTPException(status_code=400, detail="IDEMPOTENCY_KEY_REQUIRED")
    return key


def peek(key: str):
    return _STORE.get(key)


def replay_or_put(key: str, maker):
    cached = replay(key)
    if cached:
        return cached
    data = maker()
    _STORE[key] = data
    return {"replay": False, "data": data}

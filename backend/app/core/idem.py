"""幂等:Idempotency-Key落库idem_log,重启不丢,重复返原结果."""
import json
from fastapi import Header, HTTPException
from sqlalchemy import text


def idem_key(key: str = Header(default="", alias="Idempotency-Key")) -> str:
    if not key:
        raise HTTPException(status_code=400, detail="IDEMPOTENCY_KEY_REQUIRED")
    return key


def _db():
    from app.core.db import SessionLocal
    return SessionLocal()


_MEM: dict = {}


def replay(key: str):
    if key in _MEM:
        return {"replay": True, "data": _MEM[key]}
    try:
        db = _db()
        try:
            row = db.execute(text("SELECT response FROM idem_log"
                                  " WHERE idem_key=:k"), {"k": key}).first()
        finally:
            db.close()
    except Exception:
        return None
    if row and row[0]:
        try:
            data = json.loads(row[0])
        except Exception:
            return None
        _MEM[key] = data
        return {"replay": True, "data": data}
    return None


def put(key: str, data: dict):
    _MEM[key] = data
    try:
        db = _db()
        try:
            db.execute(text("INSERT INTO idem_log(idem_key,response)"
                            " VALUES(:k,:r) ON DUPLICATE KEY UPDATE"
                            " response=VALUES(response)"),
                       {"k": key, "r": json.dumps(data, ensure_ascii=False)})
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def peek(key: str):
    found = replay(key)
    return found["data"] if found else None


def replay_or_put(key: str, maker):
    cached = replay(key)
    if cached:
        return cached
    data = maker()
    try:
        put(key, data)
    except Exception:
        pass
    return {"replay": False, "data": data}

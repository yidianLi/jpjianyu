"""鉴权:Bearer+设备白名单+时间戳防重放.行数<=300."""
import time
import secrets
from fastapi import Header, HTTPException

APP_DEVICES = {"PDA-03", "PDA-04"}
TOKENS = {}

def issue_token(username: str) -> str:
    token = secrets.token_urlsafe(32)
    TOKENS[token] = {"username": username, "issued_at": time.time()}
    return token


def need_auth(authorization: str = Header(default=""),
              x_device_id: str = Header(default=""),
              x_timestamp: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer ") or len(authorization) < 12:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")
    if x_timestamp:
        try:
            if abs(time.time() * 1000 - float(x_timestamp)) > 5 * 60 * 1000:
                raise HTTPException(status_code=401, detail="TIMESTAMP_EXPIRED")
        except ValueError:
            raise HTTPException(status_code=401, detail="TIMESTAMP_INVALID")
    token = authorization[7:].strip()
    session = TOKENS.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")
    if time.time() - session["issued_at"] > 8 * 60 * 60:
        TOKENS.pop(token, None)
        raise HTTPException(status_code=401, detail="TOKEN_EXPIRED")
    return {"token": token, "device": x_device_id, "username": session["username"]}


def need_app_device(auth: dict) -> dict:
    if auth.get("device") not in APP_DEVICES:
        raise HTTPException(status_code=403, detail="SCOPE_DENIED")
    return auth

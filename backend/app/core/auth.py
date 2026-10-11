"""鉴权:Bearer+设备白名单+时间戳防重放.行数<=300."""
import time
from fastapi import Header, HTTPException

APP_DEVICES = {"PDA-03", "PDA-04"}


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
    return {"token": authorization[7:], "device": x_device_id}


def need_app_device(auth: dict) -> dict:
    if auth.get("device") not in APP_DEVICES:
        raise HTTPException(status_code=403, detail="SCOPE_DENIED")
    return auth

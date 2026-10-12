"""鉴权:JWT Bearer + 设备白名单 + 时间戳防重放 + 管理员角色.行数<=300.

改造说明(原内存 TOKENS 字典已移除):
- 原实现把 token 存在进程内存 dict,gunicorn 多进程不共享、重启即失效、无主动过期。
- 现改用 PyJWT(HS256)签发无状态令牌,用户名/设备写入 payload,自带 exp(默认8h)。
- 前端无需改动:仍是 Authorization: Bearer <jwt>,need_auth 解析 payload 还原上下文。
- 生产必须配置环境变量 WMS_JWT_SECRET,否则启动告警并使用开发兜底密钥(禁止上生产)。
"""
import time
import os
import logging
import jwt
from fastapi import Depends, Header, HTTPException

APP_DEVICES = {"PDA-03", "PDA-04"}
JWT_ALGO = "HS256"
JWT_EXP_SECONDS = 8 * 60 * 60  # 8 小时

JWT_SECRET = os.getenv("WMS_JWT_SECRET", "")
if not JWT_SECRET:
    # 开发期兜底:明确告警,生产务必配置 WMS_JWT_SECRET
    logging.warning("WMS_JWT_SECRET 未配置,使用内置开发密钥,生产环境请勿如此!")
    JWT_SECRET = "dev-only-insecure-secret-change-me"


def issue_token(username: str, device: str = "") -> str:
    """签发 JWT,携带 sub(用户名)/device/iat/exp。"""
    now = int(time.time())
    payload = {"sub": username, "device": device,
               "iat": now, "exp": now + JWT_EXP_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def need_auth(authorization: str = Header(default=""),
              x_device_id: str = Header(default=""),
              x_timestamp: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer ") or len(authorization) < 12:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")
    # 时间戳防重放:±5 分钟窗口(可选头,老客户端可不动)
    if x_timestamp:
        try:
            if abs(time.time() * 1000 - float(x_timestamp)) > 5 * 60 * 1000:
                raise HTTPException(status_code=401, detail="TIMESTAMP_EXPIRED")
        except ValueError:
            raise HTTPException(status_code=401, detail="TIMESTAMP_INVALID")
    token = authorization[7:].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="TOKEN_EXPIRED")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")
    return {"token": token,
            "device": payload.get("device") or x_device_id,
            "username": payload.get("sub", "")}


def need_app_device(auth: dict) -> dict:
    if auth.get("device") not in APP_DEVICES:
        raise HTTPException(status_code=403, detail="SCOPE_DENIED")
    return auth


def need_admin(auth: dict = Depends(need_auth)) -> dict:
    from sqlalchemy import text as _text
    from app.core.db import SessionLocal as _SessionLocal
    db = _SessionLocal()
    try:
        hit = db.execute(_text("SELECT 1 FROM sys_user_role"
                               " WHERE username=:u AND role_id='R-ADMIN'"),
                         {"u": auth.get("username") or ""}).first()
    finally:
        db.close()
    if not hit:
        raise HTTPException(status_code=403, detail="ADMIN_ONLY:需要系统管理员角色")
    return auth

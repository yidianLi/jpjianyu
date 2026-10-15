"""系统管理最小可用:登录/我/用户/角色/设备/队列.密码哈希比对,Token演示签发."""
import hashlib
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()


def _sha(pwd):
    return hashlib.sha256(("wms:" + str(pwd or "")).encode()).hexdigest()


class LoginReq(BaseModel):
    username: str
    password: str = ""


@router.post("/auth/login")
def login(body: LoginReq, response: Response, db: Session = Depends(get_db)):
    username = body.username
    row = db.execute(text("SELECT username,name,password_hash,enabled FROM sys_user"
                          " WHERE username=:u"), {"u": username}).mappings().first()
    if not row or int(row["enabled"] or 0) != 1:
        return resp.fail(401, "TOKEN_INVALID:账号不存在或已停用")
    if not row["password_hash"] or row["password_hash"] != _sha(body.password):
        return resp.fail(401, "TOKEN_INVALID:密码错误")
    token = auth.issue_token(username)
    # 下发表会话 Cookie:供页面级登录门禁识别登录态(同源、HttpOnly)。
    # 前端仍按原逻辑把 token 存 localStorage 用于接口 Bearer 鉴权,两者并存。
    response.set_cookie(
        key="wms_session",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=auth.JWT_EXP_SECONDS,
        path="/",
        secure=False,
    )
    return resp.ok({"token": token, "name": row["name"], "username": username})


@router.get("/auth/me")
def me(authed: dict = Depends(auth.need_auth),
       db: Session = Depends(get_db)):
    username = authed.get("username") or ""
    if not username:
        return resp.ok({"username": "demo", "demo": True})
    row = db.execute(text("SELECT username,name,data_scope,status FROM sys_user"
                          " WHERE username=:u"), {"u": username}).mappings().first()
    roles = db.execute(text("SELECT role_id FROM sys_user_role WHERE username=:u"),
                       {"u": username}).mappings().all()
    data = dict(row) if row else {"username": username}
    data["roles"] = [r["role_id"] for r in roles]
    return resp.ok(data)


@router.get("/system/users")
def users(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) c FROM sys_user")).scalar() or 0
    rows = db.execute(text("SELECT username,name,phone,data_scope,enabled,status"
                           " FROM sys_user LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/system/roles")
def roles(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT role_id,name,cat_allow,func_allow,data_scope"
                           " FROM sys_role")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/system/equipment")
def equipment(authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT eq_id,kind,sn,holder,status FROM equipment")).mappings().all()
    out = [dict(r, sn="*" + str(r["sn"] or "")[-4:]) for r in rows]
    return resp.ok(out, total=len(out))


@router.get("/system/sync_queue")
def sync_queue(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) c FROM sync_queue"
                            " WHERE biz_status='PENDING'")).scalar() or 0
    rows = db.execute(text("SELECT id,payload,biz_status,retries,at FROM sync_queue"
                           " WHERE biz_status='PENDING' LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))

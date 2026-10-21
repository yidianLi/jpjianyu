"""系统管理最小可用:登录/我/用户/角色/设备/队列.密码哈希比对,Token演示签发."""
import hashlib
import os
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, ratelimit, perms
from app.core.db import get_db

router = APIRouter()

# 生产环境(WMS_ENV=prod)下会话 Cookie 走 Secure,需 HTTPS.
_COOKIE_SECURE = (os.getenv("WMS_ENV", "").lower() in ("prod", "production")
                  or os.getenv("WMS_COOKIE_SECURE") == "1")


def _sha(pwd):
    return hashlib.sha256(("wms:" + str(pwd or "")).encode()).hexdigest()


class LoginReq(BaseModel):
    username: str
    password: str = ""


@router.post("/auth/login")
def login(body: LoginReq, response: Response, db: Session = Depends(get_db)):
    username = body.username
    rl_key = "login:" + str(username or "")
    blocked, retry = ratelimit.is_blocked(rl_key)
    if blocked:
        return resp.fail(429, "尝试过于频繁，请 %d 秒后再试" % retry)
    row = db.execute(text("SELECT username,name,password_hash,enabled FROM sys_user"
                          " WHERE username=:u"), {"u": username}).mappings().first()
    if not row or int(row["enabled"] or 0) != 1:
        ratelimit.record_fail(rl_key)
        return resp.fail(401, "TOKEN_INVALID:账号不存在或已停用")
    if not row["password_hash"] or row["password_hash"] != _sha(body.password):
        ratelimit.record_fail(rl_key)
        return resp.fail(401, "TOKEN_INVALID:密码错误")
    ratelimit.clear(rl_key)
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
        secure=_COOKIE_SECURE,
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
    e = perms.effective(db, username)
    data = dict(row) if row else {"username": username}
    data["roles"] = e["roles"]
    data["funcs"] = sorted(e["funcs"])
    data["data_scope_list"] = sorted(e["data_scope"])
    data["is_admin"] = e["is_admin"]
    return resp.ok(data)


@router.get("/system/users")
def users(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) c FROM sys_user")).scalar() or 0
    rows = db.execute(text("SELECT username,name,phone,data_scope,enabled,status"
                           " FROM sys_user LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    # 附带每个账号已挂的多角色(用于前端多选回显)
    rrows = db.execute(text("SELECT username,role_id FROM sys_user_role")).all()
    by_user = {}
    for x in rrows:
        by_user.setdefault(x[0], []).append(x[1])
    out = []
    for r in rows:
        d = dict(r)
        d["roles"] = by_user.get(r["username"], [])
        out.append(d)
    return resp.ok(out, total=int(total))


@router.get("/system/roles")
def roles(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT role_id,name,cat_allow,func_allow,data_scope"
                           " FROM sys_role")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


class RolesBody(BaseModel):
    roles: list[str] = []


class NewUserReq(BaseModel):
    username: str
    name: str = ""
    password: str = ""
    phone: str = ""
    data_scope: str = ""
    roles: list[str] = []


@router.post("/system/users/{username}/roles")
def save_user_roles(username: str, body: RolesBody,
                    adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    """保存账号的多角色授权:整体替换 sys_user_role,校验角色存在,写审计。
    保存后立即生效(权限依赖按 sys_user_role 实时计算)。"""
    u = str(username or "").strip()
    hit = db.execute(text("SELECT 1 FROM sys_user WHERE username=:u"),
                     {"u": u}).first()
    if not hit:
        return resp.fail(404, "账号不存在")
    want = [str(r).strip() for r in (body.roles or []) if str(r).strip()]
    if want:
        params = {"r%d" % i: r for i, r in enumerate(sorted(set(want)))}
        inlist = ",".join(":%s" % k for k in params)
        found = db.execute(text("SELECT role_id FROM sys_role WHERE role_id IN ("
                                + inlist + ")"), params).all()
        valid = {x[0] for x in found}
        bad = [r for r in want if r not in valid]
        if bad:
            return resp.fail(400, "未知角色:%s" % ",".join(bad))
    db.rollback()
    with db.begin():
        db.execute(text("DELETE FROM sys_user_role WHERE username=:u"), {"u": u})
        for rid in sorted(set(want)):
            db.execute(text("INSERT INTO sys_user_role(username,role_id)"
                            " VALUES(:u,:r)"), {"u": u, "r": rid})
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result,o_val,n_val)"
                        " VALUES(:y,'用户授权',:d,'已完成','',:n)"),
                   {"y": adm.get("username") or "", "d": u,
                    "n": ",".join(sorted(set(want)))[:200]})
    e = perms.effective(db, u)
    return resp.ok({"username": u, "roles": e["roles"],
                    "funcs": sorted(e["funcs"]), "is_admin": e["is_admin"]})


@router.post("/system/users")
def create_user(body: NewUserReq, adm: dict = Depends(auth.need_admin),
                db: Session = Depends(get_db)):
    """新建账号(默认启用),可同时挂多角色。密码哈希口径同登录。"""
    u = str(body.username or "").strip()
    if not u or len(u) < 2:
        return resp.fail(400, "账号至少 2 位")
    if not body.password or len(body.password) < 6:
        return resp.fail(400, "初始密码至少 6 位")
    exists = db.execute(text("SELECT 1 FROM sys_user WHERE username=:u"),
                        {"u": u}).first()
    if exists:
        return resp.fail(409, "账号已存在")
    roles = [str(r).strip() for r in (body.roles or []) if str(r).strip()]
    if roles:
        params = {"r%d" % i: r for i, r in enumerate(sorted(set(roles)))}
        inlist = ",".join(":%s" % k for k in params)
        found = {x[0] for x in db.execute(text("SELECT role_id FROM sys_role"
                                                " WHERE role_id IN (" + inlist + ")"),
                                          params).all()}
        bad = [r for r in roles if r not in found]
        if bad:
            return resp.fail(400, "未知角色:%s" % ",".join(bad))
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO sys_user(username,name,password_hash,phone,"
                        "data_scope,enabled,status) VALUES(:u,:n,:p,:ph,:ds,1,'启用')"),
                   {"u": u, "n": body.name or u, "p": _sha(body.password),
                    "ph": body.phone or None, "ds": body.data_scope or None})
        for rid in sorted(set(roles)):
            db.execute(text("INSERT INTO sys_user_role(username,role_id)"
                            " VALUES(:u,:r)"), {"u": u, "r": rid})
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result,o_val,n_val)"
                        " VALUES(:y,'新建账号',:d,'已完成','',:n)"),
                   {"y": adm.get("username") or "", "d": u,
                    "n": ",".join(sorted(set(roles)))[:200]})
    return resp.ok({"username": u, "roles": sorted(set(roles))})


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

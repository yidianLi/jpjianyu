"""多角色权限合并:一个用户可挂多个角色(sys_user_role 多行),其权限取并集.

- funcs:各角色 func_allow 并集('*' 代表全部动作,且视为管理员)
- data_scope:各角色 data_scope 并集('*' 代表全部范围)
- is_admin:任一角色为 R-ADMIN,或 func_allow 含 '*'
供鉴权依赖(auth.need_admin / require_func)与 /auth/me 复用,单一权威口径。
"""
from sqlalchemy import text


def roles_of(db, username):
    rows = db.execute(text("SELECT role_id FROM sys_user_role WHERE username=:u"),
                      {"u": username or ""}).all()
    return [r[0] for r in rows]


def effective(db, username):
    """返回 {roles:[role_id...], funcs:set, data_scope:set, is_admin:bool}."""
    rids = roles_of(db, username)
    res = {"roles": rids, "funcs": set(), "data_scope": set(), "is_admin": False}
    if not rids:
        return res
    params = {"r%d" % i: rid for i, rid in enumerate(rids)}
    inlist = ",".join(":%s" % k for k in params)
    rows = db.execute(text("SELECT role_id,func_allow,data_scope FROM sys_role"
                           " WHERE role_id IN (" + inlist + ")"),
                      params).mappings().all()
    for r in rows:
        for f in str(r["func_allow"] or "").split(","):
            f = f.strip()
            if f:
                res["funcs"].add(f)
        for s in str(r["data_scope"] or "").split(","):
            s = s.strip()
            if not s:
                continue
            if s == "*":
                res["data_scope"] = {"*"}
            elif res["data_scope"] != {"*"}:
                res["data_scope"].add(s)
        # 系统管理员仅由 R-ADMIN 角色认定(func '*' 只代表"全部动作"而非系统管理权)
        if r["role_id"] == "R-ADMIN":
            res["is_admin"] = True
    return res


def has_func(db, username, action):
    e = effective(db, username)
    return bool(e["is_admin"] or "*" in e["funcs"] or action in e["funcs"])

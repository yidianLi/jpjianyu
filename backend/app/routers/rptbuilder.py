"""自定义报表构建器路由:元数据/列表/新建/修改/删除/即时运行/生成实例.
受控聚合引擎见 app.core.customrpt(白名单+参数化,无注入面)."""
import json
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting, customrpt
from app.core.db import get_db

router = APIRouter()
_SEL = ("SELECT rpt_code,name,dataset,defn,enabled,created_by,updated_at"
        " FROM rpt_custom")


def _row(r):
    d = dict(r)
    try:
        d["defn"] = json.loads(d.pop("defn") or "{}")
    except (ValueError, TypeError):
        d["defn"] = {}
    return d


@router.get("/custom_reports/meta")
def meta(authed: dict = Depends(auth.need_auth)):
    return resp.ok(customrpt.meta())


@router.get("/custom_reports")
def list_reports(authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    rows = db.execute(text(_SEL + " ORDER BY updated_at DESC")).mappings().all()
    return resp.ok([_row(r) for r in rows], total=len(rows))


@router.post("/custom_reports/run")
def run_inline(body: dict, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    """构建器即时预览:传定义直接跑,不落库。"""
    try:
        return resp.ok(customrpt.run(db, body.get("defn") or body))
    except ValueError as err:
        return resp.fail(400, str(err))


@router.get("/custom_reports/{code}/run")
def run_saved(code: str, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    r = db.execute(text("SELECT defn FROM rpt_custom WHERE rpt_code=:c"),
                   {"c": code}).mappings().first()
    if not r:
        return resp.fail(404, "自定义报表不存在")
    try:
        return resp.ok(customrpt.run(db, json.loads(r["defn"] or "{}")))
    except ValueError as err:
        return resp.fail(400, str(err))


@router.post("/custom_reports")
def create(body: dict, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    name = str(body.get("name") or "").strip()
    if not name:
        return resp.fail(400, "报表名称必填")
    try:
        defn = customrpt.normalize(body.get("defn") or body)
    except ValueError as err:
        return resp.fail(400, str(err))
    db.rollback()
    with db.begin():
        code = posting.make_doc_no(db, "RC")
        db.execute(text("INSERT INTO rpt_custom(rpt_code,name,dataset,defn,"
                        "enabled,created_by) VALUES(:c,:n,:ds,:df,:e,:u)"),
                   {"c": code, "n": name, "ds": defn["dataset"],
                    "df": json.dumps(defn, ensure_ascii=False),
                    "e": 1 if body.get("enabled", True) else 0,
                    "u": authed.get("username") or ""})
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result)"
                        " VALUES(:u,'新建自定义报表',:d,'已完成')"),
                   {"u": authed.get("username") or "", "d": code})
    return resp.ok({"rpt_code": code})


@router.put("/custom_reports/{code}")
def update(code: str, body: dict, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    cur = db.execute(text("SELECT rpt_code FROM rpt_custom WHERE rpt_code=:c"),
                     {"c": code}).mappings().first()
    if not cur:
        return resp.fail(404, "自定义报表不存在")
    name = str(body.get("name") or "").strip()
    if not name:
        return resp.fail(400, "报表名称必填")
    try:
        defn = customrpt.normalize(body.get("defn") or body)
    except ValueError as err:
        return resp.fail(400, str(err))
    db.rollback()
    with db.begin():
        db.execute(text("UPDATE rpt_custom SET name=:n,dataset=:ds,defn=:df,"
                        "enabled=:e,updated_at=NOW() WHERE rpt_code=:c"),
                   {"n": name, "ds": defn["dataset"],
                    "df": json.dumps(defn, ensure_ascii=False),
                    "e": 1 if body.get("enabled", True) else 0, "c": code})
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result)"
                        " VALUES(:u,'修改自定义报表',:d,'已完成')"),
                   {"u": authed.get("username") or "", "d": code})
    return resp.ok({"rpt_code": code, "updated": True})


@router.delete("/custom_reports/{code}")
def remove(code: str, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    db.rollback()
    with db.begin():
        hit = db.execute(text("DELETE FROM rpt_custom WHERE rpt_code=:c"),
                         {"c": code})
        if hit.rowcount:
            db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result)"
                            " VALUES(:u,'删除自定义报表',:d,'已完成')"),
                       {"u": authed.get("username") or "", "d": code})
    if not hit.rowcount:
        return resp.fail(404, "自定义报表不存在")
    return resp.ok({"rpt_code": code, "deleted": True})


@router.post("/custom_reports/{code}/generate")
def generate(code: str, body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    """运行并落一张报表实例(草稿),供存档/发布。"""
    r = db.execute(text("SELECT name,defn FROM rpt_custom WHERE rpt_code=:c"),
                   {"c": code}).mappings().first()
    if not r:
        return resp.fail(404, "自定义报表不存在")
    try:
        data = customrpt.run(db, json.loads(r["defn"] or "{}"))
    except ValueError as err:
        return resp.fail(400, str(err))
    db.rollback()
    with db.begin():
        rpt_no = posting.make_doc_no(db, "RPT")
        db.execute(text("INSERT INTO rpt_instance(rpt_no,rpt_code,period,"
                        "biz_status,content_ref,generated_by)"
                        " VALUES(:n,:c,:p,'草稿',:r,:y)"),
                   {"n": rpt_no, "c": code,
                    "p": str((body or {}).get("period") or ""),
                    "r": json.dumps(data["rows"], ensure_ascii=False)[:8000],
                    "y": authed.get("username") or ""})
    return resp.ok({"rpt_no": rpt_no, "biz_status": "草稿",
                    "name": r["name"], "rows": data["count"],
                    "preview": data["rows"][:10]})

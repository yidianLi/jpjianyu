"""报表与审计只读口:生成草稿/发布/扫码日志/审计日志/流程实例.报表只读不改账."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()


@router.get("/rpt_configs")
def rpt_configs(authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT rpt_code,category,period_type,scope_cfg,auto_cron"
                           " FROM rpt_config")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.post("/rpt_instances/generate")
def generate(body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    rpt_code = str(body.get("rpt_code") or "")
    if not rpt_code:
        return resp.fail(400, "报表编码必填")
    with db.begin():
        db.execute(text("INSERT INTO rpt_instance(rpt_no,rpt_code,period,biz_status)"
                        " VALUES(:n,:c,:p,'草稿')"),
                   {"n": "RPT1", "c": rpt_code, "p": str(body.get("period") or "")})
    return resp.ok({"rpt_no": "RPT1", "biz_status": "草稿"})


@router.post("/rpt_instances/{no}/publish")
def publish(no: str, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    with db.begin():
        hit = db.execute(text("UPDATE rpt_instance SET biz_status='发布'"
                              " WHERE rpt_no=:n AND biz_status='草稿'"), {"n": no})
    if not hit.rowcount:
        return resp.fail(403, "FLOW_STATE_DENIED:仅草稿可发布")
    return resp.ok({"rpt_no": no, "biz_status": "发布"})


@router.get("/system/scan_logs")
def scan_logs(code: str = "", authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1, page_size: int = 50):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if code:
        cond = "code=:c"
        args["c"] = code
    total = db.execute(text("SELECT COUNT(*) c FROM scan_log WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT id,code,result,doc_no,by_user,device,`at`"
                           " FROM scan_log WHERE " + cond +
                           " ORDER BY id DESC LIMIT :o,:n"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/system/audit_logs")
def audit_logs(doc_no: str = "", authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), page: int = 1, page_size: int = 50):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if doc_no:
        cond = "doc_no=:d"
        args["d"] = doc_no
    total = db.execute(text("SELECT COUNT(*) c FROM audit_log WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT id,`at`,by_user,action,doc_no,biz_type,result,"
                           "o_val,n_val,device FROM audit_log WHERE " + cond +
                           " ORDER BY id DESC LIMIT :o,:n"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/flow_instances")
def flow_instances(doc_no: str = "", authed: dict = Depends(auth.need_auth),
                   db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if doc_no:
        cond = "doc_no=:d"
        args["d"] = doc_no
    total = db.execute(text("SELECT COUNT(*) c FROM flow_instance WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT doc_no,flow_key,cur_step,flow_status,approver"
                           " FROM flow_instance WHERE " + cond + " LIMIT :o,:n"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))

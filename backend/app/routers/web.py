"""PC端 web 路由:单据/库存/主档/驾驶舱.单文件<=300行,按域拆函数."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, idem, queries, posting, dash
from app.core.db import get_db

router = APIRouter()

DOC_TYPES = set(posting.TYPE_SID.keys())


class DocLineReq(BaseModel):
    material_code: str = ""
    product_code: str = ""
    bom_version: Optional[str] = None
    qty: Any = None
    unit: str = ""
    loc: Optional[str] = None


class CreateDocReq(BaseModel):
    type: str
    handler: Optional[str] = None
    lines: List[DocLineReq] = Field(default_factory=list)


class ApproveReq(BaseModel):
    action: str
    opinion: Optional[str] = None


@router.get("/stock/onhand")
def onhand(authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db), page: int = 1,
           page_size: int = 20, wh: str = "", material_code: str = "",
           product_code: str = ""):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_onhand(db, wh, material_code,
                                       product_code, page, size)
    return resp.ok(rows, total=total)


@router.get("/stock/ledger")
def ledger(authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db), doc_no: str = "",
           code: str = "", page: int = 1, page_size: int = 50):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_ledger(db, doc_no, code, page, size)
    return resp.ok(rows, total=total)


@router.get("/stock/batches")
def batches(material_code: str = "", authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    page, size = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if material_code:
        cond = "material_code=:m"
        args["m"] = material_code
    total = db.execute(text("SELECT COUNT(*) c FROM batch WHERE " + cond),
                       args).scalar() or 0
    args.update({"o": (page - 1) * size, "n": size})
    rows = db.execute(text("SELECT batch_no,material_code,partner_id,source_doc_no,"
                           "created_at,created_by FROM batch WHERE " + cond +
                           " ORDER BY created_at DESC LIMIT :o,:n"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/stock/items")
def items(batch_no: str = "", status: str = "",
          authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    page, size = resp.page_args(page, page_size)
    cond, args = ["1=1"], {}
    if batch_no:
        cond.append("batch_no=:b")
        args["b"] = batch_no
    if status:
        cond.append("status=:s")
        args["s"] = status
    where = " AND ".join(cond)
    total = db.execute(text("SELECT COUNT(*) c FROM material_item WHERE " + where),
                       args).scalar() or 0
    args.update({"o": (page - 1) * size, "n": size})
    rows = db.execute(text("SELECT barcode,material_code,batch_no,source_doc_no,"
                           "status FROM material_item WHERE " + where +
                           " LIMIT :o,:n"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/stock/trace")
def trace(code: str, authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    rows, total = queries.fetch_ledger(db, "", code, 1, 20)
    timeline = [{"at": str(r.get("at")), "doc": r.get("doc_no"),
                 "biz": r.get("biz"), "qty": r.get("qty"),
                 "unit": r.get("unit"), "by": r.get("by_user")}
                for r in rows]
    last = timeline[0] if timeline else {}
    return resp.ok({"code": code, "timeline": timeline,
                    "suspect": {"last": last, "around": timeline[1:4]},
                    "missing": []}, total=total)


@router.get("/docs")
def list_docs(dtype: str = "", biz_status: str = "",
              authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1,
              page_size: int = 20):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_docs(db, dtype, biz_status, page, size)
    return resp.ok(rows, total=total)


@router.get("/docs/{doc_no}")
def doc_detail(doc_no: str, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    head, lines = queries.fetch_doc_detail(db, doc_no)
    if not head:
        return resp.fail(404, "DOC_NOT_FOUND:单据不存在")
    head["lines"] = lines
    return resp.ok(head)


@router.post("/docs")
def create_doc(body: CreateDocReq, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db),
               key: str = Depends(idem.idem_key)):
    cached = idem.replay(key)
    if cached:
        return resp.ok(cached["data"])
    dtype = body.type
    if dtype not in DOC_TYPES:
        return resp.fail(400, "单据类型非白名单")
    lines = [ln.model_dump() for ln in body.lines]
    if not lines:
        return resp.fail(400, "单据行不能为空")
    for line in lines:
        if not str(line.get("unit") or ""):
            return resp.fail(400, "INVALID_QTY:数量必带单位")
        if not line.get("material_code") and not line.get("product_code"):
            return resp.fail(400, "物料行/成品行二选一必填")
    hit = idem.peek(key)
    if hit is not None:
        return resp.ok(hit)
    with db.begin():
        doc_no = posting.create(db, dtype, body.handler or "",
                                lines)
    out = idem.replay_or_put(key, lambda: {"doc_no": doc_no,
                                           "biz_status": "DRAFT"})
    return resp.ok(out["data"])


@router.post("/docs/{doc_no}/submit")
def submit(doc_no: str, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    with db.begin():
        state = posting.submit(db, doc_no)
    if not state:
        return resp.fail(403, "FLOW_STATE_DENIED:仅草稿可提交")
    return resp.ok({"doc_no": doc_no, "biz_status": state})


@router.post("/docs/{doc_no}/post")
def post(doc_no: str, authed: dict = Depends(auth.need_auth),
         db: Session = Depends(get_db),
         key: str = Depends(idem.idem_key)):
    head, _ = queries.fetch_doc_detail(db, doc_no)
    if not head:
        return resp.fail(404, "DOC_NOT_FOUND:单据不存在")
    hit = idem.peek(key)
    if hit is not None:
        return resp.ok(hit)
    # 事务统一交给 with db.begin():异常自动回滚,正常自动提交,避免连接池污染
    # 前置SELECT(查单头+幂等窥视)已开事务,先rollback再begin
    try:
        db.rollback()
        with db.begin():
            state = posting.post(db, doc_no, str(head.get("type") or ""),
                                 authed["username"], authed.get("device", ""))
    except ValueError as err:
        return resp.fail(403, str(err))
    except Exception as err:
        # 并发撞唯一索引(uk_idem_key):对方已落账,本方回滚后按已过账返回,不500
        if "uk_idem_key" in str(err) or "Duplicate entry" in str(err):
            db.rollback()
            return resp.ok({"doc_no": doc_no, "biz_status": "POSTED",
                            "replay": True})
        raise
    if state == "404":
        return resp.fail(404, "DOC_NOT_FOUND:单据不存在")
    if state == "LOCKED":
        return resp.fail(403, "FLOW_STATE_DENIED:仅审批中单据可过账")
    out = idem.replay_or_put(key, lambda: {"doc_no": doc_no,
                                           "biz_status": state})
    return resp.ok(out["data"])


@router.post("/docs/{doc_no}/approve")
def approve(doc_no: str, body: ApproveReq,
            authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    if body.action not in ("通过", "退回"):
        return resp.fail(400, "审批动作非法")
    if body.action == "退回" and not body.opinion:
        return resp.fail(400, "退回必须填意见")
    with db.begin():
        db.execute(text("UPDATE flow_instance SET cur_step='S2',"
                        "flow_status=:s,approver=:u WHERE doc_no=:d"),
                   {"s": "通过" if body.action == "通过" else "退回",
                    "u": authed["username"], "d": doc_no})
    return resp.ok({"doc_no": doc_no, "action": body.action})


@router.get("/dashboard")
def dashboard(authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    return resp.ok({"kpi": dash.kpi(db), "alerts": dash.alerts(db),
                    "formula": dash.formula()})

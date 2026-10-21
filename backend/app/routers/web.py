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
    batch_no: Optional[str] = None
    qty: Any = None
    unit: str = ""
    loc: Optional[str] = None
    qc_result: Optional[str] = None


class CreateDocReq(BaseModel):
    type: str
    handler: Optional[str] = None
    ref_doc: Optional[str] = None
    partner_id: Optional[str] = None
    src_order_no: Optional[str] = None
    arrived_at: Optional[str] = None
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
                           "created_at,created_by,expire_date FROM batch WHERE " + cond +
                           " ORDER BY created_at DESC LIMIT :n OFFSET :o"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/stock/expiry")
def expiry(days: int = 30, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    """临期预警:效期在 N 天内的批次(含已过期),按效期排序.只读."""
    days = max(1, min(365, int(days or 30)))
    import datetime as _dt
    cutoff = (_dt.date.today() + _dt.timedelta(days=days)).isoformat()
    rows = db.execute(text("SELECT b.batch_no,b.material_code,b.expire_date,"
                           "COALESCE(SUM(o.on_hand),0) AS on_hand"
                           " FROM batch b LEFT JOIN stock_onhand o"
                           " ON o.batch_no=b.batch_no"
                           " AND o.material_code=b.material_code"
                           " WHERE b.expire_date IS NOT NULL"
                           " AND b.expire_date<=:c"
                           " GROUP BY b.batch_no,b.material_code,b.expire_date"
                           " ORDER BY b.expire_date"),
                      {"c": cutoff}).mappings().all()
    out = [dict(r) for r in rows]
    return resp.ok(out, total=len(out))


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
                           " LIMIT :n OFFSET :o"), args).mappings().all()
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
    item = db.execute(text("SELECT barcode,material_code,batch_no,"
                           "source_doc_no,status FROM material_item"
                           " WHERE barcode=:c OR batch_no=:c LIMIT 20"),
                      {"c": code}).mappings().all()
    items = [dict(r) for r in item]
    for r in items:
        if r.get("barcode") == code:
            last = dict(r)
            break
    return resp.ok({"code": code, "timeline": timeline,
                    "items": items,
                    "suspect": {"last": last, "around": timeline[1:4]},
                    "missing": []}, total=total)


@router.get("/docs")
def list_docs(dtype: str = "", biz_status: str = "",
              authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1,
              page_size: int = 20, with_lines: int = 0):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_docs(db, dtype, biz_status, page, size,
                                     bool(with_lines))
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
    if dtype == "LY":
        if not body.ref_doc:
            return resp.fail(400, "REF_REQUIRED:领用必须关联申请单")
        sq = db.execute(text("SELECT type FROM doc_main WHERE doc_no=:d"),
                        {"d": body.ref_doc}).mappings().first()
        if not sq:
            return resp.fail(400, "REF_NOT_FOUND:关联申请单不存在")
        if sq["type"] != "SQ":
            return resp.fail(400, "REF_TYPE_DENIED:领用只能关联申请单SQ")
    db.rollback()
    with db.begin():
        doc_no = posting.create(db, dtype, body.handler or "",
                                lines, {"partner_id": body.partner_id,
                                        "src_order_no": body.src_order_no,
                                        "arrived_at": body.arrived_at})
        if dtype == "LY":
            db.execute(text("INSERT INTO stock_doc_ref(from_doc,to_doc,rel)"
                            " VALUES(:f,:t,'领用-申请')"),
                       {"f": doc_no, "t": body.ref_doc})
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
def post(doc_no: str, authed: dict = Depends(auth.require_func("过账")),
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
        return resp.fail(403, "FLOW_STATE_DENIED:仅已审批(APPROVED)单据可过账,"
                              "未审批/已退回不可动账")
    out = idem.replay_or_put(key, lambda: {"doc_no": doc_no,
                                           "biz_status": state})
    return resp.ok(out["data"])


@router.post("/docs/{doc_no}/approve")
def approve(doc_no: str, body: ApproveReq,
            authed: dict = Depends(auth.require_func("审批")),
            db: Session = Depends(get_db)):
    if body.action not in ("通过", "退回", "approve", "reject"):
        return resp.fail(400, "审批动作非法")
    passed = body.action in ("通过", "approve")
    if not passed and not body.opinion:
        return resp.fail(400, "退回必须填意见")
    db.rollback()
    with db.begin():
        state = posting.approve(db, doc_no, passed, authed["username"],
                                body.opinion or "")
    if state == "404":
        return resp.fail(404, "DOC_NOT_FOUND:单据不存在")
    if state == "LOCKED":
        return resp.fail(403, "FLOW_STATE_DENIED:仅审批中单据可审批")
    return resp.ok({"doc_no": doc_no, "action": body.action,
                    "flow_status": state})


@router.get("/dashboard")
def dashboard(authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    return resp.ok({"kpi": dash.kpi(db), "alerts": dash.alerts(db),
                    "formula": dash.formula()})

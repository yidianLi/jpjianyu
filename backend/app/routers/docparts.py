"""单据配套:附件/关联/标签打印/加工费对账.均对真表,只增不改账."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()


@router.get("/docs/{doc_no}/attachments")
def attachments(doc_no: str, authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id,kind,ref,by_user,`at` FROM doc_attachment"
                           " WHERE doc_no=:d ORDER BY id DESC"),
                      {"d": doc_no}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/stock/doc_refs")
def doc_refs(from_doc: str = "", to_doc: str = "",
             authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    cond, args = "1=1", {}
    if from_doc:
        cond += " AND from_doc=:f"
        args["f"] = from_doc
    if to_doc:
        cond += " AND to_doc=:t"
        args["t"] = to_doc
    rows = db.execute(text("SELECT from_doc,to_doc,rel FROM stock_doc_ref"
                           " WHERE " + cond), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.post("/label_prints")
def label_print(body: dict, authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    if not body.get("code") or not body.get("kind"):
        return resp.fail(400, "条码值与标签类型必填")
    with db.begin():
        db.execute(text("INSERT INTO label_print(code,kind,content,printed_by)"
                        " VALUES(:c,:k,:n,:p)"),
                   {"c": body["code"], "k": body["kind"],
                    "n": str(body.get("content") or ""),
                    "p": str(body.get("printed_by") or "")})
    return resp.ok({"code": body["code"], "printed": True})


@router.get("/fee_settles")
def fee_settles(customer: str = "", period: str = "",
                authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    cond, args = "1=1", {}
    if customer:
        cond += " AND customer=:c"
        args["c"] = customer
    if period:
        cond += " AND period=:p"
        args["p"] = period
    total = db.execute(text("SELECT COUNT(*) c FROM fee_settle WHERE " + cond),
                       args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT settle_no,customer,period,qty_send,qty_issue,"
                           "qty_fin,amount,biz_status FROM fee_settle WHERE " + cond +
                           " LIMIT :o,:n"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.post("/fee_settles/{settle_no}/confirm")
def fee_confirm(settle_no: str, body: dict,
               authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    if not body.get("confirmed"):
        return resp.fail(400, "请勾选确认无误")
    with db.begin():
        hit = db.execute(text("UPDATE fee_settle SET biz_status='确认'"
                              " WHERE settle_no=:s AND biz_status<>'确认'"),
                         {"s": settle_no})
        if not hit.rowcount:
            row = db.execute(text("SELECT biz_status FROM fee_settle"
                                  " WHERE settle_no=:s"),
                             {"s": settle_no}).first()
            if not row:
                return resp.fail(404, "对账单不存在")
            return resp.ok({"settle_no": settle_no, "biz_status": "确认",
                            "replay": True})
    db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,biz_type,result)"
                    " VALUES(:y,'对账确认',:d,'加工费','已完成')"),
               {"y": "web-user", "d": settle_no})
    db.commit()
    return resp.ok({"settle_no": settle_no, "biz_status": "确认"})

"""单据配套:附件/关联/标签打印/加工费对账.均对真表,只增不改账."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting
from app.core.db import get_db

router = APIRouter()


@router.get("/docs/{doc_no}/attachments")
def attachments(doc_no: str, authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id,kind,ref,by_user,at FROM doc_attachment"
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
                           "qty_fin,amount,biz_status,confirm_note,confirmed_by,"
                           "confirmed_at,updated_at FROM fee_settle WHERE " + cond +
                           " ORDER BY updated_at DESC LIMIT :n OFFSET :o"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/fee_settles/{settle_no}")
def fee_settle_detail(settle_no: str, authed: dict = Depends(auth.need_auth),
                      db: Session = Depends(get_db)):
    head = db.execute(text("SELECT settle_no,customer,period,qty_send,qty_issue,"
                           "qty_fin,amount,biz_status,confirm_note,confirmed_by,"
                           "confirmed_at,updated_at FROM fee_settle"
                           " WHERE settle_no=:n"),
                      {"n": settle_no}).mappings().first()
    if not head:
        return resp.fail(404, "对账单不存在")
    lines = db.execute(text("SELECT line_no,material_code,qty_send,qty_issue,"
                            "qty_fin,qty_confirm,unit FROM fee_settle_line"
                            " WHERE settle_no=:n ORDER BY line_no"),
                       {"n": settle_no}).mappings().all()
    out = dict(head)
    out["lines"] = [dict(r) for r in lines]
    return resp.ok(out)


@router.post("/fee_settles")
def fee_settle_create(body: dict, authed: dict = Depends(auth.need_auth),
                      db: Session = Depends(get_db)):
    if not body.get("customer") or not body.get("period"):
        return resp.fail(400, "客户与账期必填")
    lines = body.get("lines") or []
    if not lines:
        return resp.fail(400, "对账明细不能为空")
    for ln in lines:
        if not ln.get("material_code") or not str(ln.get("unit") or ""):
            return resp.fail(400, "明细须含物料与单位")
    qs = sum(float(ln.get("qty_send") or 0) for ln in lines)
    qi = sum(float(ln.get("qty_issue") or 0) for ln in lines)
    qf = sum(float(ln.get("qty_fin") or 0) for ln in lines)
    amt = float(body.get("amount") or 0)
    db.rollback()
    with db.begin():
        settle_no = posting.make_doc_no(db, "DZ")
        db.execute(text("INSERT INTO fee_settle(settle_no,customer,period,"
                        "qty_send,qty_issue,qty_fin,amount,biz_status)"
                        " VALUES(:n,:c,:p,:s,:i,:f,:a,'草稿')"),
                   {"n": settle_no, "c": body["customer"], "p": body["period"],
                    "s": qs, "i": qi, "f": qf, "a": amt})
        for i, ln in enumerate(lines, 1):
            db.execute(text("INSERT INTO fee_settle_line(settle_no,line_no,"
                            "material_code,qty_send,qty_issue,qty_fin,"
                            "qty_confirm,unit) VALUES(:n,:l,:m,:s,:i,:f,:cf,:u)"),
                       {"n": settle_no, "l": i, "m": ln["material_code"],
                        "s": ln.get("qty_send") or 0,
                        "i": ln.get("qty_issue") or 0,
                        "f": ln.get("qty_fin") or 0,
                        "cf": ln.get("qty_confirm") or 0, "u": ln["unit"]})
    return resp.ok({"settle_no": settle_no, "biz_status": "草稿",
                    "qty_send": qs, "qty_issue": qi, "qty_fin": qf,
                    "amount": amt})


@router.post("/fee_settles/{settle_no}/confirm")
def fee_confirm(settle_no: str, body: dict,
               authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    if not body.get("confirmed"):
        return resp.fail(400, "请勾选确认无误")
    note = str(body.get("note") or "").strip()
    with db.begin():
        hit = db.execute(text("UPDATE fee_settle SET biz_status='确认',"
                              "confirm_note=:t,confirmed_by=:u,"
                              "confirmed_at=NOW(),updated_at=NOW()"
                              " WHERE settle_no=:s AND biz_status<>'确认'"),
                         {"t": note, "u": authed.get("username") or "",
                          "s": settle_no})
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
               {"y": authed.get("username") or "web-user", "d": settle_no})
    db.commit()
    return resp.ok({"settle_no": settle_no, "biz_status": "确认"})

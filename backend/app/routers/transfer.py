"""调仓DB与盘点PD工单:二段在途/复核调账.盘点本身不动账,差异走TK/RK."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting
from app.core.db import get_db

router = APIRouter()


@router.post("/transfer_ships")
def create_ship(body: dict, authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    if not body.get("from_wh") or not body.get("to_wh"):
        return resp.fail(400, "来源仓与目的仓必填")
    if not body.get("lines"):
        return resp.fail(400, "调仓行不能为空")
    with db.begin():
        doc_no = posting.make_doc_no(db, "DB")
        db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler)"
                        " VALUES(:d,'DB',19000,'DRAFT',:h)"),
                   {"d": doc_no, "h": str(body.get("handler") or "")})
        first = body["lines"][0]
        db.execute(text("INSERT INTO transfer_ship(doc_no,from_wh,to_wh,from_loc,"
                        "to_loc,o_qty,qty_apply,unit,carrier,plate)"
                        " VALUES(:d,:f,:t,:fl,:tl,:o,:o,:u,:c,:p)"),
                   {"d": doc_no, "f": body["from_wh"], "t": body["to_wh"],
                    "fl": body.get("from_loc"), "tl": body.get("to_loc"),
                    "o": first.get("qty") or 0, "u": first.get("unit") or "",
                    "c": body.get("carrier"), "p": body.get("plate")})
    return resp.ok({"doc_no": doc_no, "biz_status": "DRAFT"})


@router.get("/transfer_ships")
def list_ships(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) c FROM transfer_ship")).scalar() or 0
    rows = db.execute(text("SELECT doc_no,from_wh,to_wh,from_loc,to_loc,o_qty,"
                           "qty_apply,qty_sent,n_qty,qty_recv,unit,carrier,plate,"
                           "diff_status FROM transfer_ship LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.patch("/transfer_ships/{doc_no}/receive")
def receive(doc_no: str, body: dict, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    if body.get("n_qty") is None:
        return resp.fail(400, "实收数量必填")
    with db.begin():
        hit = db.execute(text("UPDATE transfer_ship SET n_qty=:n,qty_recv=:n,"
                              "diff_status='待复核' WHERE doc_no=:d"),
                         {"n": body["n_qty"], "d": doc_no})
    if not hit.rowcount:
        return resp.fail(404, "DOC_NOT_FOUND:调仓单不存在")
    return resp.ok({"doc_no": doc_no, "diff_status": "待复核"})


@router.get("/pd_tasks")
def list_pd(authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db), page: int = 1,
            page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) c FROM pd_task")).scalar() or 0
    rows = db.execute(text("SELECT pd_no,mode,wh_code,scope,biz_status,handler"
                           " FROM pd_task ORDER BY pd_no DESC"
                           " LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.post("/pd_tasks")
def create_pd(body: dict, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    if not body.get("wh_code"):
        return resp.fail(400, "盘点仓库范围必填")
    with db.begin():
        pd_no = posting.make_doc_no(db, "PD")
        db.execute(text("INSERT INTO pd_task(pd_no,sid,mode,wh_code,scope,"
                        "biz_status,handler) VALUES(:p,13100,:m,:w,:s,'草稿',:h)"),
                   {"p": pd_no, "m": str(body.get("mode") or "人工临时"),
                    "w": body["wh_code"], "s": str(body.get("scope") or ""),
                    "h": str(body.get("handler") or "")})
        rows = db.execute(text("SELECT material_code,batch_no,on_hand,unit FROM stock_onhand"
                               " WHERE wh=:w LIMIT 200"), {"w": body["wh_code"]}).mappings().all()
        for i, r in enumerate(rows, 1):
            db.execute(text("INSERT INTO pd_line(pd_no,line_no,o_qty,material_code,"
                            "batch_no,book_qty,unit) VALUES(:p,:n,:o,:m,:b,:o,:u)"),
                       {"p": pd_no, "n": i, "o": r["on_hand"] or 0,
                        "m": r["material_code"], "b": r["batch_no"], "u": r["unit"]})
    return resp.ok({"pd_no": pd_no, "lines": len(rows)})


@router.get("/pd_tasks/{pd_no}/lines")
def pd_lines(pd_no: str, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT pd_no,line_no,o_qty,n_qty,diff_qty,material_code,"
                           "batch_no,book_qty,real_qty,unit,reason FROM pd_line"
                           " WHERE pd_no=:p ORDER BY line_no"), {"p": pd_no}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.post("/pd_tasks/{pd_no}/confirm")
def pd_confirm(pd_no: str, body: dict, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    with db.begin():
        db.execute(text("UPDATE pd_line SET n_qty=:n,real_qty=:n,"
                        "diff_qty=:n-o_qty WHERE pd_no=:p AND line_no=:l"),
                   {"n": body.get("n_qty") or 0, "p": pd_no,
                    "l": body.get("line_no") or 1})
        db.execute(text("UPDATE pd_task SET biz_status='复核' WHERE pd_no=:p"),
                   {"p": pd_no})
    return resp.ok({"pd_no": pd_no, "biz_status": "复核",
                    "tip": "盘点不动账,差异走TK/RK调整单"})

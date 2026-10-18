"""调仓DB与盘点PD工单:二段在途/复核调账.盘点本身不动账,差异走TK/RK."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting, dialect
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
        rows = db.execute(text("SELECT o.material_code,o.batch_no,o.on_hand,"
                               "COALESCE(m.base_unit,p.base_unit,'') unit"
                               " FROM stock_onhand o"
                               " LEFT JOIN mat_master m ON m.material_code=o.material_code"
                               " LEFT JOIN product_master p ON p.product_code=o.product_code"
                               " WHERE o.wh=:w OR o.loc LIKE :wl LIMIT 200"),
                          {"w": body["wh_code"],
                           "wl": body["wh_code"] + "%"}).mappings().all()
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


@router.post("/pd_tasks/{pd_no}/adjust")
def pd_adjust(pd_no: str, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    """盘点差异→TZ 库存调整单并直接过账:盘盈按差异 RK 增账,盘亏按差异减账.
    仅'复核/确认'态盘点可调账;对账后回写 pd_task 状态为'已调整'."""
    task = db.execute(text("SELECT wh_code,biz_status FROM pd_task"
                           " WHERE pd_no=:p"), {"p": pd_no}).mappings().first()
    if not task:
        return resp.fail(404, "盘点任务不存在")
    if task["biz_status"] not in ("复核", "确认", "已复核"):
        return resp.fail(403, "FLOW_STATE_DENIED:仅复核态盘点可生成调整单")
    lines = db.execute(text("SELECT line_no,material_code,batch_no,unit,"
                            "o_qty,n_qty,COALESCE(diff_qty,n_qty-o_qty) d"
                            " FROM pd_line WHERE pd_no=:p AND n_qty IS NOT NULL"
                            " AND COALESCE(diff_qty,n_qty-o_qty)<>0"),
                       {"p": pd_no}).mappings().all()
    if not lines:
        db.rollback()
        with db.begin():
            db.execute(text("UPDATE pd_task SET biz_status='已调整'"
                            " WHERE pd_no=:p"), {"p": pd_no})
        return resp.ok({"pd_no": pd_no, "adjust_doc": None, "lines": 0,
                        "tip": "无差异,盘点关闭"})
    # 差异为正=盘盈(增账),为负=盘亏(减账);直接动账写流水+现存.
    # 落账库位取该行现存记录的真实 loc(盘点范围按该仓),不再用仓码冒充库位.
    db.rollback()
    adjusted = []
    with db.begin():
        for ln in lines:
            diff = float(ln["d"] or 0)
            real = db.execute(text("SELECT loc FROM stock_onhand WHERE "
                                   "material_code=:m AND batch_no=:b AND "
                                   "(wh=:w OR loc LIKE :wl) LIMIT 1"),
                              {"m": ln["material_code"], "b": ln["batch_no"] or "",
                               "w": task["wh_code"],
                               "wl": task["wh_code"] + "%"}).mappings().first()
            loc = real["loc"] if real else task["wh_code"]
            doc_no = posting.make_doc_no(db, "TZ")
            db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,"
                            "handler) VALUES(:d,'TZ',19100,'POSTED',:h)"),
                       {"d": doc_no, "h": authed.get("username") or ""})
            db.execute(text("INSERT INTO doc_line(doc_no,line_no,material_code,"
                            "batch_no,qty,unit,loc,reason) VALUES"
                            "(:d,1,:m,:b,:q,:u,:l,:r)"),
                       {"d": doc_no, "m": ln["material_code"],
                        "b": ln["batch_no"], "q": abs(diff),
                        "u": ln["unit"], "l": loc,
                        "r": "盘点调整 %s %+g" % (pd_no, diff)})
            is_in = diff > 0
            key = "%s:1:TZ" % doc_no
            db.execute(text("INSERT INTO stock_ledger(doc_no,line_no,sid,"
                            "material_code,batch_no,qty,unit,dir,biz,by_user,"
                            "device,idem_key) VALUES(:d,1,19100,:m,:b,:q,:u,"
                            ":r,'TZ',:y,'',:k)"),
                       {"d": doc_no, "m": ln["material_code"],
                        "b": ln["batch_no"], "q": abs(diff), "u": ln["unit"],
                        "r": "1" if is_in else "-1",
                        "y": authed.get("username") or "", "k": key})
            signed = abs(diff) if is_in else -abs(diff)
            tail = (" ON DUPLICATE KEY UPDATE on_hand=on_hand+:s,avail=avail+:s"
                    if dialect.IS_MYSQL
                    else " ON CONFLICT (material_code,product_code,batch_no,wh,loc)"
                    " DO UPDATE SET on_hand=stock_onhand.on_hand+:s,"
                    "avail=stock_onhand.avail+:s")
            db.execute(text("INSERT INTO stock_onhand(material_code,product_code,"
                            "batch_no,wh,loc,on_hand,avail) VALUES(:m,'',:b,:w,"
                            ":l,:s,:s)" + tail),
                       {"m": ln["material_code"], "b": ln["batch_no"] or "",
                        "w": "", "l": loc, "s": signed})
            adjusted.append({"doc_no": doc_no, "material_code": ln["material_code"],
                             "diff": diff})
        db.execute(text("UPDATE pd_task SET biz_status='已调整' WHERE pd_no=:p"),
                   {"p": pd_no})
    return resp.ok({"pd_no": pd_no, "lines": len(adjusted),
                    "adjust": adjusted})

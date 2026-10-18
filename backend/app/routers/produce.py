"""成品WO与交付JJ:下单/按BOM领料/完工/签收.领料走LY记账,完工走RK-FIN."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting, dialect
from app.core.db import get_db

router = APIRouter()


@router.post("/wo_tasks")
def create_wo(body: dict, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    if not body.get("product_code") or not body.get("qty_plan"):
        return resp.fail(400, "成品编码与计划数量必填")
    ver = str(body.get("bom_version") or "")
    if not ver:
        row = db.execute(text("SELECT version FROM bom_master"
                              " WHERE product_code=:p AND status='启用'"
                              " LIMIT 1"),
                         {"p": body["product_code"]}).first()
        if row:
            ver = str(row[0])
    if not ver:
        return resp.fail(400, "BOM_VERSION_REQUIRED:须指定启用版本")
    db.rollback()
    with db.begin():
        wo_no = posting.make_doc_no(db, "WO")
        db.execute(text("INSERT INTO wo_task(wo_no,product_code,bom_version,"
                        "qty_plan,workshop,biz_status)"
                        " VALUES(:w,:p,:b,:q,:s,'下达')"),
                   {"w": wo_no, "p": body["product_code"],
                    "b": ver, "q": body["qty_plan"],
                    "s": body.get("workshop")})
    return resp.ok({"wo_no": wo_no, "biz_status": "下达",
                    "bom_version": ver})


@router.get("/sale_orders")
def sale_orders(authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db), page: int = 1,
                page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) FROM sale_order")).scalar() or 0
    rows = db.execute(text("SELECT order_no,customer,product_code,qty_order,"
                           "due_date,biz_status FROM sale_order"
                           " ORDER BY order_no DESC LIMIT :n OFFSET :o"),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.post("/sale_orders")
def sale_order_create(body: dict, authed: dict = Depends(auth.need_auth),
                      db: Session = Depends(get_db)):
    if not body.get("customer") or not body.get("product_code") \
            or not body.get("qty_order"):
        return resp.fail(400, "客户/成品/订货数必填")
    with db.begin():
        order_no = posting.make_doc_no(db, "SO")
        db.execute(text("INSERT INTO sale_order(order_no,customer,product_code,"
                        "qty_order,due_date,biz_status)"
                        " VALUES(:o,:c,:p,:q,:d,'已下达')"),
                   {"o": order_no, "c": body["customer"],
                    "p": body["product_code"], "q": body["qty_order"],
                    "d": body.get("due_date")})
    return resp.ok({"order_no": order_no, "biz_status": "已下达"})


@router.get("/prod_plans")
def prod_plans(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), page: int = 1,
               page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    total = db.execute(text("SELECT COUNT(*) FROM prod_plan")).scalar() or 0
    rows = db.execute(text("SELECT plan_no,order_no,product_code,bom_version,"
                           "qty_plan,workshop,start_date,due_date,biz_status"
                           " FROM prod_plan"
                           " ORDER BY plan_no DESC" + dialect.limit_offset()),
                      {"o": (p - 1) * s, "n": s}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.post("/prod_plans")
def prod_plan_create(body: dict, authed: dict = Depends(auth.need_auth),
                     db: Session = Depends(get_db)):
    if not body.get("product_code") or not body.get("qty_plan"):
        return resp.fail(400, "成品/计划产量必填")
    if body.get("order_no"):
        hit = db.execute(text("SELECT 1 FROM sale_order WHERE order_no=:o"),
                         {"o": body["order_no"]}).first()
        if not hit:
            return resp.fail(404, "来源订单不存在")
    ver = str(body.get("bom_version") or "")
    if not ver:
        row = db.execute(text("SELECT version FROM bom_master"
                              " WHERE product_code=:p AND status='启用'"
                              " LIMIT 1"),
                         {"p": body["product_code"]}).first()
        if row:
            ver = str(row[0])
    if not ver:
        return resp.fail(400, "该成品无启用版BOM")
    db.rollback()
    with db.begin():
        plan_no = posting.make_doc_no(db, "PP")
        db.execute(text("INSERT INTO prod_plan(plan_no,order_no,product_code,"
                        "bom_version,qty_plan,workshop,start_date,due_date,"
                        "biz_status) VALUES(:n,:o,:p,:b,:q,:w,:s,:d,'已下达')"),
                   {"n": plan_no, "o": body.get("order_no"),
                    "p": body["product_code"], "b": ver,
                    "q": body["qty_plan"], "w": body.get("workshop"),
                    "s": body.get("start_date"), "d": body.get("due_date")})
    return resp.ok({"plan_no": plan_no, "biz_status": "已下达",
                    "bom_version": ver})


@router.get("/prod_plans/{plan_no}/demand")
def prod_plan_demand(plan_no: str, authed: dict = Depends(auth.need_auth),
                     db: Session = Depends(get_db)):
    """计划需求展开:计划量×BOM单耗×(1+损耗),并扣减adineg可用."""
    plan = db.execute(text("SELECT p.product_code,p.bom_version,p.qty_plan,"
                            "o.customer FROM prod_plan p LEFT JOIN sale_order o"
                            " ON o.order_no=p.order_no"
                            " WHERE p.plan_no=:n"),
                      {"n": plan_no}).mappings().first()
    if not plan:
        return resp.fail(404, "生产计划不存在")
    cust = plan["customer"] or ""
    lines = db.execute(text("SELECT material_code,qty,unit,loss_rate"
                            " FROM bom_line WHERE product_code=:p"
                            " AND version=:v ORDER BY line_no"),
                       {"p": plan["product_code"],
                        "v": plan["bom_version"]}).mappings().all()
    out = []
    for r in lines:
        need = round(float(plan["qty_plan"]) * float(r["qty"] or 0)
                     * (1 + float(r["loss_rate"] or 0)), 3)
        if cust:
            inv = db.execute(text("SELECT COALESCE(SUM(avail),0) a"
                                  " FROM stock_onhand WHERE material_code=:m"
                                  " AND partner_id=:c"),
                             {"m": r["material_code"],
                              "c": cust}).scalar() or 0
        else:
            inv = db.execute(text("SELECT COALESCE(SUM(avail),0) a"
                                  " FROM stock_onhand WHERE material_code=:m"),
                             {"m": r["material_code"]}).scalar() or 0
        out.append({"material_code": r["material_code"], "unit": r["unit"],
                    "need_qty": need, "onhand_qty": float(inv),
                    "gap_qty": round(need - float(inv), 3)})
    return resp.ok({"plan_no": plan_no, "lines": out}, total=len(out))


@router.post("/prod_plans/{plan_no}/to_wo")
def prod_plan_to_wo(plan_no: str, body: dict,
                    authed: dict = Depends(auth.need_auth),
                    db: Session = Depends(get_db)):
    plan = db.execute(text("SELECT product_code,bom_version,qty_plan,workshop"
                            " FROM prod_plan WHERE plan_no=:n"),
                      {"n": plan_no}).mappings().first()
    if not plan:
        return resp.fail(404, "生产计划不存在")
    db.rollback()
    with db.begin():
        wo_no = posting.make_doc_no(db, "WO")
        db.execute(text("INSERT INTO wo_task(wo_no,product_code,bom_version,"
                        "qty_plan,workshop,biz_status)"
                        " VALUES(:w,:p,:b,:q,:s,'下达')"),
                   {"w": wo_no, "p": plan["product_code"],
                    "b": plan["bom_version"], "q": plan["qty_plan"],
                    "s": body.get("workshop") or plan["workshop"]})
    return resp.ok({"plan_no": plan_no, "wo_no": wo_no,
                    "biz_status": "下达"})


@router.post("/wo_tasks/{wo_no}/issue")
def wo_issue(wo_no: str, body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    wo = db.execute(text("SELECT product_code,bom_version FROM wo_task"
                         " WHERE wo_no=:w"), {"w": wo_no}).mappings().first()
    if not wo:
        return resp.fail(404, "DOC_NOT_FOUND:工单不存在")
    lines = db.execute(text("SELECT material_code,qty,unit FROM bom_line"
                            " WHERE product_code=:p AND version=:v"),
                       {"p": wo["product_code"],
                        "v": wo["bom_version"]}).mappings().all()
    if not lines:
        return resp.fail(400, "BOM无行,不可领料")
    with db.begin():
        doc_no = posting.create(db, "LY", str(body.get("handler") or ""),
                                [{"material_code": r["material_code"],
                                  "qty": float(r["qty"] or 0),
                                  "unit": r["unit"],
                                  "loc": body.get("loc") or ""} for r in lines])
    return resp.ok({"wo_no": wo_no, "ly_no": doc_no, "lines": len(lines),
                    "tip": "已按BOM展开建LY单,过账才扣减"})


@router.post("/wo_tasks/{wo_no}/finish")
def wo_finish(wo_no: str, body: dict, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    if body.get("qty_done") is None:
        return resp.fail(400, "完工数量必填")
    with db.begin():
        db.execute(text("UPDATE wo_task SET qty_done=qty_done+:q,"
                        "biz_status='完工' WHERE wo_no=:w"),
                   {"q": body["qty_done"], "w": wo_no})
        doc_no = posting.make_doc_no(db, "RK")
        db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler)"
                        " VALUES(:d,'RK',11300,'DRAFT',:h)"),
                   {"d": doc_no, "h": str(body.get("handler") or "")})
    return resp.ok({"wo_no": wo_no, "rk_no": doc_no, "biz_status": "完工"})


@router.get("/arrival_analysis")
def arrival_analysis(authed: dict = Depends(auth.need_auth),
                     db: Session = Depends(get_db)):
    """到货分析三张表:准时率/欠料缺口/供应商排行."""
    orders = db.execute(text("SELECT order_no,customer,product_code,qty_order,"
                             "due_date FROM sale_order"
                             " WHERE biz_status<>'已关闭'")).mappings().all()
    ontime, late, open_gap = 0, 0, []
    for o in orders:
        got = db.execute(text("SELECT COALESCE(SUM(l.qty),0) q,"
                               "MAX(m.arrived_at) a FROM doc_main m"
                               " JOIN doc_line l ON l.doc_no=m.doc_no"
                               " WHERE m.src_order_no=:o AND m.type IN"
                               " ('DJ','RK') AND m.biz_status='POSTED'"),
                         {"o": o["order_no"]}).mappings().first()
        gq = float(got["q"] or 0)
        need = float(o["qty_order"] or 0)
        due = str(o["due_date"] or "")
        arr = str(got["a"] or "")
        if gq >= need and need > 0:
            if due and arr and arr[:10] <= due[:10]:
                ontime += 1
            elif not due:
                ontime += 1
            else:
                late += 1
        elif need > 0:
            late += 1
            open_gap.append({"order_no": o["order_no"],
                             "customer": o["customer"], "need": need,
                             "arrived": gq, "gap": round(need - gq, 3),
                             "due_date": due})
    try:
        sup_rows = [dict(r) for r in
                    db.execute(text("SELECT COALESCE(partner_id,'—') AS name,"
                                    "COUNT(*) AS arrivals FROM doc_main"
                                    " WHERE type IN ('DJ','RK')"
                                    " GROUP BY partner_id"
                                    " ORDER BY arrivals DESC LIMIT 10"))
                    .mappings().all()]
    except Exception:
        sup_rows = []
    total = ontime + late
    return resp.ok({"punctual": {"ontime": ontime, "late": late,
                                 "rate": round(ontime / total, 3)
                                 if total else 1},
                    "gaps": open_gap, "suppliers": sup_rows}, total=len(open_gap))


@router.post("/deliver_signs")
def deliver_sign(body: dict, authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    for key in ("doc_no", "receiver", "sign_time"):
        if not body.get(key):
            return resp.fail(400, "交付单号/签收人/签收时间必填")
    with db.begin():
        db.execute(text("INSERT INTO deliver_sign(doc_no,receiver,sign_time,"
                        "sender,proof_ref) VALUES(:d,:r,:t,:s,:p)"),
                   {"d": body["doc_no"], "r": body["receiver"],
                    "t": body["sign_time"], "s": body.get("sender"),
                    "p": body.get("proof_ref")})
        db.execute(text("UPDATE doc_main SET biz_status='已签收'"
                        " WHERE doc_no=:d"), {"d": body["doc_no"]})
    return resp.ok({"doc_no": body["doc_no"], "signed": True})

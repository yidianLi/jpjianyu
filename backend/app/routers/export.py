"""数据导出:库存台账/单据明细/到货分析 -> xlsx(零依赖生成,查询结果导出)."""
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import auth, queries, xlsx
from app.core.db import get_db

router = APIRouter()

XLSX_MIME = ("application/vnd.openxmlformats-officedocument."
             "spreadsheetml.sheet")


def _resp(data, filename):
    return Response(content=data, media_type=XLSX_MIME, headers={
        "Content-Disposition": "attachment; filename=%s" % filename,
        "Cache-Control": "no-store"})


@router.get("/export/onhand.xlsx")
def export_onhand(authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db), wh: str = "",
                  material_code: str = ""):
    cond, args = ["1=1"], {}
    if wh:
        cond.append("wh=:wh")
        args["wh"] = wh
    if material_code:
        cond.append("material_code=:m")
        args["m"] = material_code
    rows = db.execute(text("SELECT material_code,product_code,batch_no,wh,loc,"
                           "on_hand,avail,pending,quarantine,frozen,partner_id"
                           " FROM stock_onhand WHERE " + " AND ".join(cond) +
                           " ORDER BY wh,loc,material_code LIMIT 100000"),
                      args).mappings().all()
    head = ["物料编码", "成品编码", "批次", "仓库", "库位", "现存", "可用",
            "待发", "隔离", "冻结", "归属客户"]
    body = [[r["material_code"], r["product_code"], r["batch_no"], r["wh"],
             r["loc"], r["on_hand"], r["avail"], r["pending"],
             r["quarantine"], r["frozen"], r["partner_id"]] for r in rows]
    return _resp(xlsx.build_xlsx(head, body, "库存台账"),
                 "onhand.xlsx")


@router.get("/export/docs.xlsx")
def export_docs(authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db), dtype: str = ""):
    docs, _ = queries.fetch_docs(db, dtype, "", 1, 100000, True)
    head = ["单号", "类型", "状态", "经办人", "制单时间", "来源订单", "行号",
            "物料编码", "成品编码", "批次", "数量", "单位", "库位"]
    body = []
    for d in docs:
        lines = d.get("lines") or [{}]
        for ln in lines:
            body.append([d.get("doc_no"), d.get("type"),
                         d.get("biz_status"), d.get("handler"),
                         str(d.get("at") or ""), d.get("src_order_no"),
                         ln.get("line_no"), ln.get("material_code"),
                         ln.get("product_code"), ln.get("batch_no"),
                         ln.get("qty"), ln.get("unit"), ln.get("loc")])
    return _resp(xlsx.build_xlsx(head, body, "单据明细"), "docs.xlsx")


@router.get("/export/fee.xlsx")
def export_fee(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), customer: str = ""):
    cond, args = ["1=1"], {}
    if customer:
        cond.append("customer=:c")
        args["c"] = customer
    rows = db.execute(text("SELECT settle_no,customer,period,qty_send,"
                           "qty_issue,qty_fin,amount,biz_status,confirmed_by,"
                           "confirm_note,updated_at FROM fee_settle WHERE " +
                           " AND ".join(cond) +
                           " ORDER BY updated_at DESC LIMIT 100000"),
                      args).mappings().all()
    head = ["对账单号", "客户", "账期", "送货数", "发料数", "成品数", "参考金额",
            "状态", "核对人", "财务备注", "更新时间"]
    body = [[r["settle_no"], r["customer"], r["period"], r["qty_send"],
             r["qty_issue"], r["qty_fin"], r["amount"], r["biz_status"],
             r["confirmed_by"], r["confirm_note"],
             str(r["updated_at"] or "")] for r in rows]
    return _resp(xlsx.build_xlsx(head, body, "加工费对账"), "fee.xlsx")


@router.get("/export/arrival.xlsx")
def export_arrival(authed: dict = Depends(auth.need_auth),
                   db: Session = Depends(get_db)):
    orders = db.execute(text("SELECT order_no,customer,product_code,qty_order,"
                             "due_date,biz_status FROM sale_order"
                             " ORDER BY order_no DESC")).mappings().all()
    head = ["订单号", "客户", "成品", "订货数", "已到货", "缺口", "交期", "状态"]
    body = []
    for o in orders:
        got = db.execute(text("SELECT COALESCE(SUM(l.qty),0) q FROM doc_main m"
                              " JOIN doc_line l ON l.doc_no=m.doc_no"
                              " WHERE m.src_order_no=:o AND m.type IN"
                              " ('DJ','RK') AND m.biz_status='POSTED'"),
                         {"o": o["order_no"]}).scalar() or 0
        need = float(o["qty_order"] or 0)
        got = float(got)
        body.append([o["order_no"], o["customer"], o["product_code"], need,
                     got, round(need - got, 3), str(o["due_date"] or ""),
                     o["biz_status"]])
    return _resp(xlsx.build_xlsx(head, body, "到货分析"), "arrival.xlsx")

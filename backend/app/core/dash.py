"""驾驶舱聚合:三域只读,不新增表.公式见执行方案V2.3 §3.3."""
from sqlalchemy import text


def kpi(db):
    todo = db.execute(text("SELECT COUNT(*) c FROM doc_main"
                           " WHERE biz_status IN ('DRAFT','APPROVING')")).scalar() or 0
    onhand = db.execute(text("SELECT COALESCE(SUM(on_hand),0) s FROM stock_onhand")).scalar() or 0
    diff = db.execute(text("SELECT COUNT(*) c FROM pd_task"
                           " WHERE biz_status<>'关闭'")).scalar() or 0
    issue = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                            " WHERE biz='LY'")).scalar() or 0
    fin = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                          " WHERE biz='RK' AND product_code LIKE 'CP-%'")).scalar() or 0
    back = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                           " WHERE biz='TK'")).scalar() or 0
    rate = (float(back) / float(issue)) if float(issue) else 0.0
    return {"todo": int(todo), "onhand": float(onhand), "diff": int(diff),
            "turnover": {"issue": float(issue), "fin_in": float(fin)},
            "capacity": {"back_qty": float(back), "back_rate": round(rate, 4)}}


def formula():
    return ("发料量Σledger WHERE biz='LY';"
            "成品入库Σledger WHERE biz='RK' AND product_code LIKE 'CP-%';"
            "退料率Σ(TK)/Σ(LY)同单位分组")


def alerts(db):
    rows = db.execute(text("SELECT pd_no AS doc, '盘点未关闭' AS reason FROM pd_task"
                           " WHERE biz_status<>'关闭' LIMIT 10")).mappings().all()
    return [{"doc": r["doc"], "reason": r["reason"],
             "link": "/docs.html?code=" + r["doc"]} for r in rows]

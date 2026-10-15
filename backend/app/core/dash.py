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
    whs = db.execute(text("SELECT COUNT(*) c FROM warehouse")).scalar() or 0
    mats = db.execute(text("SELECT COUNT(*) c FROM mat_master")).scalar() or 0
    locs = db.execute(text("SELECT COUNT(*) c FROM location")).scalar() or 0
    wha = db.execute(text("SELECT COALESCE(SUM(o.on_hand),0) s FROM stock_onhand o"
                          " LEFT JOIN mat_master m ON m.material_code=o.material_code"
                          " LEFT JOIN product_master p ON p.product_code=o.product_code"
                          " WHERE o.wh='WH-A' AND COALESCE(m.base_unit,p.base_unit)='米'")).scalar() or 0
    whin = db.execute(text("SELECT COALESCE(SUM(o.on_hand),0) s FROM stock_onhand o"
                           " LEFT JOIN mat_master m ON m.material_code=o.material_code"
                           " LEFT JOIN product_master p ON p.product_code=o.product_code"
                           " WHERE o.wh IN ('WH-B','WH-C') AND COALESCE(m.base_unit,p.base_unit)='米'")).scalar() or 0
    fout = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                            " WHERE biz='JJ' AND product_code LIKE 'CP-%'")).scalar() or 0
    return {"todo": int(todo), "onhand": float(onhand), "diff": int(diff),
            "turnover": {"issue": float(issue), "fin_in": float(fin)},
            "masters": {"wh": int(whs), "mat": int(mats), "loc": int(locs)},
            "wh_m": {"a": float(wha), "in": float(whin)},
            "fin_out": float(fout),
            "capacity": {"back_qty": float(back), "back_rate": round(rate, 4)}}


def formula():
    return ("发料量Σledger WHERE biz='LY';"
            "成品入库Σledger WHERE biz='RK' AND product_code LIKE 'CP-%';"
            "退料率Σ(TK)/Σ(LY)同单位分组")


def alerts(db):
    rows = db.execute(text("SELECT pd_no AS doc FROM pd_task"
                           " WHERE biz_status<>'关闭' LIMIT 10")).mappings().all()
    out = [{"doc": r["doc"], "reason": "盘点未关闭",
            "link": "/docs.html?code=" + r["doc"]} for r in rows]
    try:
        import datetime as _dt
        cutoff = (_dt.date.today() + _dt.timedelta(days=30)).isoformat()
        exp = db.execute(text("SELECT batch_no,expire_date FROM batch"
                              " WHERE expire_date IS NOT NULL"
                              " AND expire_date<=:c"
                              " ORDER BY expire_date LIMIT 10"),
                         {"c": cutoff}).mappings().all()
        for r in exp:
            out.append({"doc": r["batch_no"],
                        "reason": "临期/过期(效期%s)" % r["expire_date"],
                        "link": "/docs.html?code=" + r["batch_no"]})
    except Exception:
        pass
    return out

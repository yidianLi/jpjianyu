"""报表口径计算:每类报表一个纯函数,给 generate 与 report.html 共用.只读不改账."""
from sqlalchemy import text


def _num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _str(v):
    return "" if v is None else str(v)


def inout(db):
    """收发存:按物料+方向汇总入库/出库/结存."""
    rows = db.execute(text("SELECT material_code,product_code,biz,"
                           "COALESCE(SUM(qty),0) q FROM stock_ledger"
                           " GROUP BY material_code,product_code,biz"
                           " ORDER BY material_code,product_code")).mappings().all()
    agg = {}
    for r in rows:
        k = (r["material_code"] or "", r["product_code"] or "")
        a = agg.setdefault(k, {"物料": k[0], "成品": k[1], "入库": 0.0, "出库": 0.0})
        a["入库" if r["biz"] in ("RK", "CP") else "出库"] += _num(r["q"])
    out = []
    for a in agg.values():
        a["结存"] = round(a["入库"] - a["出库"], 3)
        out.append(a)
    return out


def balance(db):
    """余额:现存台账原样透出."""
    rows = db.execute(text("SELECT material_code,product_code,batch_no,wh,loc,"
                           "on_hand,avail FROM stock_onhand"
                           " ORDER BY wh,loc LIMIT 1000")).mappings().all()
    return [{"物料": r["material_code"], "成品": r["product_code"],
             "批次": r["batch_no"], "仓库": r["wh"], "库位": r["loc"],
             "现存": _num(r["on_hand"]), "可用": _num(r["avail"])}
            for r in rows]


def issue_return(db):
    """领退:领用 vs 退料/退仓."""
    rows = db.execute(text("SELECT biz,COALESCE(SUM(qty),0) q FROM stock_ledger"
                           " WHERE biz IN ('LY','TK','TC') GROUP BY biz")
                      ).mappings().all()
    m = {r["biz"]: _num(r["q"]) for r in rows}
    return [{"项目": "领用(LY)", "数量": m.get("LY", 0.0)},
            {"项目": "物料退库(TK)", "数量": m.get("TK", 0.0)},
            {"项目": "成品退仓(TC)", "数量": m.get("TC", 0.0)}]


def transfer(db):
    """调仓:按单汇总调拨量."""
    rows = db.execute(text("SELECT m.doc_no,COALESCE(SUM(l.qty),0) q FROM doc_main m"
                           " JOIN doc_line l ON l.doc_no=m.doc_no"
                           " WHERE m.type='DB' AND m.biz_status='POSTED'"
                           " GROUP BY m.doc_no ORDER BY m.doc_no")).mappings().all()
    return [{"调拨单": r["doc_no"], "数量": _num(r["q"])} for r in rows]


def finished(db):
    """成品:成品入库 vs 交付."""
    rows = db.execute(text("SELECT biz,COALESCE(SUM(qty),0) q FROM stock_ledger"
                           " WHERE biz IN ('RK','JJ')"
                           " AND product_code LIKE 'CP-%' GROUP BY biz")
                      ).mappings().all()
    m = {r["biz"]: _num(r["q"]) for r in rows}
    return [{"项目": "成品入库", "数量": m.get("RK", 0.0)},
            {"项目": "成品交付(JJ)", "数量": m.get("JJ", 0.0)}]


def scrap(db):
    """报废处置:按单汇总."""
    rows = db.execute(text("SELECT m.doc_no,COALESCE(SUM(l.qty),0) q FROM doc_main m"
                           " JOIN doc_line l ON l.doc_no=m.doc_no"
                           " WHERE m.type='BF' AND m.biz_status='POSTED'"
                           " GROUP BY m.doc_no ORDER BY m.doc_no")).mappings().all()
    return [{"报废单": r["doc_no"], "数量": _num(r["q"])} for r in rows]


def age(db):
    """库龄:按批次最早入库时间算在库天数."""
    rows = db.execute(text("SELECT batch_no,MIN(at) first,MAX(at) last,"
                           "COALESCE(SUM(qty*(CASE WHEN dir='1' THEN 1 ELSE -1 END)),0) q"
                           " FROM stock_ledger WHERE batch_no<>''"
                           " GROUP BY batch_no ORDER BY first")).mappings().all()
    out = []
    for r in rows:
        try:
            import datetime as _dt
            d0 = _dt.datetime.strptime(_str(r["first"])[:10], "%Y-%m-%d").date()
            days = (_dt.date.today() - d0).days
        except (ValueError, TypeError):
            days = ""
        out.append({"批次": r["batch_no"], "首次入库": _str(r["first"])[:16],
                    "在库数量": _num(r["q"]), "在库天数": days})
    return out


def settle(db):
    """对账:加工费结算单汇总."""
    rows = db.execute(text("SELECT settle_no,customer,period,qty_fin,amount,"
                           "biz_status FROM fee_settle"
                           " ORDER BY settle_no")).mappings().all()
    return [{"对账单": r["settle_no"], "客户": r["customer"],
             "账期": r["period"], "成品数": _num(r["qty_fin"]),
             "金额": _num(r["amount"]), "状态": r["biz_status"]}
            for r in rows]


def daily(db):
    """日报:今日过账单数与流水笔数(日期边界由应用层算,跨库可移植)."""
    import datetime as _dt
    today = _dt.date.today()
    start = today.isoformat()
    end = (today + _dt.timedelta(days=1)).isoformat()
    rows = db.execute(text("SELECT type,COUNT(*) n FROM doc_main"
                           " WHERE at>=:s AND at<:e"
                           " GROUP BY type ORDER BY type"),
                      {"s": start, "e": end}).mappings().all()
    n = db.execute(text("SELECT COUNT(*) c FROM stock_ledger"
                        " WHERE at>=:s AND at<:e"),
                   {"s": start, "e": end}).scalar() or 0
    out = [{"单据类型": r["type"], "单数": int(r["n"])} for r in rows]
    out.append({"单据类型": "流水笔数", "单数": int(n)})
    return out


def diff(db):
    """差异:盘点任务状态."""
    rows = db.execute(text("SELECT pd_no,biz_status FROM pd_task"
                           " ORDER BY pd_no DESC LIMIT 50")).mappings().all()
    return [{"盘点单": r["pd_no"], "状态": r["biz_status"]} for r in rows]


def finished_done(db):
    """完工:工单计划 vs 完工."""
    rows = db.execute(text("SELECT wo_no,product_code,qty_plan,qty_done,"
                           "biz_status FROM wo_task ORDER BY wo_no DESC LIMIT 50")
                      ).mappings().all()
    return [{"工单": r["wo_no"], "成品": r["product_code"],
             "计划": _num(r["qty_plan"]), "完工": _num(r["qty_done"]),
             "状态": r["biz_status"]} for r in rows]


def loss(db):
    """损耗:报废+退料占入库比(同单位粗算)."""
    tin = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                          " WHERE biz IN ('RK','CP')")).scalar() or 0
    out = db.execute(text("SELECT COALESCE(SUM(qty),0) s FROM stock_ledger"
                          " WHERE biz IN ('BF','TK','TC')")).scalar() or 0
    tin, out = _num(tin), _num(out)
    return [{"项目": "入库总量", "数量": tin},
            {"项目": "损耗(报废+退料/退仓)", "数量": out},
            {"项目": "损耗率", "数量": round(out / tin, 4) if tin else 0.0}]


REPORTS = {"收发存": inout, "余额": balance, "领退": issue_return,
           "调仓": transfer, "成品": finished, "报废": scrap,
           "库龄": age, "对账": settle, "日报": daily,
           "差异": diff, "完工": finished_done, "损耗": loss}

"""自定义报表受控聚合引擎:白名单数据源/维度/指标/聚合,参数化过滤,跨库可移植.

安全要点:表名、列名、聚合函数全部取自白名单映射,绝不拼接用户字符串;
过滤值走 :param 绑定;仅允许 SUM/AVG/MIN/MAX/COUNT;结果 LIMIT 5000.
"""
from sqlalchemy import text

AGG_OK = {"SUM", "AVG", "MIN", "MAX", "COUNT"}

DATASETS = {
    "onhand": {
        "label": "库存现存(stock_onhand)",
        "table": "stock_onhand",
        "date_col": None,
        "filter_wh": "wh",
        "filter_material": "material_code",
        "dims": {"material_code": "物料编码", "product_code": "成品编码",
                 "batch_no": "批次", "wh": "仓库", "loc": "库位",
                 "partner_id": "归属客户"},
        "measures": {"on_hand": "现存", "avail": "可用", "pending": "待发",
                     "quarantine": "隔离", "frozen": "冻结"},
    },
    "ledger": {
        "label": "出入流水(stock_ledger)",
        "table": "stock_ledger",
        "date_col": "at",
        "filter_wh": "wh",
        "filter_material": "material_code",
        "dims": {"material_code": "物料编码", "product_code": "成品编码",
                 "batch_no": "批次", "biz": "业务类型", "wh": "仓库",
                 "loc": "库位"},
        "measures": {"qty": "数量"},
    },
}


def meta():
    """给前端构建器用的白名单元数据(数据源/可分组维度/可聚合指标/是否支持期间)."""
    out = {}
    for k, v in DATASETS.items():
        out[k] = {"label": v["label"], "dims": v["dims"],
                  "measures": v["measures"], "has_date": bool(v["date_col"])}
    return out


def normalize(defn):
    """校验并把定义归一化;非法抛 ValueError(调用方转 400)."""
    defn = defn or {}
    ds = str(defn.get("dataset") or "")
    d = DATASETS.get(ds)
    if not d:
        raise ValueError("未知数据源:%s" % ds)
    dims = []
    for x in (defn.get("dims") or []):
        x = str(x or "")
        if not x:
            continue
        if x not in d["dims"]:
            raise ValueError("维度非法:%s" % x)
        if x not in dims:
            dims.append(x)
    measures = []
    for m in (defn.get("measures") or []):
        if not isinstance(m, dict):
            raise ValueError("指标格式非法")
        fn = str(m.get("fn") or "SUM").upper()
        col = str(m.get("col") or "")
        if fn == "COUNT":
            measures.append({"fn": "COUNT", "col": "*",
                             "label": str(m.get("label") or "笔数")})
            continue
        if fn not in AGG_OK:
            raise ValueError("聚合函数非法:%s" % fn)
        if col not in d["measures"]:
            raise ValueError("指标列非法:%s" % col)
        measures.append({"fn": fn, "col": col,
                         "label": str(m.get("label") or d["measures"][col])})
    if not measures:
        raise ValueError("至少选择一个指标")
    f = defn.get("filters") or {}
    whs = [str(x) for x in (f.get("wh") or []) if str(x)]
    return {"dataset": ds, "dims": dims, "measures": measures,
            "filters": {"wh": whs,
                        "material_code": str(f.get("material_code") or "").strip()},
            "start": str(defn.get("start") or "").strip(),
            "end": str(defn.get("end") or "").strip()}


def _build(d, defn):
    sel = list(defn["dims"])
    for i, m in enumerate(defn["measures"]):
        if m["fn"] == "COUNT":
            sel.append("COUNT(*) AS m%d" % i)
        else:
            sel.append("COALESCE(%s(%s),0) AS m%d" % (m["fn"], m["col"], i))
    where, args = [], {}
    f = defn["filters"]
    if f["wh"] and d.get("filter_wh"):
        keys = []
        for i, w in enumerate(f["wh"]):
            k = "wh%d" % i
            keys.append(":" + k)
            args[k] = w
        where.append("%s IN (%s)" % (d["filter_wh"], ",".join(keys)))
    if f["material_code"] and d.get("filter_material"):
        where.append("%s LIKE :mc" % d["filter_material"])
        args["mc"] = "%" + f["material_code"] + "%"
    if d.get("date_col"):
        if defn["start"]:
            where.append("%s >= :dt_s" % d["date_col"])
            args["dt_s"] = defn["start"]
        if defn["end"]:
            where.append("%s <= :dt_e" % d["date_col"])
            args["dt_e"] = defn["end"] + " 23:59:59"
    sql = "SELECT " + ", ".join(sel) + " FROM " + d["table"]
    if where:
        sql += " WHERE " + " AND ".join(where)
    if defn["dims"]:
        sql += " GROUP BY " + ", ".join(defn["dims"])
        sql += " ORDER BY " + ", ".join(defn["dims"])
    sql += " LIMIT 5000"
    return sql, args


def run(db, defn):
    norm = normalize(defn)
    d = DATASETS[norm["dataset"]]
    sql, args = _build(d, norm)
    rows = db.execute(text(sql), args).mappings().all()
    head = [d["dims"][x] for x in norm["dims"]] + \
           [m["label"] for m in norm["measures"]]
    keys = list(norm["dims"]) + ["m%d" % i for i in range(len(norm["measures"]))]
    out = []
    for r in rows:
        item = {}
        for i, k in enumerate(keys):
            v = r[k]
            if i >= len(norm["dims"]) and v is not None:
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    pass
            item[head[i]] = "" if v is None else v
        out.append(item)
    return {"head": head, "rows": out, "count": len(out), "defn": norm}

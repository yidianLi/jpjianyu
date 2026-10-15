"""读查询:只用交集SQL,兼容MySQL5.6与HGDB备选.每函数<=50行."""
from sqlalchemy import text


def fetch_onhand(db, wh="", mat="", prod="", page=1, size=20):
    cond, args = ["1=1"], {}
    if wh:
        cond.append("wh=:wh")
        args["wh"] = wh
    if mat:
        cond.append("material_code=:mat")
        args["mat"] = mat
    if prod:
        cond.append("product_code=:prod")
        args["prod"] = prod
    where = " AND ".join(cond)
    total = db.execute(text("SELECT COUNT(*) c FROM stock_onhand WHERE " + where), args).scalar() or 0
    args.update({"off": (page - 1) * size, "n": size})
    rows = db.execute(text("SELECT material_code,product_code,batch_no,wh,loc,"
                           "on_hand,avail,pending,quarantine,frozen FROM stock_onhand"
                           " WHERE " + where + " LIMIT :n OFFSET :off"), args).mappings().all()
    return [dict(r) for r in rows], int(total)


def fetch_ledger(db, doc_no="", code="", page=1, size=50):
    cond, args = ["1=1"], {}
    if doc_no:
        cond.append("doc_no=:d")
        args["d"] = doc_no
    if code:
        cond.append("(barcode=:c OR batch_no=:c OR doc_no=:c)")
        args["c"] = code
    where = " AND ".join(cond)
    total = db.execute(text("SELECT COUNT(*) c FROM stock_ledger WHERE " + where), args).scalar() or 0
    args.update({"off": (page - 1) * size, "n": size})
    rows = db.execute(text("SELECT id,doc_no,line_no,sid,material_code,product_code,"
                           "batch_no,barcode,wh,loc,qty,unit,dir,biz,by_user,"
                           "device,at,idem_key FROM stock_ledger"
                           " WHERE " + where + " ORDER BY id DESC LIMIT :n OFFSET :off"), args).mappings().all()
    return [dict(r) for r in rows], int(total)


def fetch_docs(db, dtype="", status="", page=1, size=20, with_lines=False):
    cond, args = ["1=1"], {}
    if dtype:
        cond.append("type=:t")
        args["t"] = dtype
    if status:
        cond.append("biz_status=:s")
        args["s"] = status
    where = " AND ".join(cond)
    total = db.execute(text("SELECT COUNT(*) c FROM doc_main WHERE " + where), args).scalar() or 0
    args.update({"off": (page - 1) * size, "n": size})
    rows = db.execute(text("SELECT doc_no,type,sid,bmid,biz_status,handler,`at`,"
                           "src_order_no,ordered_at,shipped_at,arrived_at,qc_at"
                           " FROM doc_main WHERE " + where +
                           " ORDER BY `at` DESC LIMIT :n OFFSET :off"), args).mappings().all()
    out = [dict(r) for r in rows]
    if with_lines and out:
        nos = [r["doc_no"] for r in out]
        ph = ",".join([":n%d" % i for i in range(len(nos))])
        par = {"n%d" % i: v for i, v in enumerate(nos)}
        lrows = db.execute(text("SELECT doc_no,line_no,material_code,"
                                "product_code,bom_version,batch_no,qty,unit,loc,"
                                "qc_result,reason FROM doc_line WHERE doc_no IN ("
                                + ph + ") ORDER BY doc_no,line_no"), par).mappings().all()
        by = {}
        for lr in lrows:
            by.setdefault(lr["doc_no"], []).append(dict(lr))
        for r in out:
            r["lines"] = by.get(r["doc_no"], [])
    return out, int(total)


def fetch_doc_detail(db, doc_no):
    head = db.execute(text("SELECT doc_no,type,sid,bmid,biz_status,handler,`at`,"
                           "src_order_no,ordered_at,shipped_at,arrived_at,qc_at"
                           " FROM doc_main WHERE doc_no=:d"), {"d": doc_no}).mappings().first()
    if not head:
        return None, []
    lines = db.execute(text("SELECT doc_no,line_no,o_qty,n_qty,o_loc,n_loc,"
                            "material_code,product_code,bom_version,batch_no,"
                            "qty,unit,loc,qc_result,reason FROM doc_line"
                            " WHERE doc_no=:d ORDER BY line_no"), {"d": doc_no}).mappings().all()
    return dict(head), [dict(r) for r in lines]

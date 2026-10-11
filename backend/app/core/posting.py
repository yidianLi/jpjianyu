"""写事务:建单/提交/过账/审批.同事务写状态+流水+现存+审计."""
from sqlalchemy import text

NO_POST = {"SQ", "JS", "PD"}
TYPE_SID = {"DJ": 10000, "JS": 10200, "RK": 10100, "LY": 10400,
            "TK": 15000, "TC": 15050, "DB": 19000, "TZ": 19100,
            "PD": 13100, "CP": 11200, "JJ": 11400, "WO": 11500,
            "SQ": 11600}


def make_doc_no(db, prefix):
    row = db.execute(text("SELECT next_val FROM sys_sequence WHERE seq_name=:n"),
                     {"n": "DOC_MAIN.DOC_NO"}).mappings().first()
    nxt = int(row["next_val"]) if row else 10000001
    db.execute(text("UPDATE sys_sequence SET next_val=:v WHERE seq_name=:n"),
               {"v": nxt + 1, "n": "DOC_MAIN.DOC_NO"})
    return "%s%06d" % (prefix, nxt % 1000000)


def create(db, dtype, handler, lines):
    doc_no = make_doc_no(db, dtype)
    db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler)"
                    " VALUES(:d,:t,:s,'DRAFT',:h)"),
               {"d": doc_no, "t": dtype, "s": TYPE_SID[dtype], "h": handler})
    for i, line in enumerate(lines, 1):
        db.execute(text("INSERT INTO doc_line(doc_no,line_no,material_code,"
                        "product_code,bom_version,qty,unit,loc)"
                        " VALUES(:d,:n,:m,:p,:b,:q,:u,:l)"),
                   {"d": doc_no, "n": i, "m": line.get("material_code"),
                    "p": line.get("product_code"), "b": line.get("bom_version"),
                    "q": line.get("qty"), "u": line.get("unit"),
                    "l": line.get("loc")})
    db.execute(text("INSERT INTO flow_instance(doc_no,flow_key,cur_step,flow_status)"
                    " VALUES(:d,:f,'S1','草稿)"), {"d": doc_no, "f": dtype})
    return doc_no


def submit(db, doc_no):
    hit = db.execute(text("UPDATE doc_main SET biz_status='APPROVING'"
                          " WHERE doc_no=:d AND biz_status='DRAFT'"), {"d": doc_no})
    if not hit.rowcount:
        return ""
    db.execute(text("UPDATE flow_instance SET cur_step='S1',flow_status='审批中'"
                    " WHERE doc_no=:d"), {"d": doc_no})
    return "APPROVING"


def fetch_lines(db, doc_no):
    return db.execute(text("SELECT * FROM doc_line WHERE doc_no=:d"
                           " ORDER BY line_no"), {"d": doc_no}).mappings().all()


def avail_of(db, mat, prod, batch, wh, loc):
    row = db.execute(text("SELECT avail FROM stock_onhand WHERE material_code=:m"
                          " AND product_code=:p AND batch_no=:b AND wh=:w AND loc=:l"),
                     {"m": mat or "", "p": prod or "", "b": batch or "",
                      "w": wh or "", "l": loc or ""}).mappings().first()
    return float(row["avail"]) if row else 0.0


def post(db, doc_no, dtype, by_user, device=""):
    if dtype in NO_POST:
        return "SKIP:不动账"
    head = db.execute(text("SELECT biz_status FROM doc_main WHERE doc_no=:d"),
                      {"d": doc_no}).mappings().first()
    if not head:
        return "404"
    if head["biz_status"] == "POSTED":
        return "POSTED"
    lines = fetch_lines(db, doc_no)
    for line in lines:
        key = "%s:%s:%s" % (doc_no, line["line_no"], dtype)
        dup = db.execute(text("SELECT id FROM stock_ledger WHERE idem_key=:k"),
                         {"k": key}).mappings().first()
        if dup:
            continue
        qty = float(line["qty"] or 0)
        if dtype == "LY":
            left = avail_of(db, line["material_code"], line["product_code"],
                            line["batch_no"], None, line["loc"])
            if qty > left:
                raise ValueError("OVER_ISSUE:实发%.3f>可用%.3f" % (qty, left))
        is_in = dtype in ("RK", "CP")
        db.execute(text("INSERT INTO stock_ledger(doc_no,line_no,sid,material_code,"
                        "product_code,batch_no,qty,unit,dir,biz,by_user,device,idem_key)"
                        " VALUES(:d,:n,:s,:m,:p,:b,:q,:u,:r,:z,:y,:v,:k)"),
                   {"d": doc_no, "n": line["line_no"], "s": TYPE_SID[dtype],
                    "m": line["material_code"], "p": line["product_code"],
                    "b": line["batch_no"], "q": qty, "u": line["unit"],
                    "r": "1" if is_in else "-1", "z": dtype,
                    "y": by_user, "v": device, "k": key})
    db.execute(text("UPDATE doc_main SET biz_status='POSTED' WHERE doc_no=:d"),
               {"d": doc_no})
    db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,biz_type,result)"
                    " VALUES(:y,'过账',:d,:z,'已完成')"),
               {"y": by_user, "d": doc_no, "z": dtype})
    return "POSTED"

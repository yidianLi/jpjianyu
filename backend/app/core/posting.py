"""写事务:建单/提交/过账/审批.同事务写状态+流水+现存+审计."""
from sqlalchemy import text
from app.core import dialect

NO_POST = {"SQ", "JS", "PD"}
TYPE_SID = {"DJ": 10000, "JS": 10200, "RK": 10100, "LY": 10400,
            "TK": 15000, "TC": 15050, "BF": 15300, "DB": 19000, "TZ": 19100,
            "PD": 13100, "CP": 11200, "JJ": 11400, "WO": 11500,
            "SQ": 11600}


def make_doc_no(db, prefix):
    db.execute(text(dialect.insert_ignore_prefix() +
                    " INTO sys_sequence(seq_name,cid,next_val,remark)"
                    " VALUES('DOC_MAIN.DOC_NO',0,10000001,'单据主键池')" +
                    dialect.insert_ignore_suffix(["seq_name"])))
    row = db.execute(text("SELECT next_val FROM sys_sequence WHERE seq_name=:n"),
                     {"n": "DOC_MAIN.DOC_NO"}).mappings().first()
    nxt = int(row["next_val"]) if row else 10000001
    db.execute(text("UPDATE sys_sequence SET next_val=:v WHERE seq_name=:n"),
               {"v": nxt + 1, "n": "DOC_MAIN.DOC_NO"})
    return "%s%06d" % (prefix, nxt % 1000000)


def create(db, dtype, handler, lines, extra=None):
    doc_no = make_doc_no(db, dtype)
    extra = extra or {}
    db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler,"
                    "src_order_no,ordered_at,shipped_at,arrived_at,qc_at,"
                    "partner_id)"
                    " VALUES(:d,:t,:s,'DRAFT',:h,:o,:o1,:o2,:o3,:o4,:p)"),
               {"d": doc_no, "t": dtype, "s": TYPE_SID[dtype], "h": handler,
                "o": extra.get("src_order_no"), "o1": extra.get("ordered_at"),
                "o2": extra.get("shipped_at"), "o3": extra.get("arrived_at"),
                "o4": extra.get("qc_at"), "p": extra.get("partner_id")})
    for i, line in enumerate(lines, 1):
        db.execute(text("INSERT INTO doc_line(doc_no,line_no,material_code,"
                        "product_code,bom_version,batch_no,qty,unit,loc,qc_result)"
                        " VALUES(:d,:n,:m,:p,:b,:bt,:q,:u,:l,:qc)"),
                   {"d": doc_no, "n": i, "m": line.get("material_code"),
                    "p": line.get("product_code"), "b": line.get("bom_version"),
                    "bt": line.get("batch_no"),
                    "q": line.get("qty"), "u": line.get("unit"),
                    "l": line.get("loc"), "qc": line.get("qc_result")})
    db.execute(text("INSERT INTO flow_instance(doc_no,flow_key,cur_step,flow_status)"
                    " VALUES(:d,:f,'S1','草稿')"), {"d": doc_no, "f": dtype})
    return doc_no


def submit(db, doc_no):
    hit = db.execute(text("UPDATE doc_main SET biz_status='APPROVING'"
                          " WHERE doc_no=:d AND biz_status='DRAFT'"), {"d": doc_no})
    if not hit.rowcount:
        return ""
    db.execute(text("UPDATE flow_instance SET cur_step='S1',flow_status='审批中'"
                    " WHERE doc_no=:d"), {"d": doc_no})
    return "APPROVING"


def approve(db, doc_no, passed, approver, opinion=""):
    """审批一步(单步审批模型):通过->APPROVED(待过账);退回->REJECTED.
    仅 APPROVING 可审批,过账(post)只认 APPROVED 故未审批无法动账."""
    row = db.execute(text("SELECT biz_status FROM doc_main WHERE doc_no=:d"),
                     {"d": doc_no}).mappings().first()
    if not row:
        return "404"
    if row["biz_status"] != "APPROVING":
        return "LOCKED"
    target = "APPROVED" if passed else "REJECTED"
    db.execute(text("UPDATE doc_main SET biz_status=:s WHERE doc_no=:d"
                    " AND biz_status='APPROVING'"),
               {"s": target, "d": doc_no})
    db.execute(text("UPDATE flow_instance SET cur_step='S2',flow_status=:s,"
                    "approver=:u WHERE doc_no=:d"),
               {"s": "通过" if passed else "退回", "u": approver, "d": doc_no})
    db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,biz_type,"
                    "result,o_val,n_val) VALUES(:y,:a,:d,'单据',:r,:o,:n)"),
               {"y": approver, "a": "审批通过" if passed else "审批退回",
                "d": doc_no, "r": "APPROVED" if passed else "REJECTED",
                "o": "APPROVING", "n": opinion or ""})
    return "APPROVED" if passed else "REJECTED"


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
    # 审批门禁+乐观锁抢单据头:仅当处于 APPROVED(已审批)时置为 POSTING。
    # 未审批(APPROVING/DRAFT)一律 LOCKED,保证"审批通过才动账"这条内控不可绕过。
    hit = db.execute(text("UPDATE doc_main SET biz_status='POSTING' "
                          "WHERE doc_no=:d AND biz_status='APPROVED'"),
                     {"d": doc_no})
    if not hit.rowcount:
        cur = db.execute(text("SELECT biz_status FROM doc_main WHERE doc_no=:d"),
                         {"d": doc_no}).mappings().first()
        if not cur:
            return "404"
        return "POSTED" if cur["biz_status"] == "POSTED" else "LOCKED"
    lines = fetch_lines(db, doc_no)
    head = db.execute(text("SELECT partner_id,src_order_no FROM doc_main"
                           " WHERE doc_no=:d"), {"d": doc_no}).mappings().first()
    owner = (head and head["partner_id"]) or ""
    if not owner and head and head["src_order_no"]:
        so = db.execute(text("SELECT customer FROM sale_order"
                             " WHERE order_no=:o"),
                        {"o": head["src_order_no"]}).mappings().first()
        if so:
            owner = so["customer"] or ""
            db.execute(text("UPDATE doc_main SET partner_id=:c"
                            " WHERE doc_no=:d"), {"c": owner, "d": doc_no})
    for line in lines:
        key = "%s:%s:%s" % (doc_no, line["line_no"], dtype)
        dup = db.execute(text("SELECT id FROM stock_ledger WHERE idem_key=:k"),
                         {"k": key}).mappings().first()
        if dup:
            continue
        qty = float(line["qty"] or 0)
        if dtype in ("LY", "BF"):
            left = avail_of(db, line["material_code"], line["product_code"],
                            line["batch_no"], None, line["loc"])
            if qty > left:
                raise ValueError("OVER_ISSUE:实发%.3f>可用%.3f" % (qty, left))
        is_in = dtype in ("RK", "CP")
        signed = qty if is_in else -qty
        # 入库行若标记待检(qc_result=待检),总量计入但落在"隔离(待检)"分量,
        # 可用为0;质检判定(pass/fail)再把它搬去可用或冻结.避免待检料被误发.
        is_qc_in = bool(is_in and str(line.get("qc_result") or "") == "待检")
        in_avail = 0 if is_qc_in else signed
        in_quar = signed if is_qc_in else 0
        db.execute(text("INSERT INTO stock_ledger(doc_no,line_no,sid,material_code,"
                        "product_code,batch_no,qty,unit,dir,biz,by_user,device,idem_key)"
                        " VALUES(:d,:n,:s,:m,:p,:b,:q,:u,:r,:z,:y,:v,:k)"),
                   {"d": doc_no, "n": line["line_no"], "s": TYPE_SID[dtype],
                    "m": line["material_code"], "p": line["product_code"],
                    "b": line["batch_no"], "q": qty, "u": line["unit"],
                    "r": "1" if is_in else "-1", "z": dtype,
                    "y": by_user, "v": device, "k": key})
        ln = dict(line)
        qcol = "quarantine=quarantine+:q" if is_qc_in else "avail=avail+:q"
        tail = (" ON DUPLICATE KEY UPDATE on_hand=on_hand+:d," + qcol +
                ",partner_id=VALUES(partner_id)"
                if dialect.IS_MYSQL else
                " ON CONFLICT (material_code,product_code,batch_no,wh,loc)"
                " DO UPDATE SET on_hand=stock_onhand.on_hand+:d," +
                ("quarantine=stock_onhand.quarantine+:q"
                 if is_qc_in else "avail=stock_onhand.avail+:q") +
                ",partner_id=EXCLUDED.partner_id")
        db.execute(text("INSERT INTO stock_onhand(material_code,product_code,"
                        "batch_no,wh,loc,on_hand,avail,quarantine,partner_id)"
                        " VALUES(:m,:p,:b,'',:l,:q,:av,:qu,:o)" + tail),
                   {"m": ln.get("material_code") or "",
                    "p": ln.get("product_code") or "",
                    "b": ln.get("batch_no") or "",
                    "l": ln.get("loc") or "", "q": signed, "d": signed,
                    "av": in_avail, "qu": in_quar, "o": owner})
        # 入库类过账顺带建批次档案:效期=保质天数推算,供临期预警用
        if is_in and ln.get("batch_no") and ln.get("material_code"):
            shelf = db.execute(text("SELECT shelf_life_days,manage_mode"
                                    " FROM mat_master"
                                    " WHERE material_code=:m"),
                               {"m": ln.get("material_code")}).mappings().first()
            exp = None
            if shelf and shelf.get("shelf_life_days"):
                try:
                    import datetime as _dt
                    exp = (_dt.date.today() +
                           _dt.timedelta(
                               days=int(shelf["shelf_life_days"]))).isoformat()
                except (ValueError, TypeError, OverflowError):
                    exp = None
            db.execute(text("INSERT INTO batch(batch_no,material_code,"
                            "source_doc_no,created_by,expire_date)"
                            " VALUES(:b,:m,:d,:y,:e)" +
                            dialect.upsert_tail(["batch_no"], ["expire_date"])),
                       {"b": ln.get("batch_no"), "m": ln.get("material_code"),
                        "d": doc_no, "y": by_user, "e": exp})
            # 一物一码(CODE模式)按件生成单件条码,打印即记;非CODE模式只建批次
            if (shelf and str(shelf.get("manage_mode") or "QTY").upper()
                    == "CODE"):
                whole = int(qty) if qty == int(qty) else 0
                cap = min(whole, 500)
                prefix = "%s-%s" % (doc_no, line["line_no"])
                for seq in range(1, cap + 1):
                    code = "SB%s-%04d" % (prefix, seq)
                    db.execute(text(dialect.insert_ignore_prefix() +
                                    " INTO material_item(barcode,"
                                    "material_code,batch_no,source_doc_no,"
                                    "status) VALUES(:b,:m,:t,:d,'在库')" +
                                    dialect.insert_ignore_suffix(["barcode"])),
                               {"b": code, "m": ln.get("material_code"),
                                "t": ln.get("batch_no"), "d": doc_no})
                    db.execute(text("INSERT INTO label_print(code,kind,"
                                    "content,printed_by) VALUES(:b,'单件',:c,:y)"),
                               {"b": code, "c": ("%s/%s/第%s件" %
                                                 (ln.get("material_code"),
                                                  ln.get("batch_no"), seq)),
                                "y": by_user})
    db.execute(text("UPDATE doc_main SET biz_status='POSTED' WHERE doc_no=:d"),
               {"d": doc_no})
    db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,biz_type,result)"
                    " VALUES(:y,'过账',:d,:z,'已完成')"),
               {"y": by_user, "d": doc_no, "z": dtype})
    return "POSTED"

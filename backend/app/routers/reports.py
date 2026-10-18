"""报表与审计只读口:生成草稿/发布/扫码日志/审计日志/流程实例.报表只读不改账."""
import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting, rptcalc
from app.core.db import get_db

router = APIRouter()


@router.get("/rpt_configs")
def rpt_configs(authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT rpt_code,category,period_type,scope_cfg,auto_cron"
                           " FROM rpt_config")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/rpt_live")
def rpt_live(rpt_code: str, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    """12类报表真数直出(不落实例),给报表中心页即时预览用.只读."""
    calc = rptcalc.REPORTS.get(str(rpt_code or ""))
    if not calc:
        return resp.fail(400, "未知报表编码")
    data = calc(db)
    head = list(data[0].keys()) if data else []
    return resp.ok({"rpt_code": rpt_code, "head": head, "rows": data},
                   total=len(data))


@router.get("/rpt_instances")
def rpt_instances(rpt_code: str = "", authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db), page: int = 1,
                  page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    cond, args = "1=1", {}
    if rpt_code:
        cond += " AND rpt_code=:c"
        args["c"] = rpt_code
    total = db.execute(text("SELECT COUNT(*) c FROM rpt_instance WHERE " + cond),
                       args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT rpt_no,rpt_code,period,biz_status,"
                           "generated_by,at FROM rpt_instance WHERE " + cond +
                           " ORDER BY at DESC LIMIT :n OFFSET :o"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.post("/rpt_instances/generate")
def generate(body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    rpt_code = str(body.get("rpt_code") or "")
    if not rpt_code:
        return resp.fail(400, "报表编码必填")
    calc = rptcalc.REPORTS.get(rpt_code)
    if not calc:
        return resp.fail(400, "未知报表编码(12类:收发存/余额/领退/调仓/"
                              "成品/报废/库龄/对账/日报/差异/完工/损耗)")
    data = calc(db)
    db.rollback()
    with db.begin():
        rpt_no = posting.make_doc_no(db, "RPT")
        db.execute(text("INSERT INTO rpt_instance(rpt_no,rpt_code,period,"
                        "biz_status,content_ref,generated_by)"
                        " VALUES(:n,:c,:p,'草稿',:r,:y)"),
                   {"n": rpt_no, "c": rpt_code,
                    "p": str(body.get("period") or ""),
                    "r": json.dumps(data, ensure_ascii=False)[:8000],
                    "y": authed.get("username") or ""})
    return resp.ok({"rpt_no": rpt_no, "biz_status": "草稿",
                    "rows": len(data), "preview": data[:10]})


@router.post("/rpt_instances/{no}/publish")
def publish(no: str, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    with db.begin():
        hit = db.execute(text("UPDATE rpt_instance SET biz_status='发布'"
                              " WHERE rpt_no=:n AND biz_status='草稿'"), {"n": no})
    if not hit.rowcount:
        return resp.fail(403, "FLOW_STATE_DENIED:仅草稿可发布")
    return resp.ok({"rpt_no": no, "biz_status": "发布"})


@router.get("/system/scan_logs")
def scan_logs(code: str = "", authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1, page_size: int = 50):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if code:
        cond = "code=:c"
        args["c"] = code
    total = db.execute(text("SELECT COUNT(*) c FROM scan_log WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT id,code,result,doc_no,by_user,device,at"
                           " FROM scan_log WHERE " + cond +
                           " ORDER BY id DESC LIMIT :n OFFSET :o"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/system/audit_logs")
def audit_logs(doc_no: str = "", authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db), page: int = 1, page_size: int = 50):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if doc_no:
        cond = "doc_no=:d"
        args["d"] = doc_no
    total = db.execute(text("SELECT COUNT(*) c FROM audit_log WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT id,`at`,by_user,action,doc_no,biz_type,result,"
                           "o_val,n_val,device FROM audit_log WHERE " + cond +
                           " ORDER BY id DESC LIMIT :o,:n"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


@router.get("/flow_instances")
def flow_instances(doc_no: str = "", authed: dict = Depends(auth.need_auth),
                   db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    args, cond = {}, "1=1"
    if doc_no:
        cond = "doc_no=:d"
        args["d"] = doc_no
    total = db.execute(text("SELECT COUNT(*) c FROM flow_instance WHERE " + cond), args).scalar() or 0
    args.update({"o": (p - 1) * s, "n": s})
    rows = db.execute(text("SELECT doc_no,flow_key,cur_step,flow_status,approver"
                           " FROM flow_instance WHERE " + cond + " LIMIT :o,:n"),
                      args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=int(total))


# ---------------------------------------------------------------------------
# 打印报表模板(★报表自定义):列表/详情/新增/修改/删除/渲染.
# 入库验收单(RK)/领用签字单(LY)/调拨确认单(DB)等打印报表的列、标题、表头表脚均可定义修改.
# ---------------------------------------------------------------------------
_COL_KEYS = ("line_no", "material_code", "product_code", "batch_no", "qty",
             "unit", "loc", "o_loc", "n_loc", "o_qty", "n_qty", "qc_result",
             "reason", "bom_version")


def _tpl_row(r):
    d = dict(r)
    try:
        d["columns"] = json.loads(d.pop("columns_cfg") or "[]")
    except (ValueError, TypeError):
        d["columns"] = []
    return d


@router.get("/print_templates")
def print_templates(doc_type: str = "", authed: dict = Depends(auth.need_auth),
                    db: Session = Depends(get_db)):
    cond, args = "1=1", {}
    if doc_type:
        cond += " AND doc_type=:t"
        args["t"] = doc_type
    rows = db.execute(text("SELECT tpl_code,name,doc_type,title,header_note,"
                           "footer_note,columns_cfg,enabled,updated_at"
                           " FROM print_template WHERE " + cond +
                           " ORDER BY doc_type,tpl_code"),
                      args).mappings().all()
    return resp.ok([_tpl_row(r) for r in rows], total=len(rows))


@router.get("/print_templates/{tpl_code}")
def print_template_detail(tpl_code: str, authed: dict = Depends(auth.need_auth),
                          db: Session = Depends(get_db)):
    r = db.execute(text("SELECT tpl_code,name,doc_type,title,header_note,"
                        "footer_note,columns_cfg,enabled,updated_at"
                        " FROM print_template WHERE tpl_code=:c"),
                   {"c": tpl_code}).mappings().first()
    if not r:
        return resp.fail(404, "模板不存在")
    return resp.ok(_tpl_row(r))


def _clean_cols(cols):
    out = []
    for c in cols or []:
        k = str(c.get("k") or "")
        if k not in _COL_KEYS:
            continue
        out.append({"k": k, "label": str(c.get("label") or k),
                    "w": int(c.get("w") or 100)})
    return out


@router.post("/print_templates")
def print_template_create(body: dict, authed: dict = Depends(auth.need_auth),
                          db: Session = Depends(get_db)):
    if not body.get("name") or not body.get("doc_type"):
        return resp.fail(400, "模板名称与适用单据必填")
    cols = _clean_cols(body.get("columns"))
    if not cols:
        return resp.fail(400, "至少定义一列(字段名须合法)")
    db.rollback()
    with db.begin():
        tpl_code = posting.make_doc_no(db, "PT")
        db.execute(text("INSERT INTO print_template(tpl_code,name,doc_type,"
                        "title,header_note,footer_note,columns_cfg,enabled)"
                        " VALUES(:c,:n,:t,:ti,:h,:f,:cols,:e)"),
                   {"c": tpl_code, "n": body["name"], "t": body["doc_type"],
                    "ti": str(body.get("title") or body["name"]),
                    "h": str(body.get("header_note") or ""),
                    "f": str(body.get("footer_note") or ""),
                    "cols": json.dumps(cols, ensure_ascii=False),
                    "e": 1 if body.get("enabled", True) else 0})
    return resp.ok({"tpl_code": tpl_code})


@router.put("/print_templates/{tpl_code}")
def print_template_update(tpl_code: str, body: dict,
                          authed: dict = Depends(auth.need_auth),
                          db: Session = Depends(get_db)):
    cur = db.execute(text("SELECT tpl_code FROM print_template WHERE tpl_code=:c"),
                     {"c": tpl_code}).mappings().first()
    if not cur:
        return resp.fail(404, "模板不存在")
    cols = _clean_cols(body.get("columns"))
    if not cols:
        return resp.fail(400, "至少定义一列(字段名须合法)")
    db.rollback()
    with db.begin():
        db.execute(text("UPDATE print_template SET name=:n,doc_type=:t,title=:ti,"
                        "header_note=:h,footer_note=:f,columns_cfg=:cols,"
                        "enabled=:e,updated_at=NOW() WHERE tpl_code=:c"),
                   {"n": body.get("name") or tpl_code, "t": body.get("doc_type"),
                    "ti": str(body.get("title") or ""),
                    "h": str(body.get("header_note") or ""),
                    "f": str(body.get("footer_note") or ""),
                    "cols": json.dumps(cols, ensure_ascii=False),
                    "e": 1 if body.get("enabled", True) else 0, "c": tpl_code})
    return resp.ok({"tpl_code": tpl_code, "updated": True})


@router.delete("/print_templates/{tpl_code}")
def print_template_delete(tpl_code: str, authed: dict = Depends(auth.need_auth),
                          db: Session = Depends(get_db)):
    db.rollback()
    with db.begin():
        hit = db.execute(text("DELETE FROM print_template WHERE tpl_code=:c"),
                         {"c": tpl_code})
    if not hit.rowcount:
        return resp.fail(404, "模板不存在")
    return resp.ok({"tpl_code": tpl_code, "deleted": True})


@router.get("/print_templates/{tpl_code}/render")
def print_template_render(tpl_code: str, doc_no: str,
                          authed: dict = Depends(auth.need_auth),
                          db: Session = Depends(get_db)):
    """按模板+单据渲染打印数据(标题/表头/表脚/列/行).只读,不改账."""
    tpl = db.execute(text("SELECT tpl_code,name,doc_type,title,header_note,"
                          "footer_note,columns_cfg FROM print_template"
                          " WHERE tpl_code=:c"),
                     {"c": tpl_code}).mappings().first()
    if not tpl:
        return resp.fail(404, "模板不存在")
    doc = db.execute(text("SELECT doc_no,type,handler,biz_status,`at`,"
                          "partner_id FROM doc_main WHERE doc_no=:d"),
                     {"d": doc_no}).mappings().first()
    if not doc:
        return resp.fail(404, "单据不存在")
    lines = db.execute(text("SELECT line_no,material_code,product_code,batch_no,"
                            "qty,unit,loc,o_loc,n_loc,o_qty,n_qty,qc_result,"
                            "reason,bom_version FROM doc_line WHERE doc_no=:d"
                            " ORDER BY line_no"),
                       {"d": doc_no}).mappings().all()
    cols = _tpl_row(tpl)["columns"]
    first_loc = lines[0]["loc"] if lines else ""
    repl = {"{doc_no}": doc["doc_no"], "{handler}": doc["handler"] or "",
            "{at}": str(doc["at"] or ""), "{wh}": first_loc or "",
            "{loc}": first_loc or "", "{to_wh}": "", "{status}": doc["biz_status"]}

    def fill(s):
        s = str(s or "")
        for k, v in repl.items():
            s = s.replace(k, v)
        return s

    rows = []
    for ln in lines:
        d = dict(ln)
        rows.append({c["k"]: str(d.get(c["k"]) if d.get(c["k"]) is not None else "")
                     for c in cols})
    return resp.ok({"tpl_code": tpl["tpl_code"], "doc_no": doc["doc_no"],
                    "title": fill(tpl["title"]), "header": fill(tpl["header_note"]),
                    "footer": fill(tpl["footer_note"]), "columns": cols,
                    "rows": rows}, total=len(rows))

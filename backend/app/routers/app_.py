"""PDA端 app 路由:登录/待办/清单/提交/补传.与 api-client.js 对齐.
扫码解析(scan/lookup)在 app_scan.py;本文件保持<=300行.
注意:移动端不做OCR,仅提供扫码与清单确认节点;OCR 由 PC 端 /ai/ocr 处理."""
import hashlib
import json
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, ratelimit, posting
from app.core.db import get_db
from app.routers.app_scan import mat_of_code as _mat_of_code
from app.routers.app_scan import loc_of_code as _loc_of_code
from app.routers.app_scan import parse_label as _parse_label

router = APIRouter()

# 移动端业务码 -> 单据类型(仅映射系统已定义的过账类型)
# SCAN 为移动端"扫码即入库"默认业务码(等价 RK),避免现场扫码后无处可落.
_BIZ2TYPE = {"DJ": "DJ", "RK": "RK", "SCAN": "RK", "LY": "LY",
             "TL": "TL", "TK": "TK"}
# 单据类型 -> 中文名(供前端提示;DJ=物料登记,RK=入库,LY=领用,TL=调仓领用,TK=退库)
_BIZ_NAME = {"DJ": "物料登记", "RK": "入库", "LY": "领用", "TL": "调仓领用",
             "TK": "退库"}


def _hash_pwd(pwd):
    return hashlib.sha256(("wms:" + str(pwd or "")).encode()).hexdigest()


@router.post("/login")
def app_login(body: dict, db: Session = Depends(get_db)):
    """PDA 专用登录:校验 sys_user 密码,签发 device=PDA-03 的设备令牌.
    令牌自带 device,即使不带 X-Device-Id 头也能通过 need_app_device."""
    username = str(body.get("username") or "").strip()
    pwd = body.get("password") or ""
    rl_key = "applogin:" + username
    blocked, retry = ratelimit.is_blocked(rl_key)
    if blocked:
        return resp.fail(429, "尝试过于频繁，请 %d 秒后再试" % retry)
    row = db.execute(text("SELECT username,name,password_hash,enabled"
                          " FROM sys_user WHERE username=:u"),
                     {"u": username}).mappings().first()
    if not row or int(row["enabled"] or 0) != 1:
        ratelimit.record_fail(rl_key)
        return resp.fail(401, "TOKEN_INVALID:账号不存在或已停用")
    if not row["password_hash"] or row["password_hash"] != _hash_pwd(pwd):
        ratelimit.record_fail(rl_key)
        return resp.fail(401, "TOKEN_INVALID:密码错误")
    ratelimit.clear(rl_key)
    token = auth.issue_token(username, device="PDA-03")
    return resp.ok({"token": token, "name": row["name"],
                    "username": username, "device": "PDA-03"})


@router.get("/todos")
def todos(mine: int = 1, authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    auth.need_app_device(authed)
    rows = db.execute(text("SELECT doc_no,type,biz_status,handler,at FROM doc_main"
                           " WHERE biz_status IN ('DRAFT','APPROVING')"
                           " ORDER BY at DESC LIMIT 20")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/checklists")
def checklist(orderId: str = "", authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT doc_line.doc_no,doc_line.line_no,"
                           "doc_line.material_code,doc_line.qty,doc_line.unit,"
                           "doc_line.loc,doc_line.batch_no,COALESCE(m.name,'') name"
                           " FROM doc_line LEFT JOIN mat_master m"
                           " ON m.material_code=doc_line.material_code"
                           " WHERE doc_line.doc_no=:d ORDER BY doc_line.line_no"),
                      {"d": orderId}).mappings().all()
    # delivery_qty 与 qty 同源(单据行数量=应收),前端按 delivery_qty/received_qty 比差异
    items = [dict(r, checked=False, delivery_qty=float(r["qty"] or 0),
                  received_qty=float(r["qty"] or 0)) for r in rows]
    return resp.ok({"orderId": orderId, "items": items}, total=len(items))


@router.post("/checklists/confirm")
def confirm(body: dict, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    items = body.get("items") or []
    if not items:
        return resp.fail(400, "CHECKLIST_EMPTY:验收清单不能为空")
    # 以服务端单据行数量为准补齐应收数(前端漏传 delivery_qty 时也能判差异)
    order_id = str(body.get("orderId") or "").strip()
    delivery = {}
    if order_id:
        # 读单据行数量:与写库分处两个事务(读用独立连接,写再 rollback+begin),
        # 避免同一 Session 上 SELECT 开事务后又 with db.begin() 报"事务已开启".
        db.rollback()
        for r in db.execute(text("SELECT line_no,material_code,qty FROM doc_line"
                                 " WHERE doc_no=:d ORDER BY line_no"),
                            {"d": order_id}).mappings().all():
            delivery[(r["line_no"], r["material_code"])] = float(r["qty"] or 0)
            delivery.setdefault(r["material_code"], float(r["qty"] or 0))
        db.rollback()
    for item in items:
        if not item.get("checked"):
            return resp.fail(400, "CHECKLIST_INCOMPLETE:请逐项确认")
        if item.get("delivery_qty") is None:
            key = (item.get("line_no"), item.get("material_code"))
            dq = delivery.get(key)
            if dq is None:
                dq = delivery.get(item.get("material_code"))
            if dq is not None:
                item = dict(item, delivery_qty=dq)
        if _has_diff(item) and not str(item.get("reason") or "").strip():
            return resp.fail(400, "DIFF_REASON_REQUIRED:差异必须填原因")
    with db.begin():
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result)"
                        " VALUES(:u,'清单确认',:d,'已完成')"),
                   {"u": authed["username"], "d": order_id})
    return resp.ok({"orderId": body.get("orderId"), "status": "ACCEPTED"})


def _default_unit(db, material_code):
    r = db.execute(text("SELECT base_unit FROM mat_master WHERE material_code=:m"),
                   {"m": material_code}).first()
    return (r[0] if r else "") or ""


def _has_diff(item: dict) -> bool:
    """验收行是否有数量差异.
    口径与前端一致:前端显式给 diff=true 视为有差异;否则比较实收/应收,
    任一存在且不相等即算差异(只比数量,不比其它字段)."""
    if item.get("diff"):
        return True
    recv = item.get("received_qty")
    deli = item.get("delivery_qty")
    if recv is None or deli is None:
        return False
    try:
        return abs(float(recv) - float(deli)) > 1e-9
    except (TypeError, ValueError):
        return False


@router.post("/submit")
def submit(body: dict, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    """PDA 提交:按 payload 真实建单(不再返回伪造单号).
    - payload.lines 每条解析出 物料/数量/单位:给了 code 就按条码(单件码→物料+批次)
      或物料编码解析;quantity 缺省取 1(现场"扫一件记一件"口径);
      unit 缺省取主档基本单位;loc 可由 loc/库位码带出;
    - 资料不全或业务码不明:入 sync_queue 待补全,如实返回 queued=true+原因;
    - 资料齐全:draft 只建草稿;否则 建单→提交→审批→过账,返回真实单号与状态.
    """
    raw = body.get("lines") or []
    if not raw and body.get("codes"):
        # 兼容只给条码数组的旧前端:每条按 1 件入库
        raw = [{"code": c, "qty": 1} for c in (body.get("codes") or [])
               if str(c or "").strip()]
    valid = []
    for ln in (raw if isinstance(raw, list) else [])[:50]:
        if not isinstance(ln, dict):
            continue
        m = str(ln.get("material_code") or "").strip()
        batch = str(ln.get("batch_no") or "").strip()
        code = str(ln.get("code") or "").strip()
        if not m and code:
            hit = _mat_of_code(db, code)
            if hit:
                m = hit["material_code"]
                batch = batch or hit.get("batch_no") or ""
        if not m and code:
            # 二维码里的整串标签文本:从"键=值"里抽物料编码/数量/批次/库位
            f = _parse_label(code)
            if f.get("material_code"):
                m = f["material_code"]
                batch = batch or f.get("batch_no", "")
            if f.get("loc") and not str(ln.get("loc") or "").strip():
                ln = dict(ln, loc=f["loc"])
            if f.get("qty") and not ln.get("qty"):
                ln = dict(ln, qty=f["qty"])
        if not m:
            continue
        try:
            q = float(ln.get("qty") or 0)
        except (TypeError, ValueError):
            q = 0.0
        if q <= 0:
            # 现场"扫一件记一件":未填数量时按 1 件计,避免整单因漏填数量而进待补全队列
            q = 1.0
        u = str(ln.get("unit") or "").strip() or _default_unit(db, m)
        if not u:
            continue
        loc = str(ln.get("loc") or "").strip()
        if not loc:
            lrow = _loc_of_code(db, code)
            if lrow:
                loc = lrow["loc_code"]
        valid.append({"material_code": m, "qty": q, "unit": u,
                      "loc": loc, "batch_no": batch})
    dtype = _BIZ2TYPE.get(str(body.get("biz") or "").upper())
    if not valid or not dtype:
        db.rollback()
        with db.begin():
            db.execute(text("INSERT INTO sync_queue(payload,biz_status)"
                            " VALUES(:p,'PENDING')"),
                       {"p": json.dumps({"reason": "lines_incomplete",
                                         "biz": body.get("biz"),
                                         "raw": raw}, ensure_ascii=False)[:2000]})
        return resp.ok({"queued": True, "doc_no": "",
                        "msg": "资料不全已暂存待补全(需物料/数量/单位)"})
    user = authed["username"]
    db.rollback()
    with db.begin():
        doc_no = posting.create(db, dtype, user, valid)
        # 把本次扫码命中码挂到本单(单据↔扫码互查).
        # 必须与建单同一事务:放外面会被后续 db.rollback() 回滚,导致 doc_no 为空.
        for ln in (raw if isinstance(raw, list) else [])[:50]:
            c = str((ln or {}).get("code") or "").strip()
            if c:
                db.execute(text("UPDATE scan_log SET doc_no=:d"
                                " WHERE code=:c AND (doc_no IS NULL OR doc_no='')"),
                           {"d": doc_no, "c": c})
    if body.get("draft"):
        return resp.ok({"doc_no": doc_no, "biz_status": "DRAFT", "queued": False,
                        "biz": dtype, "biz_name": _BIZ_NAME.get(dtype, dtype),
                        "lines": len(valid)})
    try:
        db.rollback()
        with db.begin():
            posting.submit(db, doc_no)
        db.rollback()
        with db.begin():
            posting.approve(db, doc_no, True, user, "PDA提交自动过账")
        db.rollback()
        with db.begin():
            state = posting.post(db, doc_no, dtype, user, authed.get("device", ""))
    except ValueError as err:
        return resp.fail(403, "过账被拒:%s(单号 %s 已保存待人工处理)"
                         % (str(err)[:120], doc_no))
    except Exception as err:  # noqa: BLE001
        return resp.fail(500, "过账异常:%s(单号 %s 已建)"
                         % (str(err)[:120], doc_no))
    if state in ("404", "LOCKED"):
        return resp.fail(403, "过账失败:%s(单号 %s)" % (state, doc_no))
    return resp.ok({"doc_no": doc_no, "biz_status": state, "queued": False,
                    "biz": dtype, "biz_name": _BIZ_NAME.get(dtype, dtype),
                    "lines": len(valid)})


@router.post("/sync/flush")
def flush(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    with db.begin():
        hit = db.execute(text("UPDATE sync_queue SET biz_status='SENT'"
                              " WHERE biz_status='PENDING'"))
    return resp.ok({"msg": "队列已补传", "count": hit.rowcount})

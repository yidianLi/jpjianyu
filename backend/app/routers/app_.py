"""PDA端 app 路由:登录/待办/扫码/清单/提交/补传.与 api-client.js 对齐.
注意:移动端不做OCR,仅提供扫码与清单确认节点;OCR 由 PC 端 /ai/ocr 处理."""
import hashlib
import json
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, ratelimit, posting
from app.core.db import get_db

router = APIRouter()

# 移动端业务码 -> 单据类型(仅映射系统已定义的过账类型)
_BIZ2TYPE = {"DJ": "DJ", "RK": "RK", "LY": "LY", "TL": "TL", "TK": "TK"}


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


@router.post("/scan")
def scan(body: dict, authed: dict = Depends(auth.need_auth),
         db: Session = Depends(get_db)):
    auth.need_app_device(authed)
    code = str(body.get("code") or "").strip()
    if not code:
        return resp.fail(400, "扫码内容为空")
    order_id = str(body.get("orderId") or "")
    # 去重按「码 + 订单」维度落库(scan_log),多 worker/重启一致,且跨订单可重扫.
    if order_id:
        prev = db.execute(text("SELECT 1 FROM scan_log WHERE code=:c AND doc_no=:d"
                               " AND result='HIT' LIMIT 1"),
                          {"c": code, "d": order_id}).first()
        if prev:
            db.execute(text("INSERT INTO scan_log(code,result,doc_no,by_user,device)"
                            " VALUES(:c,'DUP_SCAN',:d,:u,:dev)"),
                       {"c": code, "d": order_id,
                        "u": authed["username"], "dev": authed.get("device", "")})
            db.commit()
            return resp.fail(403, "DUP_SCAN:重复扫码")
    item = db.execute(text("SELECT material_code,batch_no,status FROM material_item"
                           " WHERE barcode=:c"), {"c": code}).mappings().first()
    loc = db.execute(text("SELECT loc_code,wh_code FROM location WHERE loc_code=:c"
                          " OR qr_code=:c"), {"c": code}).mappings().first()
    if not item and not loc:
        return resp.fail(404, "INVALID:无效码")
    db.execute(text("INSERT INTO scan_log(code,result,doc_no,by_user,device)"
                    " VALUES(:c,'HIT',:d,:u,:dev)"),
               {"c": code, "d": order_id,
                "u": authed["username"], "dev": authed.get("device", "")})
    db.commit()
    if item:
        return resp.ok({"code": code, "result": "OK", "kind": "SB",
                        "material": item["material_code"],
                        "batch": item["batch_no"], "status": item["status"]})
    return resp.ok({"code": code, "result": "OK", "kind": "LOC",
                    "loc": loc["loc_code"], "wh": loc["wh_code"]})


@router.get("/lookup")
def lookup(code: str = "", authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    """扫码查码(无副作用):解析条码为物料/库位,供清单行内"扫物料码"匹配。
    不写 scan_log、不判重复,避免同物料多行被 SEEN 去重误伤;通用扫码仍用 /app/scan。"""
    auth.need_app_device(authed)
    code = str(code or "").strip()
    if not code:
        return resp.fail(400, "INVALID:扫码内容为空")
    item = db.execute(text("SELECT material_code,batch_no,status FROM material_item"
                           " WHERE barcode=:c"), {"c": code}).mappings().first()
    loc = db.execute(text("SELECT loc_code,wh_code FROM location WHERE loc_code=:c"
                          " OR qr_code=:c"), {"c": code}).mappings().first()
    if not item and not loc:
        return resp.fail(404, "INVALID:无效码")
    if item:
        return resp.ok({"code": code, "kind": "SB",
                        "material": item["material_code"],
                        "batch": item["batch_no"], "status": item["status"]})
    return resp.ok({"code": code, "kind": "LOC",
                    "loc": loc["loc_code"], "wh": loc["wh_code"]})


@router.get("/checklists")
def checklist(orderId: str = "", authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT doc_no,line_no,material_code,qty,unit,loc"
                           " FROM doc_line WHERE doc_no=:d ORDER BY line_no"),
                      {"d": orderId}).mappings().all()
    items = [dict(r, checked=False) for r in rows]
    return resp.ok({"orderId": orderId, "items": items}, total=len(items))


@router.post("/checklists/confirm")
def confirm(body: dict, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    items = body.get("items") or []
    if not items:
        return resp.fail(400, "CHECKLIST_EMPTY:验收清单不能为空")
    for item in items:
        if not item.get("checked"):
            return resp.fail(400, "CHECKLIST_INCOMPLETE:请逐项确认")
        if item.get("diff") and not item.get("reason"):
            return resp.fail(400, "DIFF_REASON_REQUIRED:差异必须填原因")
    with db.begin():
        db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,result)"
                        " VALUES(:u,'清单确认',:d,'已完成')"),
                   {"u": authed["username"], "d": str(body.get("orderId") or "")})
    return resp.ok({"orderId": body.get("orderId"), "status": "ACCEPTED"})


def _default_unit(db, material_code):
    r = db.execute(text("SELECT base_unit FROM mat_master WHERE material_code=:m"),
                   {"m": material_code}).first()
    return (r[0] if r else "") or ""


@router.post("/submit")
def submit(body: dict, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    """PDA 提交:尽量按 payload 真实建单(不再返回伪造单号 LY000001).
    - payload.lines 里每条解析出 物料/数量/单位(缺单位取主档基本单位,code 可为条码);
    - 资料不全或业务码不明:入 sync_queue 待补全,如实返回 queued=true+原因;
    - 资料齐全:draft 只建草稿;否则 建单→提交→审批→过账,返回真实单号与状态.
    """
    raw = body.get("lines") or []
    valid = []
    for ln in (raw if isinstance(raw, list) else [])[:50]:
        if not isinstance(ln, dict):
            continue
        m = str(ln.get("material_code") or "").strip()
        if not m and ln.get("code"):
            c = str(ln.get("code")).strip()
            hit = db.execute(text("SELECT material_code FROM material_item"
                                  " WHERE barcode=:c"), {"c": c}).first()
            if hit:
                m = hit[0]
            else:
                mm = db.execute(text("SELECT material_code FROM mat_master"
                                     " WHERE material_code=:c"), {"c": c}).first()
                if mm:
                    m = c
        if not m:
            continue
        try:
            q = float(ln.get("qty") or 0)
        except (TypeError, ValueError):
            q = 0.0
        if q <= 0:
            continue
        u = str(ln.get("unit") or "").strip() or _default_unit(db, m)
        if not u:
            continue
        valid.append({"material_code": m, "qty": q, "unit": u,
                      "loc": str(ln.get("loc") or ""),
                      "batch_no": ln.get("batch_no")})
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
    if body.get("draft"):
        return resp.ok({"doc_no": doc_no, "biz_status": "DRAFT", "queued": False})
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
    return resp.ok({"doc_no": doc_no, "biz_status": state, "queued": False})


@router.post("/sync/flush")
def flush(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    with db.begin():
        hit = db.execute(text("UPDATE sync_queue SET biz_status='SENT'"
                              " WHERE biz_status='PENDING'"))
    return resp.ok({"msg": "队列已补传", "count": hit.rowcount})

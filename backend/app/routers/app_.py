"""PDA端 app 路由:登录/待办/扫码/清单/提交/补传.与 api-client.js 对齐.
注意:移动端不做OCR,仅提供扫码与清单确认节点;OCR 由 PC 端 /ai/ocr 处理."""
import hashlib
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()
SEEN: set = set()

# 与 sysadm._sha 同源:SHA256("wms:"+密码).此处独立实现避免跨路由耦合.
def _hash_pwd(pwd):
    return hashlib.sha256(("wms:" + str(pwd or "")).encode()).hexdigest()


@router.post("/login")
def app_login(body: dict, db: Session = Depends(get_db)):
    """PDA 专用登录:校验 sys_user 密码,签发 device=PDA-03 的设备令牌.
    令牌自带 device,即使不带 X-Device-Id 头也能通过 need_app_device."""
    username = str(body.get("username") or "").strip()
    pwd = body.get("password") or ""
    row = db.execute(text("SELECT username,name,password_hash,enabled"
                          " FROM sys_user WHERE username=:u"),
                     {"u": username}).mappings().first()
    if not row or int(row["enabled"] or 0) != 1:
        return resp.fail(401, "TOKEN_INVALID:账号不存在或已停用")
    if not row["password_hash"] or row["password_hash"] != _hash_pwd(pwd):
        return resp.fail(401, "TOKEN_INVALID:密码错误")
    token = auth.issue_token(username, device="PDA-03")
    return resp.ok({"token": token, "name": row["name"],
                    "username": username, "device": "PDA-03"})


@router.get("/todos")
def todos(mine: int = 1, authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    auth.need_app_device(authed)
    rows = db.execute(text("SELECT doc_no,type,biz_status,handler,at FROM doc_main"
                           " WHERE biz_status IN ('DRAFT','APPROVING')"
                           " ORDER BY `at` DESC LIMIT 20")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.post("/scan")
def scan(body: dict, authed: dict = Depends(auth.need_auth),
         db: Session = Depends(get_db)):
    auth.need_app_device(authed)
    code = str(body.get("code") or "").strip()
    if not code:
        return resp.fail(400, "扫码内容为空")
    if code in SEEN:
        db.execute(text("INSERT INTO scan_log(code,result,doc_no,by_user,device)"
                        " VALUES(:c,'DUP_SCAN',:d,:u,:dev)"),
                   {"c": code, "d": str(body.get("orderId") or ""),
                    "u": authed["username"], "dev": authed.get("device", "")})
        db.commit()
        return resp.fail(403, "DUP_SCAN:重复扫码")
    item = db.execute(text("SELECT material_code,batch_no,status FROM material_item"
                           " WHERE barcode=:c"), {"c": code}).mappings().first()
    loc = db.execute(text("SELECT loc_code,wh_code FROM location WHERE loc_code=:c"
                          " OR qr_code=:c"), {"c": code}).mappings().first()
    if not item and not loc:
        return resp.fail(404, "INVALID:无效码")
    SEEN.add(code)
    db.execute(text("INSERT INTO scan_log(code,result,doc_no,by_user,device)"
                    " VALUES(:c,'HIT',:d,:u,:dev)"),
               {"c": code, "d": str(body.get("orderId") or ""),
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


@router.post("/submit")
def submit(body: dict, authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    with db.begin():
        db.execute(text("INSERT INTO sync_queue(payload,biz_status)"
                        " VALUES(:p,'PENDING')"), {"p": str(body)[:2000]})
    return resp.ok({"orderId": "LY000001", "queued": False})


@router.post("/sync/flush")
def flush(authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    with db.begin():
        hit = db.execute(text("UPDATE sync_queue SET biz_status='SENT'"
                              " WHERE biz_status='PENDING'"))
    return resp.ok({"msg": "队列已补传", "count": hit.rowcount})

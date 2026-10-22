"""PDA 扫码解析:scan(带副作用,写扫码日志) + lookup(无副作用,只查码).
从 app_.py 拆出,保持单文件<=300行;被 main.py 挂到 /api/v1/app 前缀."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()


def mat_of_code(db, code: str):
    """条码 -> (material_code, batch_no, name, unit). 依次试单件条码/物料编码."""
    code = str(code or "").strip()
    if not code:
        return None
    row = db.execute(text(
        "SELECT i.material_code,i.batch_no,COALESCE(m.name,'') name,"
        "COALESCE(m.base_unit,'') unit FROM material_item i"
        " LEFT JOIN mat_master m ON m.material_code=i.material_code"
        " WHERE i.barcode=:c"), {"c": code}).mappings().first()
    if row:
        return dict(row)
    row = db.execute(text(
        "SELECT material_code,name,base_unit unit FROM mat_master"
        " WHERE material_code=:c"), {"c": code}).mappings().first()
    if row:
        return {"material_code": row["material_code"], "batch_no": "",
                "name": row["name"], "unit": row["unit"]}
    return None


def loc_of_code(db, code: str):
    """条码 -> 库位行(loc_code/wh_code/zone_label)."""
    code = str(code or "").strip()
    if not code:
        return None
    row = db.execute(text(
        "SELECT loc_code,wh_code,COALESCE(zone_label,'') zone_label FROM location"
        " WHERE loc_code=:c OR qr_code=:c LIMIT 1"), {"c": code}).mappings().first()
    return dict(row) if row else None


def doc_of_code(db, code: str):
    """扫描"单据码"(单据号/单号二维码) -> 单据头行.
    现场扫单据打印出的单号条码即可绑定到该单据,无需手输."""
    code = str(code or "").strip()
    if not code:
        return None
    row = db.execute(text(
        "SELECT doc_no,type,biz_status FROM doc_main WHERE doc_no=:c"),
        {"c": code}).mappings().first()
    return dict(row) if row else None


@router.post("/scan")
def scan(body: dict, authed: dict = Depends(auth.need_auth),
         db: Session = Depends(get_db)):
    auth.need_app_device(authed)
    code = str(body.get("code") or "").strip()
    if not code:
        return resp.fail(400, "扫码内容为空")
    order_id = str(body.get("orderId") or "")
    # 扫单据码:只回单据信息,不写物料扫码日志(单据码不是物料码)
    doc = doc_of_code(db, code)
    if doc:
        return resp.ok({"code": code, "result": "OK", "kind": "DOC",
                        "doc_no": doc["doc_no"], "doc_type": doc["type"],
                        "biz_status": doc["biz_status"]})
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
        mat = db.execute(text("SELECT COALESCE(name,'') name,"
                              "COALESCE(base_unit,'') unit FROM mat_master"
                              " WHERE material_code=:m"),
                         {"m": item["material_code"]}).mappings().first()
        return resp.ok({"code": code, "result": "OK", "kind": "SB",
                        "material": item["material_code"],
                        "batch": item["batch_no"], "status": item["status"],
                        "name": (mat or {})["name"], "unit": (mat or {})["unit"]})
    return resp.ok({"code": code, "result": "OK", "kind": "LOC",
                    "loc": loc["loc_code"], "wh": loc["wh_code"]})


@router.get("/lookup")
def lookup(code: str = "", authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db)):
    """扫码查码(无副作用):解析条码为 物料/库位/单据,供清单行内"扫物料码"匹配.
    不写 scan_log、不判重复,避免同物料多行被 SEEN 去重误伤;通用扫码仍用 /app/scan。
    kind:DOC=单据码(扫单据条码绑定当前单) / SB=物料条码 / LOC=库位码."""
    auth.need_app_device(authed)
    code = str(code or "").strip()
    if not code:
        return resp.fail(400, "INVALID:扫码内容为空")
    doc = doc_of_code(db, code)
    if doc:
        return resp.ok({"code": code, "kind": "DOC", "doc_no": doc["doc_no"],
                        "doc_type": doc["type"], "biz_status": doc["biz_status"]})
    item = db.execute(text("SELECT material_code,batch_no,status FROM material_item"
                           " WHERE barcode=:c"), {"c": code}).mappings().first()
    loc = db.execute(text("SELECT loc_code,wh_code FROM location WHERE loc_code=:c"
                          " OR qr_code=:c"), {"c": code}).mappings().first()
    if not item and not loc:
        return resp.fail(404, "INVALID:无效码")
    if item:
        mat = db.execute(text("SELECT COALESCE(name,'') name,"
                              "COALESCE(base_unit,'') unit FROM mat_master"
                              " WHERE material_code=:m"),
                         {"m": item["material_code"]}).mappings().first()
        return resp.ok({"code": code, "kind": "SB",
                        "material": item["material_code"],
                        "batch": item["batch_no"], "status": item["status"],
                        "name": (mat or {})["name"], "unit": (mat or {})["unit"]})
    return resp.ok({"code": code, "kind": "LOC",
                    "loc": loc["loc_code"], "wh": loc["wh_code"]})



"""成品WO与交付JJ:下单/按BOM领料/完工/签收.领料走LY记账,完工走RK-FIN."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, posting
from app.core.db import get_db

router = APIRouter()


@router.post("/wo_tasks")
def create_wo(body: dict, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    if not body.get("product_code") or not body.get("qty_plan"):
        return resp.fail(400, "成品编码与计划数量必填")
    if not body.get("bom_version"):
        return resp.fail(400, "BOM_VERSION_REQUIRED:须指定启用版本")
    db.rollback()
    with db.begin():
        wo_no = posting.make_doc_no(db, "WO")
        db.execute(text("INSERT INTO wo_task(wo_no,product_code,bom_version,"
                        "qty_plan,workshop,biz_status)"
                        " VALUES(:w,:p,:b,:q,:s,'下达')"),
                   {"w": wo_no, "p": body["product_code"],
                    "b": body["bom_version"], "q": body["qty_plan"],
                    "s": body.get("workshop")})
    return resp.ok({"wo_no": wo_no, "biz_status": "下达"})


@router.post("/wo_tasks/{wo_no}/issue")
def wo_issue(wo_no: str, body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    wo = db.execute(text("SELECT product_code,bom_version FROM wo_task"
                         " WHERE wo_no=:w"), {"w": wo_no}).mappings().first()
    if not wo:
        return resp.fail(404, "DOC_NOT_FOUND:工单不存在")
    lines = db.execute(text("SELECT material_code,qty,unit FROM bom_line"
                            " WHERE product_code=:p AND version=:v"),
                       {"p": wo["product_code"],
                        "v": wo["bom_version"]}).mappings().all()
    if not lines:
        return resp.fail(400, "BOM无行,不可领料")
    doc_no = posting.create(db, "LY", str(body.get("handler") or ""),
                            [{"material_code": r["material_code"],
                              "qty": float(r["qty"] or 0),
                              "unit": r["unit"],
                              "loc": body.get("loc") or ""} for r in lines])
    db.commit()
    return resp.ok({"wo_no": wo_no, "ly_no": doc_no, "lines": len(lines),
                    "tip": "已按BOM展开建LY单,过账才扣减"})


@router.post("/wo_tasks/{wo_no}/finish")
def wo_finish(wo_no: str, body: dict, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    if body.get("qty_done") is None:
        return resp.fail(400, "完工数量必填")
    with db.begin():
        db.execute(text("UPDATE wo_task SET qty_done=qty_done+:q,"
                        "biz_status='完工' WHERE wo_no=:w"),
                   {"q": body["qty_done"], "w": wo_no})
        doc_no = posting.make_doc_no(db, "RK")
        db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler)"
                        " VALUES(:d,'RK',11300,'DRAFT',:h)"),
                   {"d": doc_no, "h": str(body.get("handler") or "")})
    return resp.ok({"wo_no": wo_no, "rk_no": doc_no, "biz_status": "完工"})


@router.post("/deliver_signs")
def deliver_sign(body: dict, authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    for key in ("doc_no", "receiver", "sign_time"):
        if not body.get(key):
            return resp.fail(400, "交付单号/签收人/签收时间必填")
    with db.begin():
        db.execute(text("INSERT INTO deliver_sign(doc_no,receiver,sign_time,"
                        "sender,proof_ref) VALUES(:d,:r,:t,:s,:p)"),
                   {"d": body["doc_no"], "r": body["receiver"],
                    "t": body["sign_time"], "s": body.get("sender"),
                    "p": body.get("proof_ref")})
        db.execute(text("UPDATE doc_main SET biz_status='已签收'"
                        " WHERE doc_no=:d"), {"d": body["doc_no"]})
    return resp.ok({"doc_no": body["doc_no"], "signed": True})

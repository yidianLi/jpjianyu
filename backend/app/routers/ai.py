"""AI网关路由:问答编排/text2sql/OCR,只读禁过账,真查库+日志."""
import json
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, guards
from app.core.db import get_db
from app.adapters import qwen, paddle

router = APIRouter()


@router.post("/ask")
def ask(body: dict, authed: dict = Depends(auth.need_auth),
        db: Session = Depends(get_db)):
    question = str(body.get("question") or "")
    denied = guards.check_question(question)
    if denied:
        return resp.fail(403, denied)
    sql = qwen.draft_sql(question)
    bad = guards.check_sql(sql)
    if bad:
        return resp.fail(403, bad)
    final = sql if "limit" in sql.lower() else sql + " LIMIT 200"
    try:
        rows = db.execute(text(final)).mappings().all()
    except Exception as err:
        return resp.fail(400, "SQL执行失败:" + str(err)[:200])
    data = [dict(r) for r in rows[:200]]
    db.execute(text("INSERT INTO ai_qa_log(by_user,question,sql_text,rows_count)"
                    " VALUES('web',:q,:s,:n)"),
               {"q": question[:1000], "s": final[:2000], "n": len(data)})
    db.commit()
    return resp.ok({"sql": final, "rows": data,
                    "formula": "默认查快照onhand,仲裁查ledger"}, total=len(data))


@router.post("/text2sql")
def text2sql(body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    return ask(body, authed, db)


@router.post("/ocr")
def ocr(body: dict, authed: dict = Depends(auth.need_auth),
        db: Session = Depends(get_db)):
    import time
    out = paddle.recognize(str(body.get("image") or ""),
                           str(body.get("doc_type") or "delivery"))
    oid = "OCR%d" % int(time.time() * 1000)
    rows = out.get("rows") if isinstance(out.get("rows"), list) else []
    db.execute(text("INSERT INTO ocr_document(ocr_id,doc_no,conf,ref)"
                    " VALUES(:i,:d,:c,:r)"),
               {"i": oid, "d": str(body.get("doc_no") or ""),
                "c": float(out.get("conf") or 0.0),
                "r": ";".join(out.get("issues") or [])[:2000]})
    for n, row in enumerate(rows[:50], 1):
        db.execute(text("INSERT INTO ocr_field_result(ocr_id,field,candidate,conf)"
                        " VALUES(:i,:f,:c,:n)"
                        " ON DUPLICATE KEY UPDATE candidate=VALUES(candidate)"),
                   {"i": oid, "f": "row%d" % n, "c": json.dumps(row,
                    ensure_ascii=False)[:2000],
                    "n": float(row.get("conf") or 0.0)})
    db.commit()
    out["ocr_id"] = oid
    return resp.ok(out)

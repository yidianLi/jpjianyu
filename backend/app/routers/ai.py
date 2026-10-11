"""AI网关路由:问答编排/text2sql/OCR,只读禁过账,真查库+日志."""
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
    with db.begin():
        db.execute(text("INSERT INTO ai_qa_log(by_user,question,sql_text,rows_count)"
                        " VALUES('web',:q,:s,:n)"),
                   {"q": question[:1000], "s": final[:2000], "n": len(data)})
    return resp.ok({"sql": final, "rows": data,
                    "formula": "默认查快照onhand,仲裁查ledger"}, total=len(data))


@router.post("/text2sql")
def text2sql(body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    return ask(body, authed, db)


@router.post("/ocr")
def ocr(body: dict, authed: dict = Depends(auth.need_auth),
        db: Session = Depends(get_db)):
    out = paddle.recognize(str(body.get("image") or ""))
    with db.begin():
        db.execute(text("INSERT INTO ocr_document(ocr_id,conf,ref)"
                        " VALUES(:i,:c,:r)"),
                   {"i": "OCR1", "c": 0.0, "r": "ref"})
    return resp.ok(out)

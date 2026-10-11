"""AI网关路由:问答编排/text2sql/OCR,只读禁过账."""
from fastapi import APIRouter, Depends
from app.core import resp, auth, guards
from app.adapters import qwen, paddle

router = APIRouter()


@router.post("/ask")
def ask(body: dict, authed: dict = Depends(auth.need_auth)):
    question = str(body.get("question") or "")
    denied = guards.check_question(question)
    if denied:
        return resp.fail(403, denied)
    sql = qwen.draft_sql(question)
    bad = guards.check_sql(sql)
    if bad:
        return resp.fail(403, bad)
    return resp.ok({"sql": sql + " LIMIT 200", "rows": [],
                    "formula": "默认查快照onhand,仲裁查ledger"})


@router.post("/text2sql")
def text2sql(body: dict, authed: dict = Depends(auth.need_auth)):
    return ask(body, authed)


@router.post("/ocr")
def ocr(body: dict, authed: dict = Depends(auth.need_auth)):
    return resp.ok(paddle.recognize(str(body.get("image") or "")))

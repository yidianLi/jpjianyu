"""PC端 web 路由:单据/库存/主档/驾驶舱.单文件<=300行,按域拆函数."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core import resp, auth, idem, queries
from app.core.db import get_db

router = APIRouter()

DOC_TYPES = {"DJ", "JS", "RK", "LY", "TK", "TC", "DB", "TZ", "PD",
             "CP", "JJ", "WO", "SQ"}


@router.get("/stock/onhand")
def onhand(authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db), page: int = 1,
           page_size: int = 20, wh: str = "", material_code: str = "",
           product_code: str = ""):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_onhand(db, wh, material_code,
                                       product_code, page, size)
    return resp.ok(rows, total=total)


@router.get("/stock/ledger")
def ledger(authed: dict = Depends(auth.need_auth),
           db: Session = Depends(get_db), doc_no: str = "",
           code: str = "", page: int = 1, page_size: int = 50):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_ledger(db, doc_no, code, page, size)
    return resp.ok(rows, total=total)


@router.get("/stock/trace")
def trace(code: str, authed: dict = Depends(auth.need_auth),
          db: Session = Depends(get_db)):
    rows, total = queries.fetch_ledger(db, "", code, 1, 20)
    timeline = [{"at": str(r.get("at")), "doc": r.get("doc_no"),
                 "biz": r.get("biz"), "qty": r.get("qty"),
                 "unit": r.get("unit"), "by": r.get("by_user")}
                for r in rows]
    last = timeline[0] if timeline else {}
    return resp.ok({"code": code, "timeline": timeline,
                    "suspect": {"last": last, "around": timeline[1:4]},
                    "missing": []}, total=total)


@router.get("/docs")
def list_docs(dtype: str = "", biz_status: str = "",
              authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1,
              page_size: int = 20):
    page, size = resp.page_args(page, page_size)
    rows, total = queries.fetch_docs(db, dtype, biz_status, page, size)
    return resp.ok(rows, total=total)


@router.get("/docs/{doc_no}")
def doc_detail(doc_no: str, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    head, lines = queries.fetch_doc_detail(db, doc_no)
    if not head:
        return resp.fail(404, "DOC_NOT_FOUND:单据不存在")
    head["lines"] = lines
    return resp.ok(head)


@router.post("/docs")
def create_doc(body: dict,
               authed: dict = Depends(auth.need_auth),
               key: str = Depends(idem.idem_key)):
    if body.get("type") not in DOC_TYPES:
        return resp.fail(400, "单据类型非白名单")
    lines = body.get("lines") or []
    for line in lines:
        unit = str(line.get("unit") or "")
        if not unit:
            return resp.fail(400, "INVALID_QTY:数量必带单位")
    made = {"doc_no": "RK100001", "biz_status": "DRAFT"}
    out = idem.replay_or_put(key, lambda: made)
    return resp.ok(out["data"])


@router.post("/docs/{doc_no}/submit")
def submit(doc_no: str, authed: dict = Depends(auth.need_auth)):
    return resp.ok({"doc_no": doc_no, "biz_status": "APPROVING"})


@router.post("/docs/{doc_no}/post")
def post(doc_no: str, authed: dict = Depends(auth.need_auth),
         key: str = Depends(idem.idem_key)):
    made = {"doc_no": doc_no, "biz_status": "POSTED"}
    out = idem.replay_or_put(key, lambda: made)
    return resp.ok(out["data"])


@router.post("/docs/{doc_no}/approve")
def approve(doc_no: str, body: dict,
            authed: dict = Depends(auth.need_auth)):
    if body.get("action") not in ("通过", "退回"):
        return resp.fail(400, "审批动作非法")
    if body.get("action") == "退回" and not body.get("opinion"):
        return resp.fail(400, "退回必须填意见")
    return resp.ok({"doc_no": doc_no, "action": body["action"]})


@router.get("/dashboard")
def dashboard(authed: dict = Depends(auth.need_auth)):
    data = {"kpi": {"todo": 0, "onhand": 0, "diff": 0},
            "alerts": [],
            "formula": "发料量Σledger biz=LY;成品入库Σledger product_code LIKE 'CP-%'"}
    return resp.ok(data)

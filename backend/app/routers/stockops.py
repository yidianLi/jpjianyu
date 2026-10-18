"""库存分量动作:质检判定/冻结/解冻/待发占用.
现存总量 on_hand 不变,只在 avail(可用)/pending(待发)/quarantine(隔离)/frozen(冻结)
之间搬运分量,全程不写流水(流水只记录 on_hand 增减的过账);每次动作写审计留痕."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth, dialect
from app.core.db import get_db

router = APIRouter()

_WHERE = ("material_code=:m AND product_code=:p AND batch_no=:b"
          " AND loc=:l")


def _row(db, m, p, b, w, l):
    # wh 仅作记录维度保留,不参与定位:历史过账 stock_onhand.wh 写空串,
    # 故按 物料+成品+批次+库位 定位;库位(w_loc)在各仓唯一即可.
    return db.execute(text("SELECT on_hand,avail,pending,quarantine,frozen"
                           " FROM stock_onhand WHERE " + _WHERE),
                      {"m": m, "p": p, "b": b, "l": l}).mappings().first()


def _apply(db, m, p, b, w, l, avail=0, pending=0, quarantine=0, frozen=0):
    """在某条现存上调整各分量(增量),并保证 avail/pending/quarantine/frozen
    之和不超过 on_hand."""
    db.execute(text("UPDATE stock_onhand SET avail=avail+:av,"
                    " pending=pending+:pe, quarantine=quarantine+:qu,"
                    " frozen=frozen+:fz WHERE " + _WHERE),
               {"m": m, "p": p, "b": b, "l": l,
                "av": avail, "pe": pending, "qu": quarantine, "fz": frozen})


def _audit(db, user, action, m, b, w, l, n):
    db.execute(text("INSERT INTO audit_log(by_user,action,doc_no,biz_type,"
                    "result,o_val,n_val) VALUES(:y,:a,:d,'库存分量',:r,'',:n)"),
               {"y": user, "a": action, "d": "%s/%s/%s/%s" % (m, b, w, l),
                "r": "已完成", "n": str(n)})


@router.post("/stock/qc")
def stock_qc(body: dict, authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    """质检判定:对'隔离(待检)'分量做判定.
    pass -> 隔离转可用; fail -> 隔离转冻结(待报废).只搬分量不改总量."""
    m = str(body.get("material_code") or "")
    p = str(body.get("product_code") or "")
    b = str(body.get("batch_no") or "")
    w = str(body.get("wh") or "")
    l = str(body.get("loc") or "")
    try:
        qty = float(body.get("qty") or 0)
    except (TypeError, ValueError):
        return resp.fail(400, "数量非法")
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    verdict = str(body.get("verdict") or "")
    if verdict not in ("pass", "fail"):
        return resp.fail(400, "判定结果须为 pass/fail")
    row = _row(db, m, p, b, w, l)
    if not row:
        return resp.fail(404, "该现存记录不存在")
    q = float(row["quarantine"] or 0)
    if qty > q:
        return resp.fail(403, "QUARANTINE_INSUFFICIENT:隔离量%.3f<%.3f" % (q, qty))
    db.rollback()
    with db.begin():
        if verdict == "pass":
            _apply(db, m, p, b, w, l, avail=qty, quarantine=-qty)
        else:
            _apply(db, m, p, b, w, l, frozen=qty, quarantine=-qty)
        _audit(db, authed.get("username") or "", "质检" +
               ("合格" if verdict == "pass" else "不合格"), m, b, w, l, qty)
    return resp.ok({"verdict": verdict, "qty": qty})


@router.post("/stock/freeze")
def stock_freeze(body: dict, authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    """冻结:可用 -> 冻结(未出库先锁定)."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    row = _row(db, m, p, b, w, l)
    if not row:
        return resp.fail(404, "该现存记录不存在")
    av = float(row["avail"] or 0)
    if qty > av:
        return resp.fail(403, "AVAIL_INSUFFICIENT:可用%.3f<%.3f" % (av, qty))
    db.rollback()
    with db.begin():
        _apply(db, m, p, b, w, l, avail=-qty, frozen=qty)
        _audit(db, authed.get("username") or "", "冻结", m, b, w, l, qty)
    return resp.ok({"qty": qty, "frozen": True})


@router.post("/stock/unfreeze")
def stock_unfreeze(body: dict, authed: dict = Depends(auth.need_auth),
                   db: Session = Depends(get_db)):
    """解冻:冻结 -> 可用."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    row = _row(db, m, p, b, w, l)
    if not row:
        return resp.fail(404, "该现存记录不存在")
    fz = float(row["frozen"] or 0)
    if qty > fz:
        return resp.fail(403, "FROZEN_INSUFFICIENT:冻结%.3f<%.3f" % (fz, qty))
    db.rollback()
    with db.begin():
        _apply(db, m, p, b, w, l, avail=qty, frozen=-qty)
        _audit(db, authed.get("username") or "", "解冻", m, b, w, l, qty)
    return resp.ok({"qty": qty, "frozen": False})


@router.post("/stock/reserve")
def stock_reserve(body: dict, authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db)):
    """待发占用:可用 -> 待发(出库前预占)."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    row = _row(db, m, p, b, w, l)
    if not row:
        return resp.fail(404, "该现存记录不存在")
    av = float(row["avail"] or 0)
    if qty > av:
        return resp.fail(403, "AVAIL_INSUFFICIENT:可用%.3f<%.3f" % (av, qty))
    db.rollback()
    with db.begin():
        _apply(db, m, p, b, w, l, avail=-qty, pending=qty)
        _audit(db, authed.get("username") or "", "待发占用", m, b, w, l, qty)
    return resp.ok({"qty": qty, "pending": True})


@router.post("/stock/release")
def stock_release(body: dict, authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db)):
    """释放待发:待发 -> 可用."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    row = _row(db, m, p, b, w, l)
    if not row:
        return resp.fail(404, "该现存记录不存在")
    pe = float(row["pending"] or 0)
    if qty > pe:
        return resp.fail(403, "PENDING_INSUFFICIENT:待发%.3f<%.3f" % (pe, qty))
    db.rollback()
    with db.begin():
        _apply(db, m, p, b, w, l, avail=qty, pending=-qty)
        _audit(db, authed.get("username") or "", "释放待发", m, b, w, l, qty)
    return resp.ok({"qty": qty, "pending": False})


def _params(body):
    def f(k):
        try:
            return float(body.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0
    return (str(body.get("material_code") or ""),
            str(body.get("product_code") or ""),
            str(body.get("batch_no") or ""),
            str(body.get("wh") or ""),
            str(body.get("loc") or ""),
            f("qty"))

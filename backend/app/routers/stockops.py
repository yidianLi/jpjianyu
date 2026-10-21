"""库存分量动作:质检判定/冻结/解冻/待发占用.
现存总量 on_hand 不变,只在 avail(可用)/pending(待发)/quarantine(隔离)/frozen(冻结)
之间搬运分量,全程不写流水(流水只记录 on_hand 增减的过账);每次动作写审计留痕.

并发安全:每个动作在事务内先 SELECT ... FOR UPDATE 锁住该现存行,再做校验+搬运,
避免两人同时冻结/质检把分量搬成负数.行锁在事务提交/回滚时释放."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()

_WHERE = ("material_code=:m AND product_code=:p AND batch_no=:b"
          " AND loc=:l")

# 分量中文标签,用于不足时报错
_LABEL = {"avail": "可用", "pending": "待发", "quarantine": "隔离",
          "frozen": "冻结"}


def _apply(db, m, p, b, w, l, avail=0, pending=0, quarantine=0, frozen=0):
    """在某条现存上按增量调整各分量(调用方须已锁行并校验来源足量)."""
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


def _move(db, authed, action, m, p, b, w, l, src, dst, qty):
    """事务内锁行 -> 校验来源分量足量 -> 从 src 搬到 dst -> 审计.
    成功返回 None;失败返回 resp.fail(...) 的 dict(调用方直接 return)."""
    db.rollback()
    with db.begin():
        row = db.execute(text("SELECT avail,pending,quarantine,frozen"
                              " FROM stock_onhand WHERE " + _WHERE +
                              " FOR UPDATE"),
                         {"m": m, "p": p, "b": b, "l": l}).mappings().first()
        if not row:
            return resp.fail(404, "该现存记录不存在")
        have = float(row[src] or 0)
        if qty > have:
            return resp.fail(403, "%s_INSUFFICIENT:%s%.3f<%.3f"
                             % (src.upper(), _LABEL[src], have, qty))
        delta = {"avail": 0.0, "pending": 0.0, "quarantine": 0.0, "frozen": 0.0}
        delta[src] -= qty
        delta[dst] += qty
        _apply(db, m, p, b, w, l, avail=delta["avail"], pending=delta["pending"],
               quarantine=delta["quarantine"], frozen=delta["frozen"])
        _audit(db, authed.get("username") or "", action, m, b, w, l, qty)
    return None


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
    dst = "avail" if verdict == "pass" else "frozen"
    label = "质检合格" if verdict == "pass" else "质检不合格"
    err = _move(db, authed, label, m, p, b, w, l, "quarantine", dst, qty)
    if err:
        return err
    return resp.ok({"verdict": verdict, "qty": qty})


@router.post("/stock/freeze")
def stock_freeze(body: dict, authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    """冻结:可用 -> 冻结(未出库先锁定)."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    err = _move(db, authed, "冻结", m, p, b, w, l, "avail", "frozen", qty)
    if err:
        return err
    return resp.ok({"qty": qty, "frozen": True})


@router.post("/stock/unfreeze")
def stock_unfreeze(body: dict, authed: dict = Depends(auth.need_auth),
                   db: Session = Depends(get_db)):
    """解冻:冻结 -> 可用."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    err = _move(db, authed, "解冻", m, p, b, w, l, "frozen", "avail", qty)
    if err:
        return err
    return resp.ok({"qty": qty, "frozen": False})


@router.post("/stock/reserve")
def stock_reserve(body: dict, authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db)):
    """待发占用:可用 -> 待发(出库前预占)."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    err = _move(db, authed, "待发占用", m, p, b, w, l, "avail", "pending", qty)
    if err:
        return err
    return resp.ok({"qty": qty, "pending": True})


@router.post("/stock/release")
def stock_release(body: dict, authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db)):
    """释放待发:待发 -> 可用."""
    m, p, b, w, l, qty = _params(body)
    if qty <= 0:
        return resp.fail(400, "数量必须大于0")
    err = _move(db, authed, "释放待发", m, p, b, w, l, "pending", "avail", qty)
    if err:
        return err
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

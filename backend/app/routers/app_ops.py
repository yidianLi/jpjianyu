"""PDA 现场作业接口:盘点(PD)与调仓(DB)的移动端代理.

PC 端 /web/pd_tasks、/web/transfer_ships 走"功能权限网关"(盘点需「确认」权限),
而 PDA 用的是 /app/login 签发的设备令牌(device=PDA-03),网关按 web 路径匹配不到,
但令牌本身携带用户名,仍需按角色判权.本文件把两套作业开放给 PDA:

- 盘点:建任务 → 取行 → 逐行录实盘 → 差异调账(生成 TZ 调整单并过账)
- 调仓:建单(源仓减/在途增) → 列表 → 实收接收

口径与 PC 端完全一致(直接复用 posting 与 transfer 的逻辑),只是鉴权入口不同:
PDA 令牌必须满足 need_app_device 且用户具备相应功能权限.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core import resp, auth, perms, posting
from app.core.db import get_db

router = APIRouter()


def _need(db, authed: dict, action: str):
    """PDA 设备令牌 + 功能权限双校验(与 PC 网关同一动作口径)."""
    auth.need_app_device(authed)
    if not perms.has_func(db, authed.get("username") or "", action):
        return resp.fail(403, "PERM_DENIED:无「%s」权限" % action)
    return None


def _wh_scope_ok(db, authed: dict, wh_code: str) -> bool:
    """仓库是否在用户数据范围内(管理员/全范围放行)."""
    eff = perms.effective(db, authed.get("username") or "")
    scope = eff["data_scope"]
    if "*" in scope or eff["is_admin"]:
        return True
    return wh_code in scope


# ---------------------------------------------------------------------------
# 盘点 PD:建任务 → 取行 → 逐行确认 → 差异调账
# ---------------------------------------------------------------------------

@router.post("/pd_tasks")
def create_pd(body: dict, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    """建盘点任务:按仓库/范围抓账面行.需「确认」权限."""
    denied = _need(db, authed, "确认")
    if denied:
        return denied
    wh_code = str(body.get("wh_code") or "").strip()
    if not wh_code:
        return resp.fail(400, "盘点仓库范围必填")
    if not _wh_scope_ok(db, authed, wh_code):
        return resp.fail(403, "PERM_DENIED:仓库「%s」不在你的数据范围内" % wh_code)
    db.rollback()
    with db.begin():
        pd_no = posting.make_doc_no(db, "PD")
        db.execute(text("INSERT INTO pd_task(pd_no,sid,mode,wh_code,scope,"
                        "biz_status,handler) VALUES(:p,13100,:m,:w,:s,'草稿',:h)"),
                   {"p": pd_no, "m": str(body.get("mode") or "人工临时"),
                    "w": wh_code, "s": str(body.get("scope") or ""),
                    "h": authed.get("username") or ""})
        rows = db.execute(text(
            "SELECT o.material_code,o.batch_no,o.on_hand,"
            "COALESCE(m.base_unit,p.base_unit,'') unit FROM stock_onhand o"
            " LEFT JOIN mat_master m ON m.material_code=o.material_code"
            " LEFT JOIN product_master p ON p.product_code=o.product_code"
            " WHERE o.wh=:w OR o.loc LIKE :wl LIMIT 200"),
            {"w": wh_code, "wl": wh_code + "%"}).mappings().all()
        for i, r in enumerate(rows, 1):
            db.execute(text("INSERT INTO pd_line(pd_no,line_no,o_qty,material_code,"
                            "batch_no,book_qty,unit) VALUES(:p,:n,:o,:m,:b,:o,:u)"),
                       {"p": pd_no, "n": i, "o": r["on_hand"] or 0,
                        "m": r["material_code"], "b": r["batch_no"], "u": r["unit"]})
    return resp.ok({"pd_no": pd_no, "lines": len(rows)})


@router.get("/pd_tasks")
def list_pd(authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT pd_no,mode,wh_code,scope,biz_status,handler"
                           " FROM pd_task ORDER BY pd_no DESC LIMIT 50")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/pd_tasks/{pd_no}/lines")
def pd_lines(pd_no: str, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT pd_no,line_no,o_qty,n_qty,diff_qty,material_code,"
                           "batch_no,book_qty,real_qty,unit,reason FROM pd_line"
                           " WHERE pd_no=:p ORDER BY line_no"),
                      {"p": pd_no}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.post("/pd_tasks/{pd_no}/confirm")
def pd_confirm(pd_no: str, body: dict, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    """逐行录实盘数.需「确认」权限."""
    denied = _need(db, authed, "确认")
    if denied:
        return denied
    db.rollback()
    with db.begin():
        db.execute(text("UPDATE pd_line SET n_qty=:n,real_qty=:n,"
                        "diff_qty=:n-o_qty WHERE pd_no=:p AND line_no=:l"),
                   {"n": body.get("n_qty") or 0, "p": pd_no,
                    "l": body.get("line_no") or 1})
        db.execute(text("UPDATE pd_task SET biz_status='复核' WHERE pd_no=:p"),
                   {"p": pd_no})
    return resp.ok({"pd_no": pd_no, "biz_status": "复核",
                    "tip": "盘点不动账,差异走TK/RK调整单"})


@router.post("/pd_tasks/{pd_no}/adjust")
def pd_adjust(pd_no: str, authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    """差异调账:生成 TZ 调整单并直接过账(盘盈增账/盘亏减账).需「确认」权限."""
    denied = _need(db, authed, "确认")
    if denied:
        return denied
    task = db.execute(text("SELECT wh_code,biz_status FROM pd_task"
                           " WHERE pd_no=:p"), {"p": pd_no}).mappings().first()
    if not task:
        return resp.fail(404, "盘点任务不存在")
    if task["biz_status"] not in ("复核", "确认", "已复核"):
        return resp.fail(403, "FLOW_STATE_DENIED:仅复核态盘点可生成调整单")
    lines = db.execute(text("SELECT line_no,material_code,batch_no,unit,"
                            "o_qty,n_qty,COALESCE(diff_qty,n_qty-o_qty) d"
                            " FROM pd_line WHERE pd_no=:p AND n_qty IS NOT NULL"
                            " AND COALESCE(diff_qty,n_qty-o_qty)<>0"),
                       {"p": pd_no}).mappings().all()
    if not lines:
        db.rollback()
        with db.begin():
            db.execute(text("UPDATE pd_task SET biz_status='已调整'"
                            " WHERE pd_no=:p"), {"p": pd_no})
        return resp.ok({"pd_no": pd_no, "adjust_doc": None, "lines": 0,
                        "tip": "无差异,盘点关闭"})
    db.rollback()
    adjusted = []
    with db.begin():
        for ln in lines:
            diff = float(ln["d"] or 0)
            real = db.execute(text("SELECT loc FROM stock_onhand WHERE "
                                   "material_code=:m AND batch_no=:b AND "
                                   "(wh=:w OR loc LIKE :wl) LIMIT 1"),
                              {"m": ln["material_code"], "b": ln["batch_no"] or "",
                               "w": task["wh_code"],
                               "wl": task["wh_code"] + "%"}).mappings().first()
            loc = real["loc"] if real else task["wh_code"]
            doc_no = posting.make_doc_no(db, "TZ")
            db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,"
                            "handler) VALUES(:d,'TZ',19100,'POSTED',:h)"),
                       {"d": doc_no, "h": authed.get("username") or ""})
            db.execute(text("INSERT INTO doc_line(doc_no,line_no,material_code,"
                            "batch_no,qty,unit,loc,reason) VALUES"
                            "(:d,1,:m,:b,:q,:u,:l,:r)"),
                       {"d": doc_no, "m": ln["material_code"],
                        "b": ln["batch_no"], "q": abs(diff),
                        "u": ln["unit"], "l": loc,
                        "r": "盘点差异调整"})
            state = posting.post(db, doc_no, "TZ",
                                 authed.get("username") or "",
                                 authed.get("device", ""))
            adjusted.append({"doc_no": doc_no,
                             "material_code": ln["material_code"],
                             "diff": diff, "state": state})
        db.execute(text("UPDATE pd_task SET biz_status='已调整' WHERE pd_no=:p"),
                   {"p": pd_no})
    return resp.ok({"pd_no": pd_no, "lines": len(adjusted), "adjust": adjusted,
                    "tip": "差异已生成TZ调整单并过账"})


# ---------------------------------------------------------------------------
# 调仓 DB:建单 → 列表 → 实收接收
# ---------------------------------------------------------------------------

@router.post("/transfer_ships")
def create_ship(body: dict, authed: dict = Depends(auth.need_auth),
                db: Session = Depends(get_db)):
    """建调仓单(源仓减/在途增).需「录入」权限.
    调仓是"申请在途"单:一单一行(transfer_ship 表按 doc_no 一行),
    多物料则拆成多张 DB 单,返回单号列表."""
    denied = _need(db, authed, "录入")
    if denied:
        return denied
    from_wh = str(body.get("from_wh") or "").strip()
    to_wh = str(body.get("to_wh") or "").strip()
    if not from_wh or not to_wh:
        return resp.fail(400, "来源仓与目的仓必填")
    lines = [ln for ln in (body.get("lines") or [])
             if isinstance(ln, dict) and float(ln.get("qty") or 0) > 0]
    if not lines:
        return resp.fail(400, "调仓行不能为空")
    if not _wh_scope_ok(db, authed, from_wh):
        return resp.fail(403, "PERM_DENIED:仓库「%s」不在你的数据范围内" % from_wh)
    db.rollback()
    doc_nos = []
    with db.begin():
        for ln in lines[:20]:
            doc_no = posting.make_doc_no(db, "DB")
            doc_nos.append(doc_no)
            db.execute(text("INSERT INTO doc_main(doc_no,type,sid,biz_status,handler)"
                            " VALUES(:d,'DB',19000,'DRAFT',:h)"),
                       {"d": doc_no, "h": authed.get("username") or ""})
            db.execute(text("INSERT INTO transfer_ship(doc_no,from_wh,to_wh,from_loc,"
                            "to_loc,o_qty,qty_apply,qty_sent,unit,carrier,plate)"
                            " VALUES(:d,:f,:t,:fl,:tl,:o,:o,0,:u,:c,:p)"),
                       {"d": doc_no, "f": from_wh, "t": to_wh,
                        "fl": body.get("from_loc"), "tl": body.get("to_loc"),
                        "o": ln.get("qty") or 0, "u": ln.get("unit") or "",
                        "c": body.get("carrier"), "p": body.get("plate")})
    return resp.ok({"doc_no": doc_nos[0], "doc_nos": doc_nos,
                    "biz_status": "DRAFT", "lines": len(doc_nos)})


@router.get("/transfer_ships")
def list_ships(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT doc_no,from_wh,to_wh,from_loc,to_loc,o_qty,"
                           "qty_apply,qty_sent,n_qty,qty_recv,unit,carrier,plate,"
                           "diff_status FROM transfer_ship ORDER BY doc_no DESC"
                           " LIMIT 50")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.patch("/transfer_ships/{doc_no}/receive")
def receive(doc_no: str, body: dict, authed: dict = Depends(auth.need_auth),
            db: Session = Depends(get_db)):
    """实收登记(差异转待复核).需「录入」权限."""
    denied = _need(db, authed, "录入")
    if denied:
        return denied
    if body.get("n_qty") is None:
        return resp.fail(400, "实收数量必填")
    db.rollback()
    with db.begin():
        hit = db.execute(text("UPDATE transfer_ship SET n_qty=:n,qty_recv=:n,"
                              "diff_status='待复核' WHERE doc_no=:d"),
                         {"n": body["n_qty"], "d": doc_no})
    if not hit.rowcount:
        return resp.fail(404, "DOC_NOT_FOUND:调仓单不存在")
    return resp.ok({"doc_no": doc_no, "diff_status": "待复核"})

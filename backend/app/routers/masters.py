"""主档路由:物料/成品/BOM/仓储地点/客户组织/模板/方法.只读为主,写口仅管理员."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core import resp, auth
from app.core.db import get_db

router = APIRouter()


def _list(db, sql, args, page, size):
    total = db.execute(text("SELECT COUNT(*) c FROM (%s) t" % sql), args).scalar() or 0
    args = dict(args, off=(page - 1) * size, n=size)
    rows = db.execute(text(sql + " LIMIT :off,:n"), args).mappings().all()
    return [dict(r) for r in rows], int(total)


@router.get("/masters/mat_categories")
def mat_cats(authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db), page: int = 1, page_size: int = 200):
    p, s = resp.page_args(page, page_size)
    rows, t = _list(db, "SELECT cat_code,parent_code,autocode,lowest,name,sort,enabled"
                        " FROM mat_category ORDER BY autocode", {}, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/materials")
def materials(keyword: str = "", cat_code: str = "", enabled: int = 1,
              authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    cond, args = ["1=1"], {}
    if keyword:
        cond.append("(name LIKE :k OR material_code LIKE :k)")
        args["k"] = "%" + keyword + "%"
    if cat_code:
        cond.append("cat_code=:c")
        args["c"] = cat_code
    rows, t = _list(db, "SELECT material_code,cat_code,name,spec,base_unit,pack_unit,"
                        "pack_qty,manage_mode,price_ref,max_qty,min_qty,enabled,status"
                        " FROM mat_master WHERE " + " AND ".join(cond), args, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/products")
def products(keyword: str = "", authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    args = {}
    sql = ("SELECT product_code,cat_code,name,spec,style,customer,base_unit,"
           "price_ref,enabled,status FROM product_master")
    if keyword:
        sql += " WHERE name LIKE :k OR product_code LIKE :k"
        args["k"] = "%" + keyword + "%"
    rows, t = _list(db, sql, args, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/boms")
def boms(product_code: str = "", authed: dict = Depends(auth.need_auth),
         db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    args = {}
    sql = "SELECT product_code,version,handler,eff_date,status FROM bom_master"
    if product_code:
        sql += " WHERE product_code=:p"
        args["p"] = product_code
    rows, t = _list(db, sql, args, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/boms/{code}/{ver}/lines")
def bom_lines(code: str, ver: str, authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT product_code,version,line_no,material_code,"
                           "qty,unit,loss_rate FROM bom_line"
                           " WHERE product_code=:c AND version=:v ORDER BY line_no"),
                      {"c": code, "v": ver}).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/masters/warehouses")
def warehouses(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT wh_code,name,wh_type,stock_kind,manager,"
                           "enabled,status FROM warehouse")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/masters/locations")
def locations(wh_code: str = "", authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1, page_size: int = 50):
    p, s = resp.page_args(page, page_size)
    args = {}
    sql = "SELECT loc_code,wh_code,autocode,zone_label,capacity,qr_code,enabled,status FROM location"
    if wh_code:
        sql += " WHERE wh_code=:w"
        args["w"] = wh_code
    rows, t = _list(db, sql, args, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/customers")
def customers(authed: dict = Depends(auth.need_auth),
              db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    p, s = resp.page_args(page, page_size)
    rows, t = _list(db, "SELECT cust_id,name,cust_type,contact,phone,status"
                        " FROM customer", {}, p, s)
    return resp.ok(rows, total=t)


@router.get("/masters/org_tree")
def org_tree(authed: dict = Depends(auth.need_auth),
             db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT node_code,autocode,lowest,name,level,"
                           "parent_code,leader,enabled,status FROM org_node"
                           " ORDER BY autocode")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/masters/doc_templates")
def doc_templates(biz: str = "", authed: dict = Depends(auth.need_auth),
                  db: Session = Depends(get_db)):
    args = {}
    sql = "SELECT tpl_code,biz,version,content,status FROM doc_template"
    if biz:
        sql += " WHERE biz=:b"
        args["b"] = biz
    rows = db.execute(text(sql), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/meta/biz_states")
def biz_states(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT sid,biz,name,bill_no_format,enabled"
                           " FROM sys_biz_state ORDER BY sid")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))


@router.get("/meta/bill_methods")
def bill_methods(sid: int = 0, authed: dict = Depends(auth.need_auth),
                 db: Session = Depends(get_db)):
    args = {}
    sql = ("SELECT bmid,sid,method_code,method_name,enabled"
           " FROM sys_bill_method")
    if sid:
        sql += " WHERE sid=:s"
        args["s"] = sid
    rows = db.execute(text(sql + " ORDER BY sid,bmid"), args).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))

def _dup(db, sql, args):
    return db.execute(text(sql), args).first() is not None


@router.post("/masters/materials")
def material_create(body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    code, name = str(body.get("material_code") or ""), str(body.get("name") or "")
    unit = str(body.get("base_unit") or "")
    if not code or not name or not unit:
        return resp.fail(400, "物料编码/名称/基本单位必填")
    if _dup(db, "SELECT 1 FROM mat_master WHERE material_code=:c", {"c": code}):
        return resp.fail(400, "物料编码已存在:必须唯一")
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO mat_master(material_code,name,spec,base_unit,"
                        "pack_unit,pack_qty,manage_mode,price_ref,min_qty,max_qty,"
                        "enabled,status) VALUES(:c,:n,:s,:u,:p,:q,:m,:r,:x,:i,1,'启用')"),
                   {"c": code, "n": name, "s": body.get("spec"),
                    "u": unit, "p": body.get("pack_unit"),
                    "q": body.get("pack_qty") or 1,
                    "m": body.get("manage_mode") or "QTY",
                    "r": body.get("price_ref"),
                    "x": body.get("max_qty"), "i": body.get("min_qty")})
    return resp.ok({"material_code": code})


@router.patch("/masters/materials/{code}/status")
def material_status(code: str, body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    en = 0 if str(body.get("enabled")) == "0" else 1
    with db.begin():
        hit = db.execute(text("UPDATE mat_master SET enabled=:e,status=:s"
                              " WHERE material_code=:c"),
                         {"e": en, "s": "停用" if not en else "启用",
                          "c": code})
        if not hit.rowcount:
            return resp.fail(404, "物料不存在")
    return resp.ok({"material_code": code, "enabled": en})


@router.post("/masters/products")
def product_create(body: dict, adm: dict = Depends(auth.need_admin),
                   db: Session = Depends(get_db)):
    code, name = str(body.get("product_code") or ""), str(body.get("name") or "")
    if not code or not name:
        return resp.fail(400, "成品编码/名称必填")
    if _dup(db, "SELECT 1 FROM product_master WHERE product_code=:c", {"c": code}):
        return resp.fail(400, "成品编码已存在:必须唯一")
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO product_master(product_code,name,spec,style,"
                        "customer,base_unit,price_ref,enabled,status)"
                        " VALUES(:c,:n,:s,:y,:u,:b,:r,1,'启用')"),
                   {"c": code, "n": name, "s": body.get("spec"),
                    "y": body.get("style"), "u": body.get("customer"),
                    "b": body.get("base_unit") or "件",
                    "r": body.get("price_ref")})
    return resp.ok({"product_code": code})


@router.patch("/masters/products/{code}/status")
def product_status(code: str, body: dict, adm: dict = Depends(auth.need_admin),
                   db: Session = Depends(get_db)):
    en = 0 if str(body.get("enabled")) == "0" else 1
    with db.begin():
        hit = db.execute(text("UPDATE product_master SET enabled=:e,status=:s"
                              " WHERE product_code=:c"),
                         {"e": en, "s": "停用" if not en else "启用",
                          "c": code})
        if not hit.rowcount:
            return resp.fail(404, "成品不存在")
    return resp.ok({"product_code": code, "enabled": en})


@router.post("/masters/boms")
def bom_create(body: dict, adm: dict = Depends(auth.need_admin),
               db: Session = Depends(get_db)):
    code, ver = str(body.get("product_code") or ""), str(body.get("version") or "")
    if not code or not ver:
        return resp.fail(400, "成品编码/版本必填")
    lines = body.get("lines") or []
    if not lines:
        return resp.fail(400, "BOM行不能为空")
    with db.begin():
        db.execute(text("INSERT INTO bom_master(product_code,version,handler,"
                        "eff_date,status) VALUES(:c,:v,:h,NOW(),'草稿')"
                        " ON DUPLICATE KEY UPDATE handler=VALUES(handler)"),
                   {"c": code, "v": ver, "h": body.get("handler")})
        db.execute(text("DELETE FROM bom_line WHERE product_code=:c"
                        " AND version=:v"), {"c": code, "v": ver})
        for i, line in enumerate(lines, 1):
            if not line.get("material_code") or not line.get("qty"):
                return resp.fail(400, "BOM行物料/耗用必填")
            db.execute(text("INSERT INTO bom_line(product_code,version,line_no,"
                            "material_code,qty,unit,loss_rate)"
                            " VALUES(:c,:v,:n,:m,:q,:u,:l)"),
                       {"c": code, "v": ver, "n": i,
                        "m": line.get("material_code"), "q": line.get("qty"),
                        "u": line.get("unit") or "",
                        "l": line.get("loss_rate") or 0})
    return resp.ok({"product_code": code, "version": ver,
                    "lines": len(lines)})


@router.patch("/masters/boms/{code}/{ver}/status")
def bom_status(code: str, ver: str, body: dict,
               adm: dict = Depends(auth.need_admin),
               db: Session = Depends(get_db)):
    st = str(body.get("status") or "")
    if st not in ("启用", "停用", "草稿"):
        return resp.fail(400, "BOM状态非法")
    with db.begin():
        if st == "启用":
            db.execute(text("UPDATE bom_master SET status='停用'"
                            " WHERE product_code=:c AND version<>:v"),
                       {"c": code, "v": ver})
        hit = db.execute(text("UPDATE bom_master SET status=:s"
                              " WHERE product_code=:c AND version=:v"),
                         {"s": st, "c": code, "v": ver})
        if not hit.rowcount:
            return resp.fail(404, "BOM版本不存在")
    return resp.ok({"product_code": code, "version": ver, "status": st})


@router.post("/masters/warehouses")
def warehouse_create(body: dict, adm: dict = Depends(auth.need_admin),
                     db: Session = Depends(get_db)):
    code, name = str(body.get("wh_code") or ""), str(body.get("name") or "")
    if not code or not name:
        return resp.fail(400, "仓库编码/名称必填")
    if _dup(db, "SELECT 1 FROM warehouse WHERE wh_code=:c", {"c": code}):
        return resp.fail(400, "仓库编码已存在:必须唯一")
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO warehouse(wh_code,name,wh_type,stock_kind,"
                        "manager,enabled,status)"
                        " VALUES(:c,:n,:t,:k,:m,1,'启用')"),
                   {"c": code, "n": name, "t": body.get("wh_type"),
                    "k": body.get("stock_kind"), "m": body.get("manager")})
    return resp.ok({"wh_code": code})


@router.post("/masters/locations")
def location_create(body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    code, wh = str(body.get("loc_code") or ""), str(body.get("wh_code") or "")
    if not code or not wh:
        return resp.fail(400, "库位编码/所属仓库必填")
    if not _dup(db, "SELECT 1 FROM warehouse WHERE wh_code=:w", {"w": wh}):
        return resp.fail(400, "所属仓库不存在")
    if _dup(db, "SELECT 1 FROM location WHERE loc_code=:c", {"c": code}):
        return resp.fail(400, "库位编码已存在:必须唯一")
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO location(loc_code,wh_code,zone_label,"
                        "capacity,enabled,status)"
                        " VALUES(:c,:w,:z,:p,1,'启用')"),
                   {"c": code, "w": wh, "z": body.get("zone_label"),
                    "p": body.get("capacity")})
    return resp.ok({"loc_code": code})


@router.post("/masters/customers")
def customer_create(body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    import time
    cid = str(body.get("cust_id") or "KH%d" % int(time.time()))
    if not body.get("name"):
        return resp.fail(400, "客户名称必填")
    if _dup(db, "SELECT 1 FROM customer WHERE cust_id=:c", {"c": cid}):
        return resp.fail(400, "客户ID已存在:必须唯一")
    db.rollback()
    with db.begin():
        db.execute(text("INSERT INTO customer(cust_id,name,cust_type,contact,"
                        "phone,status) VALUES(:c,:n,:t,:o,:p,'启用')"),
                   {"c": cid, "n": body.get("name"),
                    "t": body.get("cust_type"), "o": body.get("contact"),
                    "p": body.get("phone")})
    return resp.ok({"cust_id": cid})


@router.patch("/masters/warehouses/{code}/status")
def warehouse_status(code: str, body: dict, adm: dict = Depends(auth.need_admin),
                     db: Session = Depends(get_db)):
    en = 0 if str(body.get("enabled")) == "0" else 1
    db.rollback()
    with db.begin():
        hit = db.execute(text("UPDATE warehouse SET enabled=:e,status=:s"
                              " WHERE wh_code=:c"),
                         {"e": en, "s": "停用" if not en else "启用",
                          "c": code})
        if not hit.rowcount:
            return resp.fail(404, "仓库不存在")
    return resp.ok({"wh_code": code, "enabled": en})


@router.patch("/masters/locations/{code}/status")
def location_status(code: str, body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    en = 0 if str(body.get("enabled")) == "0" else 1
    db.rollback()
    with db.begin():
        hit = db.execute(text("UPDATE location SET enabled=:e,status=:s"
                              " WHERE loc_code=:c"),
                         {"e": en, "s": "停用" if not en else "启用",
                          "c": code})
        if not hit.rowcount:
            return resp.fail(404, "库位不存在")
    return resp.ok({"loc_code": code, "enabled": en})


@router.patch("/masters/customers/{cid}/status")
def customer_status(cid: str, body: dict, adm: dict = Depends(auth.need_admin),
                    db: Session = Depends(get_db)):
    st = "停用" if str(body.get("enabled")) == "0" else "启用"
    db.rollback()
    with db.begin():
        hit = db.execute(text("UPDATE customer SET status=:s"
                              " WHERE cust_id=:c"), {"s": st, "c": cid})
        if not hit.rowcount:
            return resp.fail(404, "客户不存在")
    return resp.ok({"cust_id": cid, "status": st})

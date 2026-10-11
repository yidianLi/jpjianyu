"""主档路由:物料/成品/BOM/仓储地点/客户组织.只读为主,写口仅管理员."""
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


@router.get("/meta/biz_states")
def biz_states(authed: dict = Depends(auth.need_auth),
               db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT sid,biz,name,bill_no_format,enabled"
                           " FROM sys_biz_state ORDER BY sid")).mappings().all()
    return resp.ok([dict(r) for r in rows], total=len(rows))

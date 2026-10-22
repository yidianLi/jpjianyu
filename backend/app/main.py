"""WMS 后端入口:挂载九路由+跨域+原型静态托管.每文件<=300行."""
import os
import re
import logging
import jwt as _jwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse, Response, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from app.core.resp import fail
from app.core import auth as _auth
from app.routers import web, app_, app_scan, app_ops, ai, masters, sysadm, reports, transfer, produce, docparts, export, stockops, rptbuilder

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

# API 文档从 /docs 挪到 /api-docs,把 /docs 这个干净地址让给站内"单据"页。
app = FastAPI(title="WMS API V2.3", version="2.3.0",
              docs_url="/api-docs", redoc_url=None, openapi_url="/openapi.json")

# CORS 收紧:从环境变量 WMS_CORS_ORIGINS 读取白名单(逗号分隔),默认仅放行本地前端。
# 不再使用 allow_origins=["*"],避免任意站点携带请求调用本服务。
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("WMS_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware,
                   allow_origins=_ALLOWED_ORIGINS or ["http://localhost:5173"],
                   allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"],
                   allow_headers=["*"], allow_credentials=False)


@app.exception_handler(RequestValidationError)
async def _val_err(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422,
                        content=fail(422, "参数校验失败:" + str(exc.errors())[:300]))


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    logging.exception("未捕获异常: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content=fail(500, "服务器内部错误"))


# ---------------------------------------------------------------------------
# 功能权限网关:按(方法+路径)查动作,依当前用户多角色并集(funcs)鉴权,不足则 403.
# 只读(GET)默认放行以保可用;此处仅收敛"写/审批/过账/导出/配置"等高危动作.
# 管理员(func '*' 或 R-ADMIN)一律放行.
# ---------------------------------------------------------------------------
from app.core import perms as _perms  # noqa: E402
from app.core.db import SessionLocal as _SessionLocal  # noqa: E402

_P = "POST"
_PUT = "PUT"
_DEL = "DELETE"
_GET = "GET"
_PERM_RULES = [
    ({_P}, re.compile(r"^/api/v1/web/docs$"), "录入"),
    ({_P}, re.compile(r"^/api/v1/web/docs/[^/]+/submit$"), "录入"),
    ({_P}, re.compile(r"^/api/v1/web/docs/[^/]+/approve$"), "审批"),
    ({_P}, re.compile(r"^/api/v1/web/docs/[^/]+/post$"), "过账"),
    ({_P}, re.compile(r"^/api/v1/web/docs/[^/]+/attachments$"), "录入"),
    ({_DEL}, re.compile(r"^/api/v1/web/docs/[^/]+/attachments/[^/]+$"), "修改"),
    ({_P}, re.compile(r"^/api/v1/web/transfer_ships$"), "录入"),
    ({_P}, re.compile(r"^/api/v1/web/pd_tasks"), "确认"),
    ({_P}, re.compile(r"^/api/v1/web/(wo_tasks|prod_plans|sale_orders|deliver_signs)"), "录入"),
    ({_P}, re.compile(r"^/api/v1/web/stock/(qc|freeze|unfreeze|reserve|release)$"), "确认"),
    ({_P}, re.compile(r"^/api/v1/web/fee_settles/[^/]+/confirm$"), "确认"),
    ({_P}, re.compile(r"^/api/v1/web/fee_settles$"), "录入"),
    ({_P}, re.compile(r"^/api/v1/web/label_prints$"), "录入"),
    ({_GET}, re.compile(r"^/api/v1/web/export/"), "导出"),
    ({_P}, re.compile(r"^/api/v1/web/custom_reports/(run|[^/]+/generate)$"), "查看"),
    ({_P, _PUT, _DEL}, re.compile(r"^/api/v1/web/custom_reports"), "修改"),
    ({_P}, re.compile(r"^/api/v1/web/rpt_instances/generate$"), "查看"),
    ({_P}, re.compile(r"^/api/v1/web/rpt_instances/[^/]+/publish$"), "审批"),
    ({_P, _PUT, _DEL}, re.compile(r"^/api/v1/web/print_templates"), "修改"),
    ({_P, _PUT, _DEL}, re.compile(r"^/api/v1/web/masters/"), "修改"),
]


def _match_action(method: str, path: str):
    for methods, pat, act in _PERM_RULES:
        if method in methods and pat.match(path):
            return act
    return None


@app.middleware("http")
async def _func_perm_guard(request: Request, call_next):
    try:
        act = _match_action(request.method, request.url.path)
        if act:
            user = _auth.decode_username(request.headers.get("authorization", ""))
            if user:
                db = _SessionLocal()
                try:
                    ok = _perms.has_func(db, user, act)
                finally:
                    db.close()
                if not ok:
                    return JSONResponse(status_code=403, content={
                        "code": 403, "msg": "PERM_DENIED:无「%s」权限" % act,
                        "data": None, "total": 0})
    except Exception:  # 网关异常不影响主流程;端点内仍有 need_auth 兜底
        logging.exception("功能权限网关异常,已放行: %s %s",
                          request.method, request.url.path)
    return await call_next(request)
app.include_router(web.router, prefix="/api/v1/web")
app.include_router(masters.router, prefix="/api/v1/web")
app.include_router(sysadm.router, prefix="/api/v1/web")
app.include_router(reports.router, prefix="/api/v1/web")
app.include_router(rptbuilder.router, prefix="/api/v1/web")
app.include_router(transfer.router, prefix="/api/v1/web")
app.include_router(produce.router, prefix="/api/v1/web")
app.include_router(docparts.router, prefix="/api/v1/web")
app.include_router(export.router, prefix="/api/v1/web")
app.include_router(stockops.router, prefix="/api/v1/web")
app.include_router(app_.router, prefix="/api/v1/app")
app.include_router(app_scan.router, prefix="/api/v1/app")
app.include_router(app_ops.router, prefix="/api/v1/app")
app.include_router(ai.router, prefix="/api/v1/ai")


@app.get("/health")
def health() -> dict:
    return {"code": 200, "msg": "成功", "data": {"ok": True}, "total": 1}


PROTO = "/prototype"
if not os.path.isdir(PROTO):
    PROTO = os.path.join(os.path.dirname(__file__), "..", "..", "prototype")
# ---------------------------------------------------------------------------
# 干净 URL:域名根路径直达驾驶舱,站内页面地址一律不带 .html
# 原理:源 HTML 一行不改,由后端在返回时做两件事——
#   1) 把相对资源 ../assets/ 换成绝对路径 /proto/assets/,页面照常加载;
#   2) 把引号内的 "xxx.html" / "../xxx.html" 跳转改成无扩展名干净地址,
#      并为每个页面提供同名路由("/material-workbench" -> pages/material-workbench.html)。
# ---------------------------------------------------------------------------
PAGES_DIR = os.path.join(PROTO, "pages")
_ASSET_RE = re.compile(r"\.\./assets/")
# 根目录壳层(app.html)用的是不带 ../ 的 assets/xx,干净 URL 下需一并改绝对路径
_ASSET_ROOT_RE = re.compile(r"(?<![\w./-])assets/")
# 给页面引用的 js/css 追加文件指纹(?v=mtime),改动后浏览器立即生效,无需手动强刷
_ASSET_VER_RE = re.compile(r"/proto/assets/([A-Za-z0-9_.\-]+\.(?:js|css))")
_LINK_RE = re.compile(
    r"(?P<q>['\"])(?:\.\./)?(?P<name>[A-Za-z0-9_\-]+)\.html(?P<tail>[?#][^'\"]*)?(?P=q)")


def _asset_versioned(m: "re.Match") -> str:
    name = m.group(1)
    try:
        v = int(os.path.getmtime(os.path.join(PROTO, "assets", name)))
    except OSError:
        return m.group(0)
    return "/proto/assets/%s?v=%d" % (name, v)


# ---------------------------------------------------------------------------
# 外部 CDN 本地化:源 HTML 里的 tailwind / font-awesome / unsplash 外链在返回时
# 改写到 /proto/assets/ 下的本地副本,消除首屏对外部 CDN 的依赖。
# 实测首屏慢的根因就是这几个外链(cdn.tailwindcss.com ~1.8s、cdnjs.cloudflare.com
# ~4s、images.unsplash.com ~0.6s),本地化后本地仅 0.15–0.4s。
# 只改返回内容、不动源 HTML,既覆盖全部页面,又避免与工作区里其他人未提交的
# 页面改动冲突;本地文件扁平放在 /proto/assets/ 下,.js/.css 自动吃到 ?v=mtime 指纹。
# ---------------------------------------------------------------------------
_CDN_TAILWIND_RE = re.compile(r"https://cdn\.tailwindcss\.com(?:/[0-9.]+)?")
_CDN_FONTAWESOME_RE = re.compile(
    r"https://cdnjs\.cloudflare\.com/ajax/libs/font-awesome/[0-9.]+/css/all\.min\.css")
_CDN_UNSPLASH_RE = re.compile(
    r"https://images\.unsplash\.com/photo-([0-9A-Za-z\-]+)\?[^\"'\s>)]*")
_UNSPLASH_LOCAL = {
    "1553413077-190dd305871c": "/proto/assets/img/warehouse.jpg",
    "1587293852726-70cdb56c2866": "/proto/assets/img/store-scene.jpg",
    "1586528116311-ad8dd3c8310d": "/proto/assets/img/logistics.jpg",
    "1560250097-0b93528c311a": "/proto/assets/img/avatar.jpg",
}


def _localize_cdn(html: str) -> str:
    """外部 CDN 引用(尚未本地化时)替换为 /proto/assets/ 下的本地副本."""
    html = _CDN_TAILWIND_RE.sub("/proto/assets/tailwind.min.js", html)
    html = _CDN_FONTAWESOME_RE.sub("/proto/assets/fontawesome.min.css", html)
    html = _CDN_UNSPLASH_RE.sub(
        lambda m: _UNSPLASH_LOCAL.get(m.group(1), m.group(0)), html)
    return html


def _beautify(html: str) -> str:
    """外链 CDN 本地化;相对资源改绝对路径;*.html 跳转改无扩展名(保留 ?query / #hash)."""
    html = _localize_cdn(html)
    html = _ASSET_RE.sub("/proto/assets/", html)
    html = _ASSET_ROOT_RE.sub("/proto/assets/", html)
    html = _ASSET_VER_RE.sub(_asset_versioned, html)
    return _LINK_RE.sub(
        lambda m: "%s/%s%s%s" % (m.group("q"), m.group("name"),
                                 m.group("tail") or "", m.group("q")), html)


def _page_file(name: str) -> str:
    for cand in (os.path.join(PAGES_DIR, name + ".html"),
                 os.path.join(PROTO, name + ".html")):
        if os.path.isfile(cand):
            return cand
    return ""


def _serve_page(name: str) -> HTMLResponse:
    fp = _page_file(name)
    if not fp:
        return JSONResponse(status_code=404, content=fail(404, "页面不存在"))
    with open(fp, encoding="utf-8") as f:
        return HTMLResponse(_beautify(f.read()),
                            headers={"Cache-Control": "no-store"})


if os.path.isdir(PAGES_DIR):

    @app.get("/proto/pages/{name}.html", include_in_schema=False)
    def legacy_page(name: str, request: Request) -> RedirectResponse:
        """旧地址 /proto/pages/x.html 永久跳到干净地址 /x,保证地址始终一致."""
        q = request.url.query
        return RedirectResponse("/" + name + (("?" + q) if q else ""),
                                status_code=301)


if os.path.isdir(PROTO):
    app.mount("/proto", StaticFiles(directory=PROTO, html=True), name="proto")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> RedirectResponse:
        return RedirectResponse("/proto/assets/icon-192.png")


def _cookie_valid(request: Request) -> bool:
    """校验会话 Cookie(wms_session)中的 JWT 是否有效,用于页面级登录门禁."""
    tok = request.cookies.get("wms_session")
    if not tok:
        return False
    try:
        _jwt.decode(tok, _auth.JWT_SECRET, algorithms=[_auth.JWT_ALGO])
        return True
    except Exception:
        return False


# 免登录即可访问的页面(登录页/登出动作)
_PUBLIC_PAGES = {"login", "logout"}


if os.path.isdir(PAGES_DIR):

    @app.get("/", include_in_schema=False)
    def index(request: Request) -> Response:
        # 首页 = 工作台-首页(home.html);未登录跳登录页
        if not _cookie_valid(request):
            return RedirectResponse("/login", status_code=307)
        return _serve_page("home")

    @app.get("/app", include_in_schema=False)
    def app_shell(request: Request) -> Response:
        # 壳首页:未登录回登录页;登录后直出壳(app.html),默认视图由前端按 ?page=home 落工作台-首页
        if not _cookie_valid(request):
            return RedirectResponse("/login", status_code=307)
        fp = os.path.join(PROTO, "app.html")
        if not os.path.isfile(fp):
            return JSONResponse(status_code=404,
                                content=fail(404, "页面不存在"))
        with open(fp, encoding="utf-8") as f:
            return HTMLResponse(_beautify(f.read()),
                                headers={"Cache-Control": "no-store"})

    @app.get("/{name}.html", include_in_schema=False)
    def legacy_any_html(name: str, request: Request) -> RedirectResponse:
        """兜底:任何 /xxx.html 请求统一 301 到干净地址 /xxx.
        前端 JS 中仍存在旧式 .html 跳转(菜单、goPage 等),在此统一收口,
        避免出现 /home.html 之类的 404。"""
        q = request.url.query
        return RedirectResponse("/" + name + (("?" + q) if q else ""),
                                status_code=301)

    @app.get("/{page}", include_in_schema=False)
    def clean_page(page: str, request: Request) -> Response:
        if page in _PUBLIC_PAGES:
            if page == "logout":
                r = RedirectResponse("/login", status_code=307)
                r.delete_cookie("wms_session", path="/")
                return r
            return _serve_page(page)
        # 其余所有页面均需登录态,未登录回登录页
        if not _cookie_valid(request):
            return RedirectResponse("/login", status_code=307)
        return _serve_page(page)

    @app.get("/pages/{name}.html", include_in_schema=False)
    def shell_page_fetch(name: str, request: Request) -> Response:
        """壳层(app.html)的 WMSView 以相对路径 pages/xxx.html fetch 子页面.
        干净 URL 部署下没有 /pages 静态目录,这里映射到美化后的同一页面;
        未登录返回 401(页面级门禁已在 /xxx 收口,此处仅保护内容接口)."""
        if name not in _PUBLIC_PAGES and not _cookie_valid(request):
            return JSONResponse(status_code=401, content=fail(401, "未登录"))
        return _serve_page(name)


# ---------------------------------------------------------------------------
# 壳层相对路径兜底
# app.html / index.html 位于 prototype 根目录,内部引用 "assets/xxx"、
# "pages/xxx.html"、"mobile-app/xxx.html" 都不带 ../ 前缀;在干净 URL
# (/app、/index)下这些引用会解析到站根而 404,表现为"assets 整目录缺失"。
# 这里统一映射回 /proto 下的真实文件(带防目录穿越校验)。
# ---------------------------------------------------------------------------
_PROTO_ROOT = os.path.normpath(PROTO)


@app.get("/{rel:path}", include_in_schema=False)
def proto_relative_fallback(rel: str) -> Response:
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if not parts or ".." in parts:
        return JSONResponse(status_code=404, content=fail(404, "资源不存在"))
    fp = os.path.normpath(os.path.join(_PROTO_ROOT, *parts))
    if not fp.startswith(_PROTO_ROOT + os.sep) or not os.path.isfile(fp):
        return JSONResponse(status_code=404, content=fail(404, "资源不存在"))
    if fp.endswith(".html"):
        with open(fp, encoding="utf-8") as f:
            return HTMLResponse(_beautify(f.read()),
                                headers={"Cache-Control": "no-store"})
    return FileResponse(fp)

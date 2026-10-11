"""WMS 后端入口:挂载九路由+跨域+原型静态托管.每文件<=300行."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.routers import web, app_, ai, masters, sysadm, reports, transfer, produce, docparts

app = FastAPI(title="WMS API V2.3", version="2.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(web.router, prefix="/api/v1/web")
app.include_router(masters.router, prefix="/api/v1/web")
app.include_router(sysadm.router, prefix="/api/v1/web")
app.include_router(reports.router, prefix="/api/v1/web")
app.include_router(transfer.router, prefix="/api/v1/web")
app.include_router(produce.router, prefix="/api/v1/web")
app.include_router(docparts.router, prefix="/api/v1/web")
app.include_router(app_.router, prefix="/api/v1/app")
app.include_router(ai.router, prefix="/api/v1/ai")


@app.get("/health")
def health() -> dict:
    return {"code": 200, "msg": "成功", "data": {"ok": True}, "total": 1}


PROTO = os.path.join(os.path.dirname(__file__), "..", "..", "prototype")
if os.path.isdir(PROTO):
    app.mount("/proto", StaticFiles(directory=PROTO, html=True), name="proto")


@app.get("/")
def index() -> RedirectResponse:
    return RedirectResponse("/proto/pages/dashboard.html")

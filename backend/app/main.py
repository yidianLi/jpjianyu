"""WMS 后端入口:挂载 web/masters/app/ai/sysadm 五路由.每文件<=300行."""
from fastapi import FastAPI
from app.routers import web, app_, ai, masters, sysadm

app = FastAPI(title="WMS API V2.3", version="2.3.0")
app.include_router(web.router, prefix="/api/v1/web")
app.include_router(masters.router, prefix="/api/v1/web")
app.include_router(sysadm.router, prefix="/api/v1/web")
app.include_router(app_.router, prefix="/api/v1/app")
app.include_router(ai.router, prefix="/api/v1/ai")


@app.get("/health")
def health() -> dict:
    return {"code": 200, "msg": "成功", "data": {"ok": True}, "total": 1}

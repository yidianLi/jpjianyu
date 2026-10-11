"""PDA端 app 路由:待办/扫码/清单/提交/补传.与 api-client.js 对齐."""
from fastapi import APIRouter, Depends
from app.core import resp, auth

router = APIRouter()


@router.get("/todos")
def todos(mine: int = 1, authed: dict = Depends(auth.need_auth)):
    auth.need_app_device(authed)
    return resp.ok({"mine": mine, "rows": []}, total=0)


@router.post("/scan")
def scan(body: dict, authed: dict = Depends(auth.need_auth)):
    auth.need_app_device(authed)
    code = str(body.get("code") or "")
    if not code:
        return resp.fail(400, "扫码内容为空")
    return resp.ok({"code": code, "result": "OK"})


@router.get("/checklists")
def checklist(orderId: str = "", authed: dict = Depends(auth.need_auth)):
    return resp.ok({"orderId": orderId, "items": []}, total=0)


@router.post("/checklists/confirm")
def confirm(body: dict, authed: dict = Depends(auth.need_auth)):
    items = body.get("items") or []
    if not items:
        return resp.fail(400, "CHECKLIST_EMPTY:验收清单不能为空")
    for item in items:
        if not item.get("checked"):
            return resp.fail(400, "CHECKLIST_INCOMPLETE:请逐项确认")
    return resp.ok({"orderId": body.get("orderId"), "status": "ACCEPTED"})


@router.post("/submit")
def submit(body: dict, authed: dict = Depends(auth.need_auth)):
    return resp.ok({"orderId": "LY000001", "queued": False})


@router.post("/sync/flush")
def flush(authed: dict = Depends(auth.need_auth)):
    return resp.ok({"msg": "队列已清空"})

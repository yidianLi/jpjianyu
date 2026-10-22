"""PDA 照片回传:壳端把扫描拍照的位图(base64 data_url)POST 上来,落盘后返回可引用 URL.

口径与附件一致("只记引用不搬大文件"):这里只把照片本身存到 uploads/ 并给出 URL,
业务单据侧仍以 doc_attachment.ref 记录该 URL,不进业务库.

不引 multipart 依赖:现场弱网 + 壳端已持有 data_url,走 JSON 更省事也更稳.
"""
import base64
import binascii
import os
import time
import uuid

from fastapi import APIRouter, Depends

from app.core import resp, auth

router = APIRouter()

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.getenv("WMS_UPLOAD_DIR") or os.path.join(_HERE, "uploads")
MAX_BYTES = 8 * 1024 * 1024
_ALLOWED_EXT = (".jpg", ".png")


def _ext_of(blob: bytes) -> str:
    if blob[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    return ""


@router.post("/photos")
def upload_photo(body: dict, authed: dict = Depends(auth.need_auth)):
    """上传一张现场照片(JSON base64),返回 {url,name,size}.

    - data_url 形如 data:image/jpeg;base64,xxxx,也接受裸 base64;
    - 仅允许 JPEG/PNG,单张 ≤8MB;
    - 需 PDA 设备令牌(与 /app/* 其余接口同一口径).
    """
    auth.need_app_device(authed)
    raw = str(body.get("data_url") or body.get("base64") or "").strip()
    if not raw:
        return resp.fail(400, "照片内容为空")
    if raw.startswith("data:"):
        if "," not in raw:
            return resp.fail(400, "照片 data_url 格式非法")
        raw = raw.split(",", 1)[1]
    try:
        blob = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return resp.fail(400, "照片 base64 非法")
    if not blob:
        return resp.fail(400, "照片内容为空")
    if len(blob) > MAX_BYTES:
        return resp.fail(400, "照片超限(单张≤8MB)")
    ext = _ext_of(blob)
    if not ext:
        return resp.fail(400, "仅支持 JPEG/PNG 照片")
    name = time.strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:12] + ext
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
            f.write(blob)
    except OSError:
        return resp.fail(500, "照片落盘失败(检查 uploads 目录可写)")
    return resp.ok({"url": "/uploads/" + name, "name": name,
                    "size": len(blob)})
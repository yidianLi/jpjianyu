"""PaddleOCR适配升级:视觉模型读图成行项JSON,本地验算,不编造.
借E:/智能识别再整理的路数:AI只整理+本地校验+人工确认."""
import json
import os
import urllib.request

ENDPOINT = os.getenv("LLM_BASE_URL", "https://api.a6api.com/v1").rstrip("/")
API_KEY = os.getenv("LLM_API_KEY", "")
VISION_MODEL = os.getenv("OCR_VISION_MODEL", "qwen3.8-omni-flash")
TIMEOUT = int(os.getenv("LLM_TIMEOUT_S", "60"))
PROVIDER = os.getenv("OCR_PROVIDER", "online")

PROMPT = ("你是仓库单据录入员.看图提取表格明细行,只输出JSON,无解释."
          "格式:{rows:[{name,unit,qty,price,amount,pack,note,conf}],"
          "total}.qty/price/amount只留数字;看不清填空串并conf标0.3以下;"
          "没有填空串,不编造;非明细行(标题/合计/签名)不要.")

STUB = {"provider": "local-stub", "rows": [], "issues": ["未传图或无Key,走规则桩"],
        "conf": 0.0, "tip": "低置信标红,人工覆盖才入单"}


def _first_json(txt: str) -> dict:
    start = txt.find("{")
    if start < 0:
        return {}
    depth, in_str, esc = 0, False, False
    for i in range(start, len(txt)):
        ch = txt[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if not depth:
                try:
                    return json.loads(txt[start:i + 1])
                except Exception:
                    return {}
    return {}


def _verify(rows):
    issues = []
    total = 0.0
    for n, r in enumerate(rows, 1):
        try:
            q = float(r.get("qty") or 0)
            p = float(r.get("price") or 0)
            a = float(r.get("amount") or 0)
        except (TypeError, ValueError):
            issues.append("第%d行数字非法,待人工" % n)
            continue
        total += a
        if q and p and abs(q * p - a) > 1.0:
            issues.append("第%d行数量×单价≠金额,待人工" % n)
        try:
            if float(r.get("conf", 1)) < 0.6:
                issues.append("第%d行低置信,须核对原图" % n)
        except (TypeError, ValueError):
            pass
    return issues, round(total, 2)


def recognize(image: str, doc_type: str = "delivery") -> dict:
    img = str(image or "")
    if not img or not API_KEY or "base64" not in img:
        return dict(STUB, provider=PROVIDER or "online")
    if not img.startswith("data:"):
        img = "data:image/jpeg;base64," + img
    if len(img) > 900000:
        out = dict(STUB)
        out["issues"] = ["图过大(%.1fKB),请压缩到1600px内再传" % (len(img) / 1024)]
        return out
    payload = {"model": VISION_MODEL, "temperature": 0, "messages": [{
        "role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": img}}]}]}
    try:
        req = urllib.request.Request(
            ENDPOINT + "/chat/completions", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + API_KEY})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = json.loads(r.read().decode())
        txt = body["choices"][0]["message"]["content"]
        data = _first_json(txt)
        rows = data.get("rows") if isinstance(data.get("rows"), list) else []
        rows = [r for r in rows if isinstance(r, dict) and
                any(str(r.get(k) or "") for k in ("name", "qty", "amount"))]
        issues, total = _verify(rows)
        confs = [float(r.get("conf", 0.8)) for r in rows]
        conf = round(sum(confs) / len(confs), 2) if confs else 0.0
        return {"provider": "a6-vision:" + VISION_MODEL, "rows": rows,
                "issues": issues, "total": total, "conf": conf,
                "tip": "低置信标红,人工覆盖才入单"}
    except Exception as err:
        out = dict(STUB)
        out["issues"] = ["视觉调用失败,走规则桩:" + str(err)[:120]]
        return out

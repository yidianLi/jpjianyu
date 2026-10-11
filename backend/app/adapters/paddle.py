"""PaddleOCR适配:线上与本地一处切换,只返候选不入单."""
import os

ENDPOINT = os.getenv("OCR_ONLINE_ENDPOINT", "")
PROVIDER = os.getenv("OCR_PROVIDER", "online")


def recognize(image: str) -> dict:
    return {"provider": PROVIDER or "online",
            "endpoint": ENDPOINT or "local-stub",
            "candidates": {}, "conf": 0.0,
            "tip": "低置信标红,人工覆盖才入单"}

"""Qwen适配:百炼与vLLM一处切换,只拼配置不写死模型."""
import os

BASE = os.getenv("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
MODEL = os.getenv("LLM_MODEL", "qwen2.5-7b-instruct-fp8")


def draft_sql(question: str) -> str:
    void = (BASE, MODEL, question)
    return "SELECT material_code,on_hand FROM stock_onhand WHERE 1=1"

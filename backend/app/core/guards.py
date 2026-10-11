"""AI护栏:单条SELECT+表白名单+MySQL5.6方言+LIMIT<=200."""
import re

ALLOW = {"doc_main", "doc_line", "stock_onhand", "stock_ledger",
         "material_item", "batch", "product_master", "bom_master",
         "bom_line", "wo_task"}
DENY = {"insert", "update", "delete", "drop", "alter", "grant",
        "truncate", "post", "过账", "确认验收"}


def check_question(q: str) -> str:
    low = (q or "").lower()
    if any(w in low for w in DENY):
        return "写操作禁过账,AI只读."
    if re.search(r"with\s|over\s*\(|json_", q or "", re.I):
        return "MySQL5.6方言禁CTE/窗口/JSON函数."
    return ""


def check_sql(sql: str) -> str:
    s = re.sub(r"\s+", " ", (sql or "").strip())
    if not re.match(r"^select\b", s, re.I):
        return "只允许单条SELECT."
    low = s.lower()
    if any(re.search(r"\b" + w + r"\b", low) for w in DENY):
        return "SQL含禁写词,已拒绝."
    if re.search(r"with\s|over\s*\(|json_", s, re.I):
        return "SQL超出MySQL5.6方言,已拒绝."
    if not any(t in low for t in ALLOW):
        return "SQL表不在白名单,已拒绝."
    return ""

"""Qwen适配:线上a6api兼容接口真调,失败回退规则模板.只出单条SELECT."""
import json
import os
import urllib.request

BASE = os.getenv("LLM_BASE_URL", "https://api.a6api.com/v1").rstrip("/")
MODEL = os.getenv("LLM_MODEL", "qwen-max")
API_KEY = os.getenv("LLM_API_KEY", "")
TIMEOUT = int(os.getenv("LLM_TIMEOUT_S", "30"))

SYSTEM = ("你是WMS只读问数助手.只输出一条MySQL5.6方言SELECT,无解释无代码块."
          "可用表:doc_main,doc_line,stock_onhand,stock_ledger,material_item,batch,"
          "product_master,bom_master,bom_line,wo_task."
          "常用:现存查stock_onhand(字段material_code,product_code,batch_no,wh,loc,"
          "on_hand,avail);流水查stock_ledger(字段doc_no,biz,qty,unit,by_user,at);"
          "单据查doc_main(字段doc_no,type,biz_status,handler,at)."
          "必须带LIMIT 200.禁止INSERT/UPDATE/DELETE/CTE/窗口函数/JSON函数.")

STUB = "SELECT material_code,on_hand FROM stock_onhand WHERE 1=1"


def draft_sql(question: str) -> str:
    if not API_KEY:
        return STUB
    payload = {"model": MODEL, "temperature": 0,
               "messages": [{"role": "system", "content": SYSTEM},
                            {"role": "user", "content": question[:500]}]}
    try:
        req = urllib.request.Request(
            BASE + "/chat/completions", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + API_KEY})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = json.loads(r.read().decode())
        sql = body["choices"][0]["message"]["content"].strip()
        if sql.startswith("```"):
            sql = sql.strip("`").split("\n", 1)[-1].strip()
            if sql.lower().startswith("sql"):
                sql = sql[3:].strip()
        return sql.split(";")[0].strip() or STUB
    except Exception:
        return STUB

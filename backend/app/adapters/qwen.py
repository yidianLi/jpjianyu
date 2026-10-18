"""Qwen适配:线上a6api兼容接口真调,失败回退规则模板.只出单条SELECT."""
import json
import os
import logging
import httpx

BASE = os.getenv("LLM_BASE_URL", "https://api.a6api.com/v1").rstrip("/")
MODEL = os.getenv("LLM_MODEL", "qwen-max")
API_KEY = os.getenv("LLM_API_KEY", "")
TIMEOUT = float(os.getenv("LLM_TIMEOUT_S", "30"))

SYSTEM = ("你是WMS只读问数助手.只输出一条MySQL5.6方言SELECT,无解释无代码块."
          "可用表:doc_main,doc_line,stock_onhand,stock_ledger,material_item,batch,"
          "product_master,bom_master,bom_line,wo_task."
          "常用:现存查stock_onhand(字段material_code,product_code,batch_no,wh,loc,"
          "on_hand,avail);流水查stock_ledger(字段doc_no,biz,qty,unit,by_user,at);"
          "单据查doc_main(字段doc_no,type,biz_status,handler,at)."
          "必须带LIMIT 200.禁止INSERT/UPDATE/DELETE/CTE/窗口函数/JSON函数.")

STUB = "SELECT material_code,on_hand FROM stock_onhand WHERE 1=1"

# 离线/网关失败时的关键词规则:把常见问题路由到真实 MySQL SELECT,
# 至少答得靠谱(而非一份通用 dump).顺序从具体到宽泛.
_RULES = [
    (("效期", "过期", "临期", "保质"),
     "SELECT batch_no,material_code,expire_date FROM batch"
     " WHERE expire_date IS NOT NULL ORDER BY expire_date LIMIT 200"),
    (("可用", "现存", "库存", "余量", "在库"),
     "SELECT material_code,batch_no,loc,on_hand,avail FROM stock_onhand"
     " ORDER BY material_code LIMIT 200"),
    (("待办", "未完成", "草稿", "审批中"),
     "SELECT doc_no,type,biz_status FROM doc_main"
     " WHERE biz_status IN ('DRAFT','APPROVING') ORDER BY at DESC LIMIT 200"),
    (("流水", "台账", "出入库", "过账", "收发"),
     "SELECT doc_no,line_no,biz,qty,unit,by_user,at FROM stock_ledger"
     " ORDER BY at DESC LIMIT 200"),
    (("单据", "单号", "入库单", "领用单", "退货"),
     "SELECT doc_no,type,biz_status,handler,at FROM doc_main"
     " ORDER BY at DESC LIMIT 200"),
    (("客户", "对账", "加工费", "结算"),
     "SELECT settle_no,customer,period,qty_fin,amount,biz_status"
     " FROM fee_settle ORDER BY settle_no DESC LIMIT 200"),
    (("条码", "单件", "一物一码", "扫码"),
     "SELECT barcode,material_code,batch_no,status FROM material_item"
     " ORDER BY barcode LIMIT 200"),
]


def _rule_sql(question: str) -> str:
    for keys, sql in _RULES:
        if any(k in question for k in keys):
            return sql
    return STUB


def draft_sql(question: str) -> str:
    if not API_KEY:
        return _rule_sql(question)
    payload = {"model": MODEL, "temperature": 0,
               "messages": [{"role": "system", "content": SYSTEM},
                            {"role": "user", "content": question[:500]}]}
    try:
        r = httpx.post(BASE + "/chat/completions", json=payload,
                       headers={"Content-Type": "application/json",
                                "Authorization": "Bearer " + API_KEY},
                       timeout=TIMEOUT)
        r.raise_for_status()
        body = r.json()
        sql = body["choices"][0]["message"]["content"].strip()
        if sql.startswith("```"):
            sql = sql.strip("`").split("\n", 1)[-1].strip()
            if sql.lower().startswith("sql"):
                sql = sql[3:].strip()
        return sql.split(";")[0].strip() or _rule_sql(question)
    except Exception as err:
        # 网关异常(断网/超时/额度)明确记录并回退到关键词规则,保证离线也能答对方向
        logging.warning("LLM 调用失败,回退关键词规则: %s", err)
        return _rule_sql(question)

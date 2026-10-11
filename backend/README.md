# WMS 后端启动说明

## 要求

- Python 3.11 / MySQL 5.6（`wms.sql V2.3` 为真源，不换库）
- 每文件 ≤300 行（阿里规约），命名见名知意；当前最长 `routers/web.py` 178 行，全员达标
- `python -m compileall -q app smoke.py` 全量编译通过，`python smoke.py` 11/11 通过
- 依赖以 `requirements.txt` 实测版本为准（2026-10-11 本机验证）

## 启动

```bash
cd E:/jianyu/backend
pip install -r requirements.txt
python smoke.py
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Docker 一键起：`docker compose up -d`（`mysql:5.6` + `wms-api`，`sql/wms.sql` 自动初始化，需先启动 Docker Desktop 守护进程）。

注意：新版 FastAPI（≥0.141）把 `include_router` 改为懒挂载，`app.routes` 里显示为
`_IncludedRouter` 占位、服务启动时才展开——属正常行为，不是路由丢失。
`smoke.py` 的 `routes-59` 项直接数九模块 `router.routes` 求和，不受此影响；
`health-200/openapi-59` 两项用 `TestClient` 拉起全应用验证展开后可达。

## 路由总表（九路由，对齐 api-V3 打印版 11 组）

- `GET /health` 健康检查
- `routers/web.py` PC 单据库存 12 口：`GET stock/onhand|ledger|batches|items|trace|docs|docs/{doc_no}|dashboard`，`POST docs|docs/{doc_no}/submit|post|approve`
- `routers/masters.py` 主档 12 口：`mat_categories|materials|products|boms|boms/{c}/{v}/lines|warehouses|locations|customers|org_tree|doc_templates`，`meta/biz_states|bill_methods`
- `routers/sysadm.py` 系统 6 口：`POST auth/login`，`GET auth/me|system/users|roles|equipment|sync_queue`
- `routers/reports.py` 报表审计 6 口：`GET rpt_configs|system/scan_logs|audit_logs|flow_instances`，`POST rpt_instances/generate|rpt_instances/{no}/publish`
- `routers/transfer.py` 调仓盘点 6 口：`POST transfer_ships|transfer_ships/{d}/receive|pd_tasks|pd_tasks/{p}/confirm`，`GET transfer_ships|pd_tasks/{p}/lines`
- `routers/produce.py` 成品生产 4 口：`POST wo_tasks|wo_tasks/{w}/issue|wo_tasks/{w}/finish|deliver_signs`
- `routers/docparts.py` 单据配套 4 口：`GET docs/{doc_no}/attachments|stock/doc_refs|fee_settles`，`POST label_prints`
- `routers/app_.py` PDA 6 口：`GET app/todos|checklists`，`POST app/scan|checklists/confirm|submit|sync/flush`
- `routers/ai.py` 网关 3 口：`POST ai/ask|text2sql|ocr`（只读禁过账，`LIMIT≤200`，写 `ai_qa_log`）

## 口径

- 单号 `前缀[SERIAL:6]`，中央发号 `sys_sequence`
- `unit` 必须等于档案 `base_unit`
- `SQ/JS/PD` 不动账；`LY` 超发 `OVER_ISSUE`；`TK-01=车间退料`
- 写口 `Idempotency-Key` 必填，重复 409 返原结果
- 驾驶舱公式：发料 `Σledger biz=LY`；成品入库 `Σledger biz=RK AND product_code LIKE 'CP-%'`；退料率 `ΣTK/ΣLY`
- 调仓二段 `o_qty→qty_sent→n_qty` + `diff_status`；盘点 `diff=N-O` 本身不动账，差异走 `TK/RK`
- WO 按 `bom_version` 展开领料，完工走 `RK sid=11300`；交付 `receiver/sign_time/proof_ref` 必填

## 验证记录

- step10（2026-10-11）：`wms.sql` 静态核查——64×`CREATE TABLE IF NOT EXISTS`、0 独立 `CREATE INDEX`、0 `CHECK`、JSON 仅注释/`COMMENT`、5 处 `ON DUPLICATE KEY` 种子幂等；容器联调待 Docker 守护进程就绪。
- step13（2026-10-11）：全文件行数核查——23 个 py 文件最长 138 行（`routers/web.py`），300 行红线全员通过；`compileall` 全过；冒烟 8/8（护栏/幂等/分页/返回体/驾驶舱公式）。
- step16（2026-10-11）：路由表补至八路由（+transfer/produce 10 口）；推送链路曾间歇中断（ICMP 通、`443` 时断时续），积压 3 提交一次补推成功。
- step20（2026-10-11）：路由表补至九路由（+docparts 4 口+batches/items/doc_templates/bill_methods 4 口）；`web.py` 178 行仍达标；原型 `dashboard/docs/ocr/scan` 4 页已接真接口（无后端自动回 Mock）。
- step22（2026-10-11）：`requirements.txt` 刷新为本机实测版本（fastapi 0.141.1/sqlalchemy 2.0.52/pydantic 2.13.5 等 7 包）；确认新版懒挂载无异常并记入本文档；冒烟 9/9。
- step23（2026-10-11）：冒烟加端到端 2 项（`TestClient` 拉起全应用：`/health` 200 + `openapi.json` 含 dashboard/aiask）；冒烟 11/11。

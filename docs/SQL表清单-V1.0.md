# SQL 表清单 V1.0（MySQL 5.6，可直接建）

> 版本：V1.0 / 2026-09-20 / 状态：待评审
> 依据：`prototype` 现状（`docs/receipt/dashboard/register/scan/data` + `backend/sql/ddl.sql` 12 表）+ `C:/Users/Administrator/Downloads` 相关资料：
> `表格_20260831.csv`（前台：分类导航/智能对话/分析矩阵/大屏/个人中心）、`表格_20260831 (1).csv`（后台：分类任务配置/数据源集成/知识记忆/分析能力配置/大屏可视化配置/权限审计）、`智能问答与数据分析平台原型.html`、`监狱工厂物料管理系统-完整方案流程图.html`、`梧州监狱…可行性方案/招标人需求（RFID版/二维码版）/采购清单/一期配套硬件清单`（只取业务口径，不取硬件选型）。
> 规范：MySQL 5.6 + InnoDB + utf8mb4；无 CHECK（应用层 `guards` 强制）；无 JSON 类型（JSON 存 TEXT）；主键业务表全 VARCHAR；数量必带 `qty+unit`（`DECIMAL(18,3)+VARCHAR`）；`at` 反引号包裹；溯源到 BT 批级。
> 永久约束 [PERMANENT]：单据前缀 `DJ/RK/LY/TL/PD` + `idem_key=doc_no:line_no:biz` 唯一；`stock_ledger` 只增不改、`PD` 不动账；命名空间 `/api/v1/web|app|ai`；错误码 `DUP_SCAN/OVER_ISSUE/SCOPE_DENIED`。

## 一、总览（共 33 表，分 8 组）

| 组 | 表数 | 表名 | 阶段 |
|---|---|---|---|
| A 业务核心 | 9 | `mat_master/batch/material_item/stock_onhand/stock_ledger/stock_doc_ref/doc_main/doc_line/doc_attachment` | P1/P2 已有，先用 |
| B 存证审计 | 2 | `scan_log/audit_log` | P1 已有 |
| C OCR/问答日志 | 3 | `ocr_document/ocr_field_result/ai_qa_log` | P5/P3 先建不连 |
| D 问答平台前台 | 7 | `ai_category/ai_shortcut/ai_prompt_tpl/ai_conversation/ai_message/ai_feedback/ai_favorite` | P3/P4 后接 |
| E 数据源集成 | 5 | `ds_source/ds_table_allow/ds_field_allow/ds_category_scope/ds_join_rel` | P6 真调前 |
| F 知识记忆 | 3 | `kb_memory/kb_public_doc/kb_evolve_log` | 二期（问答进化） |
| G 分析/报告/大屏 | 2 | `an_report_tpl/dash_component`（模板+组件合一，先合后拆） | P2 已有 `dashboard.html`，配置表后接 |
| H 权限 | 2 | `sys_role/sys_user_role`（用户沿用现有账号体系，不新建用户主表） | P6 前 |

## 二、A 组：业务核心（沿用 `backend/sql/ddl.sql`，一字不改结构）

| 表名 | 中文名 | 主键/唯一 | 关键字段 | 关联/说明 |
|---|---|---|---|---|
| `mat_master` | 物料主档 | `material_code PK` | `name/spec/unit/pack_qty/manage_mode(QTY)/status(启用)` | `register.html` 建档；`pack_qty` 扫箱码累加用 |
| `batch` | 批次 | `batch_no PK` | `material_code/partner_id/source_doc_no/created_by/at` | 建批即绑来源；溯源聚合单位 |
| `material_item` | 单件 | `barcode PK` | `material_code/batch_no/source_doc_no/status` | BT 级溯源可不逐件建，散件/重点件建；`scan.html` 校验它 |
| `stock_onhand` | 现存快照 | `PK(material_code,batch_no,wh,loc)` | `on_hand/avail/pending/quarantine/frozen` | 问答默认查它（快）；驾驶舱卡片源 |
| `stock_ledger` | 流水 | `id AI PK` + `idem_key UNIQUE` | `doc_no/line_no/material_code/batch_no/barcode/wh/loc/qty/unit/dir(+/-)/biz/by_user/device/at` | 只增不改；仲裁以它为准；`idem_key=doc_no:line_no:biz` |
| `stock_doc_ref` | 单据关联 | `UQ(from_doc,to_doc,rel)` | `from_doc/to_doc/rel` | 行数据表达关系：MVP `TL->LY/RK->DJ/PD->TK/RK`；二期加行不改表 |
| `doc_main` | 单据主 | `doc_no PK` | `type(DJ/RK/LY/TL/PD,应用层校验)/status/handler/at` | `register.html?biz=` 一页四态宿主 |
| `doc_line` | 单据行 | `PK(doc_no,line_no)` | `material_code/batch_no/qty/unit` | `FK->doc_main` |
| `doc_attachment` | 附件 | `id AI PK` | `doc_no/kind/ref(TEXT存JSON)/by_user/at` | 照片存证（`photoField` 压 1024px/jpeg0.7/≤6张） |

## 三、B 组：存证审计（已有）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `scan_log` | 扫码日志 | `code/result(OK/DUPLICATE/INVALID/MISMATCH)/doc_no/by_user/device/at` | `POST /app/scan` 写；重复/超领/串单拦截依据 |
| `audit_log` | 审计日志 | `by_user/action/doc_no/detail(TEXT)/at` | 过账/复核/调整单 `TZ` 留痕；`PD` 前后值记这里 |

## 四、C 组：OCR/问答日志（先建不连，真调时启用）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `ocr_document` | OCR 文档 | `ocr_id PK/doc_no/conf/ref(TEXT)/at` | `ocr.html#ocrBox` Mock `OCR2026091201/conf0.89`；真接口 `POST /ai/ocr` 后接 |
| `ocr_field_result` | OCR 字段候选 | `PK(ocr_id,field)/candidate(TEXT)/conf` | 只存候选；低置信须人工覆盖才入单 |
| `ai_qa_log` | 问答日志 | `by_user/question(TEXT)/sql_text(TEXT)/rows_count/ms/at` | 网关白名单放行才记；`docs.html#aiAsk` 9 预设演示用 |

## 五、D 组：问答平台前台（来源 `表格_20260831.csv` + 平台原型，P3/P4 后接）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `ai_category` | 分类（一/二级） | `cat_id PK/parent_id/name/icon/sort/enabled` | 左侧导航；一键智能生成分类体系后同步前端 |
| `ai_shortcut` | 快捷操作 | `shortcut_id PK/cat_id/type(检索/生成/执行/跳转)/sort/role_allow` | 顶部快捷栏；按使用行为推荐排序 |
| `ai_prompt_tpl` | Prompt 模板 | `tpl_id PK/cat_id/version/content(TEXT)/ab_group` | 每分类独立 Prompt；版本保存+一键回滚 |
| `ai_conversation` | 会话 | `sess_id PK/cat_id/by_user/title/at` | 多轮上下文关联；最大轮数配置放模板 |
| `ai_message` | 消息 | `msg_id AI PK/sess_id/role(q/a)/content(TEXT)/format` | 富文本/表格/步骤流多格式输出 |
| `ai_feedback` | 反馈 | `msg_id FK/result(符合/不符合)/reason` | 不符合可勾选问题类型；进 `kb_evolve_log` |
| `ai_favorite` | 收藏/个人快捷 | `by_user/kind(qa/report)/ref_id/sort` | 我的收藏+我的快捷合一；智能推荐一键生成 |

## 六、E 组：数据源集成（来源 `表格_20260831 (1).csv §2`，P6 真调前冻结）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `ds_source` | 数据源 | `src_id PK/kind(db/file/api)/host/port/db/read_user/sync_mode(直连/定时)/period` | 只存只读账号；连通性测试结果记 `audit_log` |
| `ds_table_allow` | 开放表 | `src_id/table_name/alias` | 一键扫描库表结构后推荐开放表 |
| `ds_field_allow` | 字段权限 | `src_id/table_name/field/alias/mask(掩码/替换/加密)/row_scope` | 敏感字段脱敏；行级权限（车间/仓库隔离） |
| `ds_category_scope` | 分类数据范围 | `cat_id FK->ai_category/src_id/table_name` | 每个业务分类可调用的数据源范围 |
| `ds_join_rel` | 跨库关联 | `src_a/table_a/field_a/src_b/table_b/field_b` | 多库主键关联；Text2SQL 跨库 JOIN 依据 |

## 七、F 组：知识记忆（来源 `表格_20260831 (1).csv §3`，二期）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `kb_memory` | 三层记忆 | `mem_id PK/layer(热/温/冷)/content(TEXT)/hit_count/status` | 确认入库沉淀为标准记忆；命中率决定升降级 |
| `kb_public_doc` | 公共知识库 | `doc_id PK/title/chunk(TEXT)/version/scope` | 制度文档上传解析分片；版本管理 |
| `kb_evolve_log` | 自进化记录 | `msg_id FK->ai_message/rule/batch_result/at` | 待优化聚类+批量标注全链路追溯 |

## 八、G/H 组：分析/大屏/权限（最小合一，先合后拆）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `an_report_tpl` | 分析报告模板 | `tpl_id PK/kind(单点/汇总/决策/报告/预测)/dim(TEXT)/metric(TEXT)/threshold(TEXT)` | 五类分析能力先一表+`kind`区分；`dashboard.html` 问答 `小蓝` 后接它 |
| `dash_component` | 大屏组件 | `dash_id/comp_id/type(指标卡/折线/柱/饼/排行)/bind(TEXT)/refresh_sec/role_allow` | 四类大屏（运营监控/知识进化/业务主题/实时告警）布局+绑定；发布链接权限记此表 |
| `sys_role` | 角色 | `role_id PK/name/cat_allow/func_allow/data_scope` | 分类/功能/数据三权；一键推荐权限范围后手动调 |
| `sys_user_role` | 账号角色 | `username/role_id` | 用户主表沿用现有体系，不新建；只建映射 |

## 九、暂不建（明确不做，避免误建）

- 二期单据类型 `DB/JJ/ZS`：不建新表，加类型时 `doc_main.type` 应用层放行 + `stock_doc_ref` 加行。
- 硬件设备台账（`一期配套硬件设备与耗材清单/RFID版/二维码版/采购清单`）：PDA/扫描枪/标签只记 `stock_ledger.device` 字符串，不建 `device` 主表（驾驶舱已定无设备）。
- 实时推送/秒级刷新：驾驶舱手动/按班刷新，不建 `websocket/push` 表。
- embedding 向量表：模型不写死，`a6api` 上哪个都行；向量检索二期再定，不预建 `*_vec` 表。

## 十、索引（`backend/sql/idx.sql` 必建 + 新增）

```sql
-- 已有（溯源三索引）：ix_ledger_barcode/barcode, ix_ledger_batch/batch_no, ix_ledger_doc/doc_no
-- 已有辅索引：ix_ledger_mat, ix_item_batch, ix_line_mat
-- 新增（平台联调前建）：
CREATE INDEX ix_msg_sess ON ai_message(sess_id);
CREATE INDEX ix_mem_layer ON kb_memory(layer);
CREATE INDEX ix_field_src ON ds_field_allow(src_id, table_name);
CREATE INDEX ix_scope_cat ON ds_category_scope(cat_id);
CREATE INDEX ix_comp_dash ON dash_component(dash_id);
```

## 附录：Downloads→表映射（评审可查）

- `表格_20260831.csv §1分类导航` → `ai_category/ai_shortcut`；`§2智能对话` → `ai_conversation/ai_message/ai_feedback/ai_favorite`；`§3分析矩阵` → `an_report_tpl(kind=单点/汇总/决策/报告/预测)`；`§4大屏` → `dash_component`；`§5个人中心` → `ai_favorite`。
- `表格_20260831 (1).csv §2数据源` → `ds_*` 5 表；`§3知识记忆` → `kb_*` 3 表；`§4分析能力配置` → `an_report_tpl`；`§5大屏可视化` → `dash_component`；`§6权限审计` → `sys_role/sys_user_role/audit_log`。
- `梧州监狱…可行性方案/招标人需求/采购清单/后台.html/流程图.html` → A/B/C 组业务口径已覆盖，不新增表。

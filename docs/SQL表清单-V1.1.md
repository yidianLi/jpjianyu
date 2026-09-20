# SQL 表清单 V1.1（MySQL 5.6，单库单文件，可直接建）

> 版本：V1.1 / 2026-09-20 / 状态：最终版（同步 `backend/sql/wms.sql` 57表）
> 依据：`prototype` 全部页面（`home/docs/transfer/finished/base/location/stocktake/report/users/audit/ai` + `mobile-app`）+ `C:/Users/Administrator/Downloads` 相关资料。
> 规范：MySQL 5.6 + InnoDB + utf8mb4；无 CHECK（应用层 `guards` 强制）；无 JSON 类型（JSON 存 TEXT）；主键业务表全 VARCHAR；数量必带 `qty+unit`；`at` 反引号包裹；溯源到 BT 批级。
> 永久约束 [PERMANENT]：单据前缀全集 `SQ/DJ/JS/RK/LY/TL/TK/DB/PD/TZ/CP/JJ/TC`，MVP 先用 `DJ/RK/LY/TL/PD`；`stock_ledger` 只增不改、`PD` 不动账；`idem_key=doc_no:line_no:biz` 唯一；命名空间 `/api/v1/web|app|ai`；错误码 `DUP_SCAN/OVER_ISSUE/SCOPE_DENIED`。
> 术语：本系统无调拨只有调仓，`DB=调仓单`；`biz` 只存前缀，中文只做显示映射；成品与物料共用同一套 `stock/doc` 真源，不建第二套账。

## 一、总览（共 57 表，14 组，单文件 `backend/sql/wms.sql`）

| 组 | 表数 | 表名 | 阶段 |
|---|---|---|---|
| A 业务核心 | 9 | `mat_master/batch/material_item/stock_onhand/stock_ledger/stock_doc_ref/doc_main/doc_line/doc_attachment` | 先用 |
| B 存证审计 | 2 | `scan_log/audit_log`（已加 5 列） | 先用 |
| C OCR/问答日志 | 3 | `ocr_document/ocr_field_result/ai_qa_log` | 随功能启用 |
| D 问答平台前台 | 7 | `ai_category/ai_shortcut/ai_prompt_tpl/ai_conversation/ai_message/ai_feedback/ai_favorite` | P3/P4 后接 |
| E 数据源集成 | 5 | `ds_source/ds_table_allow/ds_field_allow/ds_category_scope/ds_join_rel` | P6 真调前 |
| F 知识记忆 | 3 | `kb_memory/kb_public_doc/kb_evolve_log` | 二期 |
| G 分析/大屏 | 2 | `an_report_tpl/dash_component` | 后接 |
| H 权限 | 2 | `sys_role/sys_user_role` | P6 前 |
| I 基础资料 | 8 | `product_master/bom_master/bom_line/warehouse/location/customer/org_node/doc_template` | 先用 |
| J 成品+仓储扩展 | 5 | `pd_task/pd_line/deliver_sign/label_print/fee_settle` | 先用 |
| K 工单/审批流 | 3 | `flow_def/flow_instance/wo_task` | 先用 |
| L 报表中心 | 2 | `rpt_config/rpt_instance`（12类放行数据） | 后接 |
| M 系统管理扩展 | 3 | `sys_user/equipment/sync_queue` | 先用 |
| N 本次补齐 | 3 | `transfer_ship/fee_settle_line/sys_perm` | 先用 |

## 二、A 组：业务核心（单真源）

| 表名 | 中文名 | 主键/唯一 | 关键字段 | 说明 |
|---|---|---|---|---|
| `mat_master` | 物料主档 | `material_code PK` | `name/spec/unit/pack_qty/manage_mode/status` | 统收全部编码（含 `CP-` 成品）；`product_master` 只存扩展属性同码 |
| `batch` | 批次 | `batch_no PK` | `material_code/partner_id/source_doc_no/created_by/at` | 建批即绑来源 |
| `material_item` | 单件 | `barcode PK` | `material_code/batch_no/source_doc_no/status` | BT 级可不逐件建，散件/重点件建 |
| `stock_onhand` | 现存快照 | `PK(material_code,batch_no,wh,loc)` | `on_hand/avail/pending/quarantine/frozen` | 物料成品共用（成品 `wh=成品仓A/B`）；问答默认查它 |
| `stock_ledger` | 流水 | `id AI PK` + `idem_key UQ` | `doc_no/line_no/material_code/batch_no/barcode/wh/loc/qty/unit/dir/biz/by_user/device/at` | 只增不改；`biz` 只存前缀；`dir` 仅 `+-` |
| `stock_doc_ref` | 单据关联 | `UQ(from_doc,to_doc,rel)` | `from_doc/to_doc/rel` | 行数据表达关系：`TL->LY/RK->DJ/PD->TK/RK`，成品 `CP->RK/JJ<-RK/TC<-RK`，调仓 `DB` 源仓→目标仓 |
| `doc_main` | 单据主 | `doc_no PK` | `type（13前缀白名单）/status/handler/at` | 全部工单唯一入口；`price` 不进单据（MVP无金额） |
| `doc_line` | 单据行 | `PK(doc_no,line_no)` | `material_code/batch_no/qty/unit/loc/qc_result/reason` | V1.1 新增 `loc/qc_result/reason`，存质检结论/库区/原因 |
| `doc_attachment` | 附件 | `id AI PK` | `doc_no/kind/ref(TEXT)/by_user/at` | 照片压 1024px/jpeg0.7/≤6张 |

## 三、B 组：存证审计

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `scan_log` | 扫码日志 | `code/result(OK/DUPLICATE/INVALID/MISMATCH)/doc_no/by_user/device/at` | 重复/超领/串单拦截依据 |
| `audit_log` | 审计日志 | `by_user/action/doc_no/biz_type/result/before_val/after_val/device/detail/at` | V1.1 加 `biz_type/result/before_val/after_val/device`，存 `audit.html` 前值→后值 |

## 四、C 组：OCR/问答日志

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `ocr_document` | OCR 文档 | `ocr_id PK/doc_no/conf/ref/at` | Mock `OCR2026091201/conf0.89`；真接口后接 |
| `ocr_field_result` | OCR 字段候选 | `PK(ocr_id,field)/candidate/conf` | 只存候选，低置信须人工覆盖 |
| `ai_qa_log` | 问答日志 | `by_user/question/sql_text/rows_count/ms/at` | 白名单放行才记 |

## 五、D–H 组（平台/权限，与 V1.0 一致）

`ai_category/ai_shortcut/ai_prompt_tpl/ai_conversation/ai_message/ai_feedback/ai_favorite`；`ds_source/ds_table_allow/ds_field_allow/ds_category_scope/ds_join_rel`；`kb_memory/kb_public_doc/kb_evolve_log`；`an_report_tpl/dash_component`；`sys_role/sys_user_role`。用户主表见 M 组 `sys_user`，H 组只留角色映射。

## 六、I 组：基础资料（`base.html` P1–P6）

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `product_master` | 成品档案 | `product_code PK/name/style/customer/unit/status` | `CP-` 开头须先在 `mat_master` 建码，此处只存扩展属性 |
| `bom_master/bom_line` | BOM主/行 | `PK(product_code,version)/line(material_code/qty/unit/loss_rate)` | 一品多版，启用只留一个（应用层） |
| `warehouse` | 仓库档案 | `wh_code PK/name/wh_type/manager/status` | `WH-A/B/C`；有库存或库区只能停用不能删 |
| `location` | 库区档案 | `loc_code PK/wh_code/zone_label/capacity/qr_code/status` | 结构化主键+中文显示名；`stock_onhand` 照抄 |
| `customer` | 客户档案 | `cust_id PK/name/cust_type/contact/phone/status` | 客户=供应商（`KH001` 恒达服饰） |
| `org_node` | 组织架构 | `node_code PK/name/level/parent_code/leader/status` | 监区→车间→班组→工位；车间下拉从此取 |
| `doc_template` | 单据模板 | `tpl_code PK/biz/version/content/status` | OCR/问答字段描述来源 |

## 七、J 组：成品+仓储扩展

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `pd_task/pd_line` | 盘点任务/行 | `pd_no PK/mode/wh_code/scope` + `book_qty/real_qty/diff_qty/unit/reason` | 02:30自动/人工临时；未复核不调账 |
| `deliver_sign` | 交付签收存证 | `doc_no PK/receiver/sign_time/sender/proof_ref` | `JJ` 必填接收人+签收时间+证据 |
| `label_print` | 标签打印 | `code/kind(SB/BT/库区码)/content/printed_by/at` | 打印即记 |
| `fee_settle` | 加工费对账头 | `settle_no PK/customer/period/qty_send/qty_issue/qty_fin/amount/status` | 日周月账期，客户确认归档 |

## 八、K 组：工单/审批流

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `flow_def` | 审批流定义 | `flow_key PK/doc_type/steps_cfg` | `steps_cfg` JSON 约定 `[{k:S1,role:经办人,on:1,auto:1}..{k:S6,role:仓管员,on:1,last:1}]` |
| `flow_instance` | 审批流实例 | `doc_no PK/flow_key/cur_step/status/approver/updated_at/hist` | S1提交→S6仓管确认过账 |
| `wo_task` | 车间工单 | `wo_no PK/product_code/qty_plan/qty_done/workshop/status` | 一轮完工汇总来源 |

## 九、L/M/N 组

| 表名 | 中文名 | 关键字段 | 说明 |
|---|---|---|---|
| `rpt_config/rpt_instance` | 报表配置/实例 | `rpt_code/category/period_type/scope_cfg/auto_cron` + `rpt_no/status/content_ref` | 12类放行数据；自动草稿人工发布，只读不改账 |
| `sys_user` | 账号主表 | `username PK/name/password_hash/phone/data_scope/status/last_login/last_device` | 多选角色，数据范围过滤 |
| `equipment` | 设备台账 | `eq_id PK/kind/sn/holder/status` | 只记台账，不进驾驶舱 |
| `sync_queue` | 离线同步队列 | `payload/status/retries/at` | 弱网先写队列，幂等防重 |
| `transfer_ship` | 调仓在途 | `doc_no PK/from_wh/to_wh/from_loc/to_loc/qty_apply/qty_sent/qty_recv/unit/carrier/plate/eta/diff_status` | `DB=调仓单`，本系统无调拨 |
| `fee_settle_line` | 对账明细 | `PK(settle_no,line_no)/material_code/qty_send/qty_issue/qty_fin/qty_confirm/unit` | 订单级行 |
| `sys_perm` | 角色动作矩阵 | `PK(role_id,action)/allowed` | 10角色×7动作=70行 |

## 十、暂不建

二期单据不建新表；硬件不建第二套主表；不做秒级推送；不预建向量表（a6api 模型不写死）。

## 十一、索引（`wms.sql` 尾部，5.6 无 IF NOT EXISTS）

溯源三索引 `ix_ledger_barcode/batch/doc` 必建；辅索引 `ix_ledger_mat/ix_item_batch/ix_line_mat/ix_msg_sess/ix_mem_layer/ix_field_src/ix_scope_cat/ix_comp_dash/ix_bomline_mat/ix_loc_wh/ix_pdline_mat/ix_rpt_code/ix_flow_key/ix_wo_product/ix_ship_doc/ix_feeline_settle/ix_perm_role`。

## 附录 V1.0→V1.1 变更

- 54→57：加 `transfer_ship/fee_settle_line/sys_perm`。
- `doc_line` 加 `loc/qc_result/reason`；`audit_log` 加 `biz_type/result/before_val/after_val/device`；`flow_instance` 加 `approver/updated_at`。
- `mat_master` 统收编码（含 `CP-`），`product_master` 改扩展属性。
- 术语：`DB=调仓单`，无调拨；`biz` 只存前缀；`steps_cfg` JSON 约定写死。

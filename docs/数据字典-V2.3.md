# WMS 数据字典 V2.3（表-字段-解释，与 wms.sql 同源）

> 版本：V2.3 / 2026-09-20 / 库名 `wms` / `InnoDB` / `utf8mb4` / 目标 `MySQL 5.6`。共63表。V2.3只改种子语义（11600=申请领料，补WO/SQ方法与SQ发号），表结构63表不变。
> 读法：先看§0四域关系，再按表查字段。`COMMENT` 即解释原文。逻辑外键无物理FK，关联字段全建索引。

## §0 四域关系（物料/成品/BOM/仓储）

- 物料线：`mat_category`分类树 → `mat_master`档案（三计量 base/pack/sub＋manage_mode QTY/CODE＋max/min）→ `batch`/`material_item`实物。物料编码仅物料用。
- 成品线：`prod_category`分类树 → `product_master`档案（`CP-`独立编码，与物料平级）→ `wo_task`生产工单（qty_plan/qty_done＋bom_version）→ 成品单据 CP登记/RK入库/TC退仓/JJ交付。
- BOM配方桥：`bom_master`（一成品多版本，启用仅一）→ `bom_line`（成品⇒物料：material_code＋qty单位耗用＋loss_rate）。领料按BOM展开，完工按BOM倒冲，快照存 `doc_line.bom_version`。
- 仓储地点：`warehouse`（wh_type原料仓/成品仓/待检区/隔离区，stock_kind MAT/FIN/ALL）→ `location`（loc_code结构化主键＋qr_code）。仓储只管地点不管账，进出全走单据。
- 单据与账：`doc_main`（type+sid+bmid，一单一态）→ `doc_line`（物料行/成品行二选一＋bom_version快照＋o_/n_）→ `stock_ledger`（只增不改，物料账/成品账二选一）→ `stock_onhand`（PK含material_code+product_code，物料行product_code为空串反之亦然）。
- 单据前缀：DJ物料登记 / JS来料拒收 / RK入库（物料）/ LY领用 / TL调仓领用 / TK物料退库（01余料回仓=车间退料 / 02入库冲红 / 03损坏退还）/ TC成品退仓 / DB调仓 / TZ库存调整 / PD盘点 / CP成品登记 / RK成品入库（sid=11300）/ JJ成品交付 / WO生产工单 / SQ申请领料（只申请不扣账，01车间申请/02计划申请）。

### sys_config 系统容量/编码配置表

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cfg_key | VARCHAR(50) PK | 配置键 |
| cfg_value | VARCHAR(255) | 配置值 |
| remark | VARCHAR(255) | 备注 |

### sys_sequence 中央发号表

| 字段 | 类型 | 中文解释 |
|---|---|---|
| seq_name | VARCHAR(64) PK | 序号名,如FS习惯:DOC_MAIN.DOC_NO_RK |
| cid | BIGINT | 分号单位,0=全局 |
| next_val | BIGINT | 下一个值,BID/BOMID类从10000001起与旧小数字错开 |
| table_list | VARCHAR(255) | 适用表清单 |
| remark | VARCHAR(64) | 说明,如资产入库/领用 |

### sys_biz_state 语义状态字典

| 字段 | 类型 | 中文解释 |
|---|---|---|
| sid | INT PK | 语义状态码,如10100入库/10400领用/13100盘点 |
| biz | VARCHAR(16) | 单据前缀:DJ/RK/LY/TL/PD/SQ/JS/TK/DB/TZ/CP/JJ/TC |
| name | VARCHAR(64) | 状态名称 |
| bill_no_format | VARCHAR(24) | 单号格式,如RK[SERIAL:6] |
| state_status | TINYINT | 是否台账状态列显示:1显示0不显示 |
| enabled | TINYINT | 是否启用:1启用0停用(与显示位分离,避STATE多义) |
| inc_flag | TINYINT | 增标志(统计用) |
| dec_flag | TINYINT | 减标志(统计用) |
| remark | VARCHAR(255) | 备注 |

### sys_bill_method 单据方法字典

| 字段 | 类型 | 中文解释 |
|---|---|---|
| bmid | INT PK/AI | 方法ID |
| sid | INT | 所属语义状态sys_biz_state.sid(逻辑外键) |
| method_code | VARCHAR(8) | 方法编码01/02/99 |
| method_name | VARCHAR(64) | 方法名称,如正常采购/日常领用 |
| enabled | TINYINT | 是否启用 |

### mat_category 物料分类树

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cat_code | VARCHAR(32) PK | 物料分类码 |
| parent_code | VARCHAR(32) | 父分类P_前缀 |
| autocode | VARCHAR(32) | 定长分级码001/001002式,字符串排序即树序 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(64) | 名称,如面料/辅料/五金/包装/耗材 |
| sort | INT | 排序,与业务键分离 |
| enabled | TINYINT | 是否启用 |

### mat_master 物料档案(仅物料,不含成品)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| material_code | VARCHAR(32) PK | 物料编码(仅物料,成品另见product_master) |
| cat_code | VARCHAR(32) | 逻辑外键->mat_category.cat_code |
| autocode | VARCHAR(32) | 自有分级排序码 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(128) | 名称 |
| spec | VARCHAR(128) | 规格型号 |
| base_unit | VARCHAR(16) | 基本单位,单据unit必须等于此(防米+件混加) |
| pack_unit | VARCHAR(16) | 包装单位,如箱/包 |
| pack_qty | DECIMAL(18,3) | 每包装含基本单位数DECIMAL |
| sub_unit | VARCHAR(16) | 细分/拆零单位 |
| sub_qty | DECIMAL(18,3) | 细分换算数 |
| manage_mode | VARCHAR(16) | 管理模式QTY批次数量/CODE一物一码 |
| price_ref | DECIMAL(18,2) | 参考单价,只上标签不进报表 |
| max_qty | DECIMAL(18,3) | 最高库存,写预警规则 |
| min_qty | DECIMAL(18,3) | 最低库存 |
| shelf_life_days | INT | 保质天数 |
| enabled | TINYINT | 是否启用 |
| status | VARCHAR(16) | 显示状态:启用/停用 |

### batch 批次表

| 字段 | 类型 | 中文解释 |
|---|---|---|
| batch_no | VARCHAR(32) PK | 批次号BT级,溯源到此级 |
| material_code | VARCHAR(32) | 逻辑外键->mat_master.material_code |
| partner_id | VARCHAR(64) | 往来方 |
| source_doc_no | VARCHAR(64) | 来源单号 |
| created_at | DATETIME | 创建时间(DATETIME,禁TIMESTAMP) |
| created_by | VARCHAR(64) | 创建人 |

### material_item 单件条码表

| 字段 | 类型 | 中文解释 |
|---|---|---|
| barcode | VARCHAR(64) PK | 单件条码SN级 |
| material_code | VARCHAR(32) | 逻辑外键->mat_master.material_code |
| batch_no | VARCHAR(32) | 逻辑外键->batch.batch_no |
| source_doc_no | VARCHAR(64) | 来源单号 |
| status | VARCHAR(16) | 单件业务状态:在库/出库/冻结(非启用位) |

### stock_onhand 现存快照(物料行product_code为空串,成品行material_code为空串)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| material_code | VARCHAR(32) PK | 物料(物料行必填,成品行为空串) |
| product_code | VARCHAR(32) PK | 成品(成品行必填,物料行为空串) |
| batch_no | VARCHAR(32) PK | 逻辑外键->batch |
| wh | VARCHAR(32) PK | 仓库编码->warehouse.wh_code |
| loc | VARCHAR(64) PK | 库位编码->location.loc_code |
| on_hand | DECIMAL(18,3) | 现存DECIMAL |
| avail | DECIMAL(18,3) | 可用 |
| pending | DECIMAL(18,3) | 待发 |
| quarantine | DECIMAL(18,3) | 隔离 |
| frozen | DECIMAL(18,3) | 冻结 |

### stock_ledger 台账流水只增不改(物料账/成品账二选一)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键,业务键另用idem_key |
| doc_no | VARCHAR(64) | 逻辑外键->doc_main.doc_no |
| line_no | INT | 行号 |
| sid | INT | 语义动作码->sys_biz_state.sid(NB3可抄3) |
| material_code | VARCHAR(32) | 物料(物料账必填) |
| product_code | VARCHAR(32) | 成品(成品账必填),逻辑外键->product_master |
| batch_no | VARCHAR(32) | 批次 |
| barcode | VARCHAR(64) | 条码 |
| wh | VARCHAR(32) | 仓库 |
| loc | VARCHAR(64) | 库位 |
| qty | DECIMAL(18,3) | 数量DECIMAL必带unit |
| unit | VARCHAR(16) | 单位 |
| dir | CHAR(1) | 方向:1入-1出,替代CALC_STATUS语义 |
| biz | VARCHAR(16) | 前缀DJ/RK/LY/TL/PD等,中文只做显示映射 |
| by_user | VARCHAR(64) | 操作人 |
| device | VARCHAR(64) | 设备 |
| at | DATETIME | 发生时间 |
| idem_key | VARCHAR(128) UQ | 幂等键doc_no:line_no:biz唯一 |

### stock_doc_ref 单据关联行

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | INT PK/AI | 代理键 |
| from_doc | VARCHAR(64) UQ | 源单 |
| to_doc | VARCHAR(64) UQ | 目标单 |
| rel | VARCHAR(32) UQ | 关系:TL->LY/RK->DJ/PD->TK等,行式表达禁宽表(避坑6) |

### doc_main 单据主表唯一入口

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_no | VARCHAR(64) PK | 单号=前缀[SERIAL:6],如RK100001 |
| type | VARCHAR(8) | 类型前缀,应用层白名单校验 |
| sid | INT | 语义动作码->sys_biz_state.sid |
| bmid | INT | 方法->sys_bill_method.bmid |
| biz_status | VARCHAR(16) | 业务状态(与enabled/flow_status分离) |
| handler | VARCHAR(64) | 经办人 |
| at | DATETIME | 制单时间 |

### doc_line 单据行表(物料行/成品行二选一)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_no | VARCHAR(64) PK | 逻辑外键->doc_main.doc_no |
| line_no | INT PK | 行号,与GIDX/IDX式排序分离,业务键不排序(可抄7) |
| o_qty | DECIMAL(18,3) | 原数量O_快照(NB3可抄5) |
| n_qty | DECIMAL(18,3) | 新数量N_快照 |
| o_loc | VARCHAR(64) | 原库位O_ |
| n_loc | VARCHAR(64) | 新库位N_ |
| material_code | VARCHAR(32) | 物料(物料单必填,成品单可空) |
| product_code | VARCHAR(32) | 成品(成品单必填:CP/RK-FIN/JJ/TC),逻辑外键->product_master |
| bom_version | VARCHAR(16) | BOM版本快照,领料/完工按此展开 |
| batch_no | VARCHAR(32) | 批次 |
| qty | DECIMAL(18,3) | 本次数量 |
| unit | VARCHAR(16) | 单位 |
| loc | VARCHAR(64) | 库位 |
| qc_result | VARCHAR(32) | 质检结果 |
| reason | VARCHAR(255) | 原因=方法名冗余 |

### doc_attachment 单据附件

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | INT PK/AI | 代理键 |
| doc_no | VARCHAR(64) | 逻辑外键->doc_main |
| kind | VARCHAR(32) | 种类:照片/签收/发票 |
| ref | TEXT | 引用路径(TEXT,5.6无JSON) |
| by_user | VARCHAR(64) | 上传人 |
| at | DATETIME | 上传时间 |

### scan_log 扫码日志只增不改

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| code | VARCHAR(64) | 扫码内容 |
| result | VARCHAR(16) | 结果:HIT/DUP_SCAN/OVER_ISSUE/SCOPE_DENIED |
| doc_no | VARCHAR(64) | 关联单号 |
| by_user | VARCHAR(64) | 操作人 |
| device | VARCHAR(64) | 设备 |
| at | DATETIME | 时间 |

### audit_log 审计日志

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| at | DATETIME | 时间 |
| by_user | VARCHAR(64) | 操作人 |
| action | VARCHAR(64) | 动作 |
| doc_no | VARCHAR(64) | 单号 |
| biz_type | VARCHAR(16) | 前缀 |
| result | VARCHAR(16) | 结果 |
| o_val | VARCHAR(255) | 原值O_快照(可抄5,原before_val改名统一前缀) |
| n_val | VARCHAR(255) | 新值N_快照(原after_val改名) |
| device | VARCHAR(64) | 设备 |
| detail | TEXT | 明细 |

### ocr_document OCR文档

| 字段 | 类型 | 中文解释 |
|---|---|---|
| ocr_id | VARCHAR(64) PK | OCR主键 |
| doc_no | VARCHAR(64) | 关联单号 |
| conf | DECIMAL(8,4) | 置信度DECIMAL |
| ref | TEXT | 原图引用 |
| at | DATETIME | 时间 |

### ocr_field_result OCR字段结果

| 字段 | 类型 | 中文解释 |
|---|---|---|
| ocr_id | VARCHAR(64) PK | 逻辑外键->ocr_document |
| field | VARCHAR(64) PK | 字段名 |
| candidate | TEXT | 候选值 |
| conf | DECIMAL(8,4) | 置信度 |

### ai_qa_log 问答日志

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| at | DATETIME | 时间 |
| by_user | VARCHAR(64) | 提问人 |
| question | TEXT | 问题 |
| sql_text | TEXT | 生成SQL(5.6方言) |
| rows_count | INT | 行数(INT不带宽度,避坑3) |
| ms | INT | 耗时ms |

### ai_category 问答分类树

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cat_id | VARCHAR(32) PK | 分类ID |
| parent_id | VARCHAR(32) | 父ID,P_前缀(可抄9) |
| autocode | VARCHAR(32) | 定长分级码可抄1 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(64) | 名称 |
| icon | VARCHAR(64) | 图标 |
| gidx | INT | 组序号(排序与业务键分离可抄7) |
| idx | INT | 组内序号 |
| sort | INT | 兼容旧排序 |
| enabled | CHAR(1) | 是否启用 |

### ai_shortcut 快捷入口

| 字段 | 类型 | 中文解释 |
|---|---|---|
| shortcut_id | VARCHAR(32) PK | 快捷ID=cat_id派生xN(可抄6思想) |
| cat_id | VARCHAR(32) | 逻辑外键->ai_category |
| type | VARCHAR(16) | 类型 |
| title | VARCHAR(128) | 标题 |
| sort | INT | 排序 |
| role_allow | VARCHAR(255) | 角色白名单 |

### ai_prompt_tpl 提示词模板

| 字段 | 类型 | 中文解释 |
|---|---|---|
| tpl_id | VARCHAR(32) PK | 模板ID |
| cat_id | VARCHAR(32) | 逻辑外键->ai_category |
| version | VARCHAR(16) | 版本 |
| content | TEXT | 内容 |
| ab_group | VARCHAR(16) | AB组 |

### ai_conversation 会话

| 字段 | 类型 | 中文解释 |
|---|---|---|
| sess_id | VARCHAR(64) PK | 会话ID |
| cat_id | VARCHAR(32) | 分类 |
| by_user | VARCHAR(64) | 用户 |
| title | VARCHAR(255) | 标题 |
| at | DATETIME | 时间 |

### ai_message 消息

| 字段 | 类型 | 中文解释 |
|---|---|---|
| msg_id | BIGINT PK/AI | 代理键 |
| sess_id | VARCHAR(64) | 逻辑外键->ai_conversation |
| role | VARCHAR(8) | 角色user/assistant |
| content | TEXT | 内容 |
| format | VARCHAR(16) | 格式 |

### ai_feedback 点赞反馈

| 字段 | 类型 | 中文解释 |
|---|---|---|
| msg_id | BIGINT PK | PK即FK->ai_message |
| result | VARCHAR(16) | 结果:有用/无用 |
| reason | VARCHAR(255) | 原因 |

### ai_favorite 收藏

| 字段 | 类型 | 中文解释 |
|---|---|---|
| by_user | VARCHAR(64) PK | 用户 |
| kind | VARCHAR(16) PK | 种类 |
| ref_id | VARCHAR(64) PK | 引用ID |
| sort | INT | 排序(与键分离) |

### ds_source 数据源

| 字段 | 类型 | 中文解释 |
|---|---|---|
| src_id | VARCHAR(32) PK | 源ID |
| kind | VARCHAR(16) | 种类 |
| host | VARCHAR(128) | 主机 |
| port | INT | 端口 |
| db_name | VARCHAR(64) | 库名 |
| read_user | VARCHAR(64) | 只读账号 |
| sync_mode | VARCHAR(16) | 同步模式 |
| period | VARCHAR(32) | 周期 |

### ds_table_allow 表白名单

| 字段 | 类型 | 中文解释 |
|---|---|---|
| src_id | VARCHAR(32) PK | 源 |
| table_name | VARCHAR(64) PK | 表名 |
| alias | VARCHAR(64) | 别名CODE/NAME成对思想 |

### ds_field_allow 字段白名单

| 字段 | 类型 | 中文解释 |
|---|---|---|
| src_id | VARCHAR(32) PK | 源 |
| table_name | VARCHAR(64) PK | 表 |
| field | VARCHAR(64) PK | 字段 |
| alias | VARCHAR(64) | 别名 |
| mask | VARCHAR(16) | 脱敏 |
| row_scope | VARCHAR(255) | 行范围 |

### ds_category_scope 分类数据范围

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cat_id | VARCHAR(32) PK | 分类 |
| src_id | VARCHAR(32) PK | 源 |
| table_name | VARCHAR(64) PK | 表 |

### ds_join_rel 跨源JOIN关系行式存(禁宽表)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| src_a | VARCHAR(32) PK | 源A |
| table_a | VARCHAR(64) PK | 表A |
| field_a | VARCHAR(64) PK | 字段A |
| src_b | VARCHAR(32) PK | 源B |
| table_b | VARCHAR(64) PK | 表B |
| field_b | VARCHAR(64) PK | 字段B |

### kb_memory 记忆

| 字段 | 类型 | 中文解释 |
|---|---|---|
| mem_id | VARCHAR(64) PK | 记忆ID |
| layer | VARCHAR(8) | 层L1/L2 |
| content | TEXT | 内容 |
| hit_count | INT | 命中数 |
| status | VARCHAR(16) | 状态 |

### kb_public_doc 公共知识

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_id | VARCHAR(64) PK | 文档ID |
| title | VARCHAR(255) | 标题 |
| chunk | TEXT | 分片 |
| version | VARCHAR(16) | 版本 |
| scope | VARCHAR(255) | 范围 |

### kb_evolve_log 进化日志

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| msg_id | BIGINT | 消息ID |
| rule | VARCHAR(255) | 规则 |
| batch_result | TEXT | 批量结果 |
| at | DATETIME | 时间 |

### an_report_tpl 分析模板

| 字段 | 类型 | 中文解释 |
|---|---|---|
| tpl_id | VARCHAR(32) PK | 模板ID |
| kind | VARCHAR(16) | 种类 |
| dim | TEXT | 维度(TEXT存JSON) |
| metric | TEXT | 指标 |
| threshold | TEXT | 阈值 |

### dash_component 大屏组件

| 字段 | 类型 | 中文解释 |
|---|---|---|
| dash_id | VARCHAR(32) PK | 大屏ID(父码) |
| comp_id | VARCHAR(32) PK | 组件ID=父码派生(可抄6) |
| type | VARCHAR(32) | 类型 |
| bind_cfg | TEXT | 绑定配置 |
| refresh_sec | INT | 刷新秒 |
| role_allow | VARCHAR(255) | 角色白名单 |

### sys_role 角色

| 字段 | 类型 | 中文解释 |
|---|---|---|
| role_id | VARCHAR(32) PK | 角色ID |
| autocode | VARCHAR(32) | 分级码可抄1,001/001002式 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(64) | 名称 |
| cat_allow | VARCHAR(500) | 分类范围 |
| func_allow | VARCHAR(500) | 功能范围 |
| data_scope | VARCHAR(500) | 数据范围 |

### sys_user_role 用户角色关联物理删除

| 字段 | 类型 | 中文解释 |
|---|---|---|
| username | VARCHAR(64) PK | 用户 |
| role_id | VARCHAR(32) PK | 角色 |

### prod_category 成品分类树

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cat_code | VARCHAR(32) PK | 成品分类码 |
| parent_code | VARCHAR(32) | 父分类 |
| autocode | VARCHAR(32) | 定长分级码 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(64) | 名称 |
| sort | INT | 排序 |
| enabled | TINYINT | 是否启用 |

### product_master 成品档案(与物料平级的一大模块)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| product_code | VARCHAR(32) PK | 成品编码CP-开头,独立于物料编码 |
| cat_code | VARCHAR(32) | 逻辑外键->prod_category.cat_code |
| name | VARCHAR(128) | 成品名称 |
| spec | VARCHAR(128) | 规格 |
| style | VARCHAR(64) | 款号 |
| customer | VARCHAR(64) | 归属客户 |
| base_unit | VARCHAR(16) | 基本单位 |
| price_ref | DECIMAL(18,2) | 参考单价 |
| enabled | TINYINT | 是否启用 |
| status | VARCHAR(16) | 显示状态 |

### bom_master BOM头(配方版本)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| product_code | VARCHAR(32) PK | 逻辑外键->product_master.product_code |
| version | VARCHAR(16) PK | 配方版本,一成品多版本,启用仅一个(应用层保) |
| handler | VARCHAR(64) | 经办人 |
| eff_date | DATETIME | 生效日期 |
| status | VARCHAR(16) | BOM状态:草稿/启用/停用 |
| updated_at | DATETIME | 更新时间 |

### bom_line BOM行(配方明细:成品=>物料)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| product_code | VARCHAR(32) PK | 成品 |
| version | VARCHAR(16) PK | 版本 |
| line_no | INT PK | 行号 |
| material_code | VARCHAR(32) | 逻辑外键->mat_master.material_code,配方用料 |
| qty | DECIMAL(18,3) | 单位成品耗用DECIMAL |
| unit | VARCHAR(16) | 单位=物料base_unit |
| loss_rate | DECIMAL(8,4) | 损耗率 |

### warehouse 仓库档案(地点,不管账,账在ledger)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| wh_code | VARCHAR(32) PK | 仓库码WH-A外仓/WH-B内仓1/WH-C内仓2 |
| parent_code | VARCHAR(32) | 父仓P_前缀 |
| autocode | VARCHAR(32) | 分级码001/002 |
| lowest | TINYINT | 是否叶子 |
| name | VARCHAR(64) | 名称 |
| wh_type | VARCHAR(32) | 类型:原料仓/成品仓/待检区/隔离区/外仓/内仓 |
| stock_kind | VARCHAR(16) | 存放物:MAT物料/FIN成品/ALL两者 |
| manager | VARCHAR(64) | 负责人 |
| enabled | TINYINT | 是否启用(有库存或库区只能停用不能删,应用层卡) |
| status | VARCHAR(16) | 显示状态 |

### location 库位档案

| 字段 | 类型 | 中文解释 |
|---|---|---|
| loc_code | VARCHAR(64) PK | 库位结构化主键WH-ZONE-... |
| wh_code | VARCHAR(32) | 逻辑外键->warehouse |
| autocode | VARCHAR(32) | 分级码 |
| zone_label | VARCHAR(64) | 中文显示名 |
| capacity | DECIMAL(18,3) | 容量 |
| qr_code | VARCHAR(128) | 库区码 |
| enabled | TINYINT | 是否启用 |
| status | VARCHAR(16) | 显示状态 |

### customer 客户档案

| 字段 | 类型 | 中文解释 |
|---|---|---|
| cust_id | VARCHAR(32) PK | 客户ID=KH001类 |
| name | VARCHAR(128) | 名称 |
| cust_type | VARCHAR(32) | 类型:客户/供应商 |
| contact | VARCHAR(64) | 联系人 |
| phone | VARCHAR(32) | 电话 |
| status | VARCHAR(16) | 状态 |

### org_node 组织架构树

| 字段 | 类型 | 中文解释 |
|---|---|---|
| node_code | VARCHAR(64) PK | 节点码 |
| autocode | VARCHAR(32) | 定长分级码001/001001式 |
| lowest | TINYINT | 是否叶子(班组/工位=1) |
| name | VARCHAR(64) | 名称 |
| level | VARCHAR(16) | 级别:监区/楼栋/楼层/车间/班组/工位 |
| parent_code | VARCHAR(64) | 父节点P_前缀 |
| leader | VARCHAR(64) | 负责人 |
| enabled | TINYINT | 是否启用 |
| status | VARCHAR(16) | 显示状态 |

### doc_template 单据模板

| 字段 | 类型 | 中文解释 |
|---|---|---|
| tpl_code | VARCHAR(32) PK | 模板码MB-SHD类 |
| biz | VARCHAR(16) | 前缀 |
| version | VARCHAR(16) | 版本v5类 |
| content | TEXT | 内容 |
| status | VARCHAR(16) | 状态 |

### pd_task 盘点任务

| 字段 | 类型 | 中文解释 |
|---|---|---|
| pd_no | VARCHAR(64) PK | 盘点单号PD[SERIAL:6] |
| sid | INT | 语义码13100类 |
| mode | VARCHAR(16) | 模式:02:30自动/人工临时 |
| wh_code | VARCHAR(32) | 仓库范围冻结 |
| scope | TEXT | 范围 |
| biz_status | VARCHAR(16) | 业务状态(与enabled分离) |
| handler | VARCHAR(64) | 经办人 |
| at | DATETIME | 时间 |

### pd_line 盘点行PD不动账,复核后另生TK/RK单调账

| 字段 | 类型 | 中文解释 |
|---|---|---|
| pd_no | VARCHAR(64) PK | 逻辑外键->pd_task |
| line_no | INT PK | 行号 |
| o_qty | DECIMAL(18,3) | 原账面O_(book_qty改名统一) |
| n_qty | DECIMAL(18,3) | 新实盘N_(real_qty改名统一) |
| diff_qty | DECIMAL(18,3) | 差异= N-O |
| material_code | VARCHAR(32) | 物料 |
| batch_no | VARCHAR(32) | 批次 |
| book_qty | DECIMAL(18,3) | 账面(兼容旧字段) |
| real_qty | DECIMAL(18,3) | 实盘(兼容旧字段) |
| unit | VARCHAR(16) | 单位 |
| reason | VARCHAR(255) | 原因 |

### deliver_sign 交付签收存证

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_no | VARCHAR(64) PK | PK即FK->doc_main,JJ必填 |
| receiver | VARCHAR(64) | 接收人 |
| sign_time | DATETIME | 签收时间 |
| sender | VARCHAR(64) | 送货人 |
| proof_ref | TEXT | 证据引用 |

### label_print 标签打印即记

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| code | VARCHAR(64) | 码值SB/BT/库区码 |
| kind | VARCHAR(16) | 种类 |
| content | VARCHAR(255) | 内容 |
| printed_by | VARCHAR(64) | 打印人 |
| at | DATETIME | 时间 |

### fee_settle 加工费对账头汇总

| 字段 | 类型 | 中文解释 |
|---|---|---|
| settle_no | VARCHAR(64) PK | 结算单号 |
| customer | VARCHAR(64) | 客户 |
| period | VARCHAR(32) | 账期日/周/月 |
| qty_send | DECIMAL(18,3) | 送货数 |
| qty_issue | DECIMAL(18,3) | 发料数 |
| qty_fin | DECIMAL(18,3) | 成品数 |
| amount | DECIMAL(18,2) | 金额DECIMAL(18,2) |
| biz_status | VARCHAR(16) | 业务状态:草稿/确认/归档 |

### flow_def 审批流定义

| 字段 | 类型 | 中文解释 |
|---|---|---|
| flow_key | VARCHAR(64) PK | 流程键=doc_type派生 |
| doc_type | VARCHAR(16) | 单据前缀 |
| steps_cfg | TEXT | 步骤JSON([{k:S1,role:经办人,on:1}..])TEXT存 |

### flow_instance 审批流实例

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_no | VARCHAR(64) PK | PK即FK->doc_main |
| flow_key | VARCHAR(64) | 流程键 |
| cur_step | VARCHAR(16) | 当前步S1..S6 |
| flow_status | VARCHAR(16) | 流状态(与biz_status分离,避多义) |
| approver | VARCHAR(64) | 当前审批人 |
| updated_at | DATETIME | 更新时间 |
| hist | TEXT | 历史JSON |

### wo_task 生产工单(成品线:接单=>领料=>完工=>入库)

| 字段 | 类型 | 中文解释 |
|---|---|---|
| wo_no | VARCHAR(64) PK | 生产工单号WO[SERIAL:6] |
| product_code | VARCHAR(32) | 逻辑外键->product_master,生产什么成品 |
| bom_version | VARCHAR(16) | 配方版本,领料/倒冲按此版本展开 |
| qty_plan | DECIMAL(18,3) | 计划数 |
| qty_done | DECIMAL(18,3) | 完工数(一轮完工汇总) |
| workshop | VARCHAR(64) | 车间=org_node叶子 |
| biz_status | VARCHAR(16) | 业务状态 |

### rpt_config 报表配置

| 字段 | 类型 | 中文解释 |
|---|---|---|
| rpt_code | VARCHAR(32) PK | 报表码 |
| category | VARCHAR(32) | 12类:收发存/余额/领退/调仓/退料/成品/差异/库龄/损耗/对账/日报/完工 |
| period_type | VARCHAR(16) | 周期类型 |
| scope_cfg | TEXT | 范围配置 |
| auto_cron | VARCHAR(64) | 自动cron |

### rpt_instance 报表实例

| 字段 | 类型 | 中文解释 |
|---|---|---|
| rpt_no | VARCHAR(64) PK | 实例号 |
| rpt_code | VARCHAR(32) | 逻辑外键->rpt_config |
| period | VARCHAR(32) | 账期 |
| biz_status | VARCHAR(16) | 草稿/发布,只读不改账 |
| content_ref | TEXT | 内容引用 |
| generated_by | VARCHAR(64) | 生成人 |
| at | DATETIME | 时间 |

### sys_user 账号主表

| 字段 | 类型 | 中文解释 |
|---|---|---|
| username | VARCHAR(64) PK | 账号(自然键,登录用) |
| name | VARCHAR(64) | 姓名CODE/NAME成对 |
| password_hash | VARCHAR(128) | 密码哈希 |
| phone | VARCHAR(32) | 电话 |
| data_scope | VARCHAR(500) | 数据范围仓库/客户/组织过滤 |
| enabled | TINYINT | 是否启用(与状态分离) |
| status | VARCHAR(16) | 显示状态 |
| last_login | DATETIME | 最后登录 |
| last_device | VARCHAR(64) | 最后设备 |

### equipment 设备台账不进驾驶舱

| 字段 | 类型 | 中文解释 |
|---|---|---|
| eq_id | VARCHAR(64) PK | 设备ID |
| kind | VARCHAR(32) | 种类PDA/扫描枪/标签 |
| sn | VARCHAR(128) | 序列号 |
| holder | VARCHAR(64) | 持有人 |
| status | VARCHAR(16) | 状态 |

### sync_queue 离线同步队列幂等补传

| 字段 | 类型 | 中文解释 |
|---|---|---|
| id | BIGINT PK/AI | 代理键 |
| payload | TEXT | 载荷JSON |
| biz_status | VARCHAR(16) | 业务状态机:P具体值PENDING/SENT/FAIL |
| retries | INT | 重试数 |
| at | DATETIME | 入队时间 |

### transfer_ship 调仓在途申请/已发/已收

| 字段 | 类型 | 中文解释 |
|---|---|---|
| doc_no | VARCHAR(64) PK | PK即FK->doc_main,DB调仓单 |
| from_wh | VARCHAR(32) | 源仓 |
| to_wh | VARCHAR(32) | 目标仓 |
| from_loc | VARCHAR(64) | 源库位 |
| to_loc | VARCHAR(64) | 目标库位 |
| o_qty | DECIMAL(18,3) | 申请数O_ |
| qty_apply | DECIMAL(18,3) | 申请数(兼容旧) |
| qty_sent | DECIMAL(18,3) | 已发数 |
| n_qty | DECIMAL(18,3) | 实收数N_ |
| qty_recv | DECIMAL(18,3) | 实收数(兼容旧) |
| unit | VARCHAR(16) | 单位 |
| carrier | VARCHAR(64) | 承运(在途只读) |
| plate | VARCHAR(32) | 车牌 |
| eta | DATETIME | 预计到达 |
| diff_status | VARCHAR(16) | 差异确认状态 |

### fee_settle_line 对账明细订单级行

| 字段 | 类型 | 中文解释 |
|---|---|---|
| settle_no | VARCHAR(64) PK | 逻辑外键->fee_settle |
| line_no | INT PK | 行号 |
| o_qty_send | DECIMAL(18,3) | 原送货O_ |
| n_qty_confirm | DECIMAL(18,3) | 确认数N_ |
| material_code | VARCHAR(32) | 物料 |
| qty_send | DECIMAL(18,3) | 送货(兼容旧) |
| qty_issue | DECIMAL(18,3) | 发料 |
| qty_fin | DECIMAL(18,3) | 成品 |
| qty_confirm | DECIMAL(18,3) | 确认(兼容旧) |
| unit | VARCHAR(16) | 单位 |

### sys_perm 角色动作矩阵

| 字段 | 类型 | 中文解释 |
|---|---|---|
| role_id | VARCHAR(32) PK | 角色 |
| action | VARCHAR(32) PK | 动作7种,行式70行(10角色x7动作) |
| allowed | CHAR(1) | 是否允许 |

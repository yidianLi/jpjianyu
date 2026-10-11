-- =====================================================================
-- WMS 重构版 DDL (MySQL 5.6 / InnoDB / utf8mb4 / 可直接执行)
-- 重构依据: NB3 方法论 docs/nb3-database-design-method.md 第10条
--   可抄7条: 1.AUTOCODE定长分级码 2.容量声明 3.SID语义状态码 4.中央发号
--             5.O_/N_快照 6.父码xN子表编码 7.排序键分离
--   要避6条: 1.无外键->本库用"逻辑外键+全索引+注释溯源"(5.6/分表下不用物理FK,见说明)
--             2.double存金额->全DECIMAL 3.int(N)显示宽度->一律INT/BIGINT不带宽度
--             4.utf8->全utf8mb4 5.STATE一词多义->拆 enabled/biz_status/flow_status
--             6.Sxxx宽表流转矩阵->用 flow_def/flow_instance/sys_perm行式表达,禁ALTER加列
-- 库名: wms;63表=0组编号中枢4 + 物料线/成品线BOM/仓储地点/工单单据/支撑;MySQL5.6可直接执行
-- 约定: 单据前缀全集 SQ/DJ/JS/RK/LY/TL/TK/DB/PD/TZ/CP/JJ/TC;MVP先用 DJ/RK/LY/TL/PD
--       stock_ledger只增不改,PD不动账;idem_key=doc_no:line_no:biz唯一;数量必带qty+unit;溯源到BT批级
-- 5.6注意: 无CHECK(应用层guards)/无JSON(TEXT存JSON)/无CTE窗口函数/CREATE INDEX无IF NOT EXISTS
-- =====================================================================
-- V2.3 2026-09-20 对齐菜单截图:仓储=仓库库存/库存记录/库区管理/库存调仓/库存盘点;物料=明细/申请领料SQ/登记DJ/拒收JS/入库RK/领用LY/车间退料TK回仓/退库TK冲红;成品=明细/登记CP/入库RK-FIN/退仓TC/交付JJ;SQ=申请领料(只申请不扣账)



CREATE DATABASE IF NOT EXISTS `wms` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `wms`;
SET NAMES utf8mb4;

-- ============ 0组:编号中枢(NB3可抄1/2/3/4落地) ============
-- 容量声明(NB3可抄2):编码容量由配置声明,不是硬编码
CREATE TABLE IF NOT EXISTS sys_config(
  cfg_key VARCHAR(50) NOT NULL PRIMARY KEY COMMENT '配置键',
  cfg_value VARCHAR(255) NOT NULL COMMENT '配置值',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统容量/编码配置表';

-- 中央发号器(NB3可抄4):SEQNAME=表.字段 或 表.字段_动作码;NEXTVAL单独存,不依赖AUTO_INCREMENT
CREATE TABLE IF NOT EXISTS sys_sequence(
  seq_name VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '序号名,如FS习惯:DOC_MAIN.DOC_NO_RK',
  cid BIGINT DEFAULT NULL COMMENT '分号单位,0=全局',
  next_val BIGINT NOT NULL DEFAULT 10000001 COMMENT '下一个值,BID/BOMID类从10000001起与旧小数字错开',
  table_list VARCHAR(255) DEFAULT NULL COMMENT '适用表清单',
  remark VARCHAR(64) DEFAULT NULL COMMENT '说明,如资产入库/领用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='中央发号表';

-- 语义状态码(NB3可抄3):SID手工语义号,非自增;万位分域,百位分动作,x50为变体
-- fs借鉴:1xxxx=资产域动作;本库:10xxx=入库系 11xxx=出库系 12xxx=仓内系 13xxx=盘点系 14xxx=终态系 18xxx=耗材系
CREATE TABLE IF NOT EXISTS sys_biz_state(
  sid INT NOT NULL PRIMARY KEY COMMENT '语义状态码,如10100入库/10400领用/13100盘点',
  biz VARCHAR(16) NOT NULL COMMENT '单据前缀:DJ/RK/LY/TL/PD/SQ/JS/TK/DB/TZ/CP/JJ/TC',
  name VARCHAR(64) NOT NULL COMMENT '状态名称',
  bill_no_format VARCHAR(24) DEFAULT NULL COMMENT '单号格式,如RK[SERIAL:6]',
  state_status TINYINT NOT NULL DEFAULT 1 COMMENT '是否台账状态列显示:1显示0不显示',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用:1启用0停用(与显示位分离,避STATE多义)',
  inc_flag TINYINT NOT NULL DEFAULT 0 COMMENT '增标志(统计用)',
  dec_flag TINYINT NOT NULL DEFAULT 0 COMMENT '减标志(统计用)',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义状态字典';

-- 方法字典(NB3可抄3附):挂在SID下,METHOD_CODE固定01/02/99(99=其他)
CREATE TABLE IF NOT EXISTS sys_bill_method(
  bmid INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '方法ID',
  sid INT NOT NULL COMMENT '所属语义状态sys_biz_state.sid(逻辑外键)',
  method_code VARCHAR(8) NOT NULL COMMENT '方法编码01/02/99',
  method_name VARCHAR(64) NOT NULL COMMENT '方法名称,如正常采购/日常领用',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  KEY idx_method_sid (sid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据方法字典';

-- ============ A组:业务核心 ============
-- 物料线:mat_category(分类树) -> mat_master(档案,三计量) -> batch/material_item(实物)
CREATE TABLE IF NOT EXISTS mat_category(
  cat_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '物料分类码',
  parent_code VARCHAR(32) DEFAULT NULL COMMENT '父分类P_前缀',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '定长分级码001/001002式,字符串排序即树序',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(64) NOT NULL COMMENT '名称,如面料/辅料/五金/包装/耗材',
  sort INT NOT NULL DEFAULT 0 COMMENT '排序,与业务键分离',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  KEY idx_mcat_parent (parent_code),
  KEY idx_mcat_auto (autocode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料分类树';
CREATE TABLE IF NOT EXISTS mat_master(
  material_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '物料编码(仅物料,成品另见product_master)',
  cat_code VARCHAR(32) DEFAULT NULL COMMENT '逻辑外键->mat_category.cat_code',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '自有分级排序码',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(128) NOT NULL COMMENT '名称',
  spec VARCHAR(128) DEFAULT NULL COMMENT '规格型号',
  base_unit VARCHAR(16) NOT NULL COMMENT '基本单位,单据unit必须等于此(防米+件混加)',
  pack_unit VARCHAR(16) DEFAULT NULL COMMENT '包装单位,如箱/包',
  pack_qty DECIMAL(18,3) NOT NULL DEFAULT 1.000 COMMENT '每包装含基本单位数DECIMAL',
  sub_unit VARCHAR(16) DEFAULT NULL COMMENT '细分/拆零单位',
  sub_qty DECIMAL(18,3) DEFAULT NULL COMMENT '细分换算数',
  manage_mode VARCHAR(16) NOT NULL DEFAULT 'QTY' COMMENT '管理模式QTY批次数量/CODE一物一码',
  price_ref DECIMAL(18,2) DEFAULT NULL COMMENT '参考单价,只上标签不进报表',
  max_qty DECIMAL(18,3) DEFAULT NULL COMMENT '最高库存,写预警规则',
  min_qty DECIMAL(18,3) DEFAULT NULL COMMENT '最低库存',
  shelf_life_days INT DEFAULT NULL COMMENT '保质天数',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态:启用/停用',
  KEY idx_mat_cat (cat_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料档案(仅物料,不含成品)';
CREATE TABLE IF NOT EXISTS batch(
  batch_no VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '批次号BT级,溯源到此级',
  material_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->mat_master.material_code',
  partner_id VARCHAR(64) DEFAULT NULL COMMENT '往来方',
  source_doc_no VARCHAR(64) DEFAULT NULL COMMENT '来源单号',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间(DATETIME,禁TIMESTAMP)',
  created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
  KEY idx_batch_mat (material_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次表';
CREATE TABLE IF NOT EXISTS material_item(
  barcode VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '单件条码SN级',
  material_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->mat_master.material_code',
  batch_no VARCHAR(32) NOT NULL COMMENT '逻辑外键->batch.batch_no',
  source_doc_no VARCHAR(64) DEFAULT NULL COMMENT '来源单号',
  status VARCHAR(16) NOT NULL DEFAULT '在库' COMMENT '单件业务状态:在库/出库/冻结(非启用位)',
  KEY idx_item_mat (material_code),
  KEY idx_item_batch (batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单件条码表';
CREATE TABLE IF NOT EXISTS stock_onhand(
  material_code VARCHAR(32) NOT NULL DEFAULT '' COMMENT '物料(物料行必填,成品行为空串)',
  product_code VARCHAR(32) NOT NULL DEFAULT '' COMMENT '成品(成品行必填,物料行为空串)',
  batch_no VARCHAR(32) NOT NULL COMMENT '逻辑外键->batch',
  wh VARCHAR(32) NOT NULL COMMENT '仓库编码->warehouse.wh_code',
  loc VARCHAR(64) NOT NULL COMMENT '库位编码->location.loc_code',
  on_hand DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '现存DECIMAL',
  avail DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '可用',
  pending DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '待发',
  quarantine DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '隔离',
  frozen DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '冻结',
  PRIMARY KEY(material_code, product_code, batch_no, wh, loc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='现存快照(物料行product_code为空串,成品行material_code为空串)';
CREATE TABLE IF NOT EXISTS stock_ledger(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键,业务键另用idem_key',
  doc_no VARCHAR(64) NOT NULL COMMENT '逻辑外键->doc_main.doc_no',
  line_no INT NOT NULL DEFAULT 1 COMMENT '行号',
  sid INT DEFAULT NULL COMMENT '语义动作码->sys_biz_state.sid(NB3可抄3)',
  material_code VARCHAR(32) DEFAULT NULL COMMENT '物料(物料账必填)',
  product_code VARCHAR(32) DEFAULT NULL COMMENT '成品(成品账必填),逻辑外键->product_master',
  batch_no VARCHAR(32) DEFAULT NULL COMMENT '批次',
  barcode VARCHAR(64) DEFAULT NULL COMMENT '条码',
  wh VARCHAR(32) DEFAULT NULL COMMENT '仓库',
  loc VARCHAR(64) DEFAULT NULL COMMENT '库位',
  qty DECIMAL(18,3) NOT NULL COMMENT '数量DECIMAL必带unit',
  unit VARCHAR(16) NOT NULL COMMENT '单位',
  dir CHAR(1) NOT NULL COMMENT '方向:1入-1出,替代CALC_STATUS语义',
  biz VARCHAR(16) NOT NULL COMMENT '前缀DJ/RK/LY/TL/PD等,中文只做显示映射',
  by_user VARCHAR(64) NOT NULL COMMENT '操作人',
  device VARCHAR(64) DEFAULT NULL COMMENT '设备',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  idem_key VARCHAR(128) NOT NULL UNIQUE COMMENT '幂等键doc_no:line_no:biz唯一',
  KEY `ix_ledger_doc` (`doc_no`),
  KEY `ix_ledger_mat` (`material_code`),
  KEY `ix_ledger_prod` (`product_code`),
  KEY `ix_ledger_batch` (`batch_no`),
  KEY `ix_ledger_barcode` (`barcode`),
  KEY `ix_ledger_sid` (`sid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='台账流水只增不改(物料账/成品账二选一)';
CREATE TABLE IF NOT EXISTS stock_doc_ref(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  from_doc VARCHAR(64) NOT NULL COMMENT '源单',
  to_doc VARCHAR(64) NOT NULL COMMENT '目标单',
  rel VARCHAR(32) NOT NULL COMMENT '关系:TL->LY/RK->DJ/PD->TK等,行式表达禁宽表(避坑6)',
  UNIQUE KEY uk_doc_ref (from_doc, to_doc, rel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据关联行';
-- 一单一状态(NB3:一张工单只干一件事),O_/N_快照在doc_line/pd_line/transfer_ship上体现
CREATE TABLE IF NOT EXISTS doc_main(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '单号=前缀[SERIAL:6],如RK100001',
  type VARCHAR(8) NOT NULL COMMENT '类型前缀,应用层白名单校验',
  sid INT DEFAULT NULL COMMENT '语义动作码->sys_biz_state.sid',
  bmid INT DEFAULT NULL COMMENT '方法->sys_bill_method.bmid',
  biz_status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT '业务状态(与enabled/flow_status分离)',
  handler VARCHAR(64) DEFAULT NULL COMMENT '经办人',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '制单时间'
,
  KEY `idx_doc_type` (`type`),
  KEY `idx_doc_sid` (`sid`),
  KEY `idx_doc_biz` (`biz_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据主表唯一入口';
CREATE TABLE IF NOT EXISTS doc_line(
  doc_no VARCHAR(64) NOT NULL COMMENT '逻辑外键->doc_main.doc_no',
  line_no INT NOT NULL COMMENT '行号,与GIDX/IDX式排序分离,业务键不排序(可抄7)',
  o_qty DECIMAL(18,3) DEFAULT NULL COMMENT '原数量O_快照(NB3可抄5)',
  n_qty DECIMAL(18,3) DEFAULT NULL COMMENT '新数量N_快照',
  o_loc VARCHAR(64) DEFAULT NULL COMMENT '原库位O_',
  n_loc VARCHAR(64) DEFAULT NULL COMMENT '新库位N_',
  material_code VARCHAR(32) DEFAULT NULL COMMENT '物料(物料单必填,成品单可空)',
  product_code VARCHAR(32) DEFAULT NULL COMMENT '成品(成品单必填:CP/RK-FIN/JJ/TC),逻辑外键->product_master',
  bom_version VARCHAR(16) DEFAULT NULL COMMENT 'BOM版本快照,领料/完工按此展开',
  batch_no VARCHAR(32) DEFAULT NULL COMMENT '批次',
  qty DECIMAL(18,3) NOT NULL COMMENT '本次数量',
  unit VARCHAR(16) NOT NULL COMMENT '单位',
  loc VARCHAR(64) DEFAULT NULL COMMENT '库位',
  qc_result VARCHAR(32) DEFAULT NULL COMMENT '质检结果',
  reason VARCHAR(255) DEFAULT NULL COMMENT '原因=方法名冗余',
  PRIMARY KEY(doc_no, line_no),
  KEY `ix_line_mat` (`material_code`),
  KEY `ix_line_prod` (`product_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据行表(物料行/成品行二选一)';
CREATE TABLE IF NOT EXISTS doc_attachment(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  doc_no VARCHAR(64) NOT NULL COMMENT '逻辑外键->doc_main',
  kind VARCHAR(32) NOT NULL COMMENT '种类:照片/签收/发票',
  ref TEXT NOT NULL COMMENT '引用路径(TEXT,5.6无JSON)',
  by_user VARCHAR(64) DEFAULT NULL COMMENT '上传人',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  KEY idx_attach_doc (doc_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据附件';

-- ============ B组:存证审计 ============
CREATE TABLE IF NOT EXISTS scan_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  code VARCHAR(64) NOT NULL COMMENT '扫码内容',
  result VARCHAR(16) NOT NULL COMMENT '结果:HIT/DUP_SCAN/OVER_ISSUE/SCOPE_DENIED',
  doc_no VARCHAR(64) DEFAULT NULL COMMENT '关联单号',
  by_user VARCHAR(64) DEFAULT NULL COMMENT '操作人',
  device VARCHAR(64) DEFAULT NULL COMMENT '设备',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  KEY idx_scan_code (code)
,
  KEY `idx_scan_doc` (`doc_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码日志只增不改';
CREATE TABLE IF NOT EXISTS audit_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  by_user VARCHAR(64) NOT NULL COMMENT '操作人',
  action VARCHAR(64) NOT NULL COMMENT '动作',
  doc_no VARCHAR(64) DEFAULT NULL COMMENT '单号',
  biz_type VARCHAR(16) DEFAULT NULL COMMENT '前缀',
  result VARCHAR(16) NOT NULL DEFAULT '已完成' COMMENT '结果',
  o_val VARCHAR(255) DEFAULT NULL COMMENT '原值O_快照(可抄5,原before_val改名统一前缀)',
  n_val VARCHAR(255) DEFAULT NULL COMMENT '新值N_快照(原after_val改名)',
  device VARCHAR(64) DEFAULT NULL COMMENT '设备',
  detail TEXT DEFAULT NULL COMMENT '明细'
,
  KEY `idx_audit_doc` (`doc_no`),
  KEY `idx_audit_user` (`by_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志';

-- ============ C组:OCR/问答日志 ============
CREATE TABLE IF NOT EXISTS ocr_document(
  ocr_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'OCR主键',
  doc_no VARCHAR(64) DEFAULT NULL COMMENT '关联单号',
  conf DECIMAL(8,4) DEFAULT NULL COMMENT '置信度DECIMAL',
  ref TEXT DEFAULT NULL COMMENT '原图引用',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OCR文档';
CREATE TABLE IF NOT EXISTS ocr_field_result(
  ocr_id VARCHAR(64) NOT NULL COMMENT '逻辑外键->ocr_document',
  field VARCHAR(64) NOT NULL COMMENT '字段名',
  candidate TEXT DEFAULT NULL COMMENT '候选值',
  conf DECIMAL(8,4) DEFAULT NULL COMMENT '置信度',
  PRIMARY KEY(ocr_id, field)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OCR字段结果';
CREATE TABLE IF NOT EXISTS ai_qa_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  by_user VARCHAR(64) DEFAULT NULL COMMENT '提问人',
  question TEXT NOT NULL COMMENT '问题',
  sql_text TEXT NOT NULL COMMENT '生成SQL(5.6方言)',
  rows_count INT DEFAULT NULL COMMENT '行数(INT不带宽度,避坑3)',
  ms INT DEFAULT NULL COMMENT '耗时ms'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问答日志';

-- ============ D组:问答平台前台(可抄1/6/7:树+子表编码+排序分离) ============
CREATE TABLE IF NOT EXISTS ai_category(
  cat_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '分类ID',
  parent_id VARCHAR(32) DEFAULT NULL COMMENT '父ID,P_前缀(可抄9)',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '定长分级码可抄1',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(64) NOT NULL COMMENT '名称',
  icon VARCHAR(64) DEFAULT NULL COMMENT '图标',
  gidx INT NOT NULL DEFAULT 0 COMMENT '组序号(排序与业务键分离可抄7)',
  idx INT NOT NULL DEFAULT 0 COMMENT '组内序号',
  sort INT NOT NULL DEFAULT 0 COMMENT '兼容旧排序',
  enabled CHAR(1) NOT NULL DEFAULT '1' COMMENT '是否启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问答分类树';
CREATE TABLE IF NOT EXISTS ai_shortcut(
  shortcut_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '快捷ID=cat_id派生xN(可抄6思想)',
  cat_id VARCHAR(32) NOT NULL COMMENT '逻辑外键->ai_category',
  type VARCHAR(16) NOT NULL COMMENT '类型',
  title VARCHAR(128) NOT NULL COMMENT '标题',
  sort INT NOT NULL DEFAULT 0 COMMENT '排序',
  role_allow VARCHAR(255) DEFAULT NULL COMMENT '角色白名单',
  KEY idx_shortcut_cat (cat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快捷入口';
CREATE TABLE IF NOT EXISTS ai_prompt_tpl(
  tpl_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '模板ID',
  cat_id VARCHAR(32) NOT NULL COMMENT '逻辑外键->ai_category',
  version VARCHAR(16) NOT NULL COMMENT '版本',
  content TEXT NOT NULL COMMENT '内容',
  ab_group VARCHAR(16) DEFAULT NULL COMMENT 'AB组',
  KEY idx_tpl_cat (cat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提示词模板';
CREATE TABLE IF NOT EXISTS ai_conversation(
  sess_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '会话ID',
  cat_id VARCHAR(32) DEFAULT NULL COMMENT '分类',
  by_user VARCHAR(64) DEFAULT NULL COMMENT '用户',
  title VARCHAR(255) DEFAULT NULL COMMENT '标题',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话';
CREATE TABLE IF NOT EXISTS ai_message(
  msg_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  sess_id VARCHAR(64) NOT NULL COMMENT '逻辑外键->ai_conversation',
  role VARCHAR(8) NOT NULL COMMENT '角色user/assistant',
  content TEXT NOT NULL COMMENT '内容',
  format VARCHAR(16) DEFAULT NULL COMMENT '格式',
  KEY ix_msg_sess (sess_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息';
CREATE TABLE IF NOT EXISTS ai_feedback(
  msg_id BIGINT NOT NULL PRIMARY KEY COMMENT 'PK即FK->ai_message',
  result VARCHAR(16) NOT NULL COMMENT '结果:有用/无用',
  reason VARCHAR(255) DEFAULT NULL COMMENT '原因'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞反馈';
CREATE TABLE IF NOT EXISTS ai_favorite(
  by_user VARCHAR(64) NOT NULL COMMENT '用户',
  kind VARCHAR(16) NOT NULL COMMENT '种类',
  ref_id VARCHAR(64) NOT NULL COMMENT '引用ID',
  sort INT NOT NULL DEFAULT 0 COMMENT '排序(与键分离)',
  PRIMARY KEY(by_user, kind, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收藏';

-- ============ E组:数据源集成 ============
CREATE TABLE IF NOT EXISTS ds_source(
  src_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '源ID',
  kind VARCHAR(16) NOT NULL COMMENT '种类',
  host VARCHAR(128) DEFAULT NULL COMMENT '主机',
  port INT DEFAULT NULL COMMENT '端口',
  db_name VARCHAR(64) DEFAULT NULL COMMENT '库名',
  read_user VARCHAR(64) DEFAULT NULL COMMENT '只读账号',
  sync_mode VARCHAR(16) NOT NULL DEFAULT '直连' COMMENT '同步模式',
  period VARCHAR(32) DEFAULT NULL COMMENT '周期'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据源';
CREATE TABLE IF NOT EXISTS ds_table_allow(
  src_id VARCHAR(32) NOT NULL COMMENT '源',
  table_name VARCHAR(64) NOT NULL COMMENT '表名',
  alias VARCHAR(64) DEFAULT NULL COMMENT '别名CODE/NAME成对思想',
  PRIMARY KEY(src_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表白名单';
CREATE TABLE IF NOT EXISTS ds_field_allow(
  src_id VARCHAR(32) NOT NULL COMMENT '源',
  table_name VARCHAR(64) NOT NULL COMMENT '表',
  field VARCHAR(64) NOT NULL COMMENT '字段',
  alias VARCHAR(64) DEFAULT NULL COMMENT '别名',
  mask VARCHAR(16) DEFAULT NULL COMMENT '脱敏',
  row_scope VARCHAR(255) DEFAULT NULL COMMENT '行范围',
  PRIMARY KEY(src_id, table_name, field)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字段白名单';
CREATE TABLE IF NOT EXISTS ds_category_scope(
  cat_id VARCHAR(32) NOT NULL COMMENT '分类',
  src_id VARCHAR(32) NOT NULL COMMENT '源',
  table_name VARCHAR(64) NOT NULL COMMENT '表',
  PRIMARY KEY(cat_id, src_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分类数据范围';
CREATE TABLE IF NOT EXISTS ds_join_rel(
  src_a VARCHAR(32) NOT NULL COMMENT '源A',
  table_a VARCHAR(64) NOT NULL COMMENT '表A',
  field_a VARCHAR(64) NOT NULL COMMENT '字段A',
  src_b VARCHAR(32) NOT NULL COMMENT '源B',
  table_b VARCHAR(64) NOT NULL COMMENT '表B',
  field_b VARCHAR(64) NOT NULL COMMENT '字段B',
  PRIMARY KEY(src_a, table_a, field_a, src_b, table_b, field_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='跨源JOIN关系行式存(禁宽表)';

-- ============ F组:知识记忆 ============
CREATE TABLE IF NOT EXISTS kb_memory(
  mem_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '记忆ID',
  layer VARCHAR(8) NOT NULL COMMENT '层L1/L2',
  content TEXT NOT NULL COMMENT '内容',
  hit_count INT NOT NULL DEFAULT 0 COMMENT '命中数',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '状态'
,
  KEY `ix_mem_layer` (`layer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='记忆';
CREATE TABLE IF NOT EXISTS kb_public_doc(
  doc_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '文档ID',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  chunk TEXT NOT NULL COMMENT '分片',
  version VARCHAR(16) DEFAULT NULL COMMENT '版本',
  scope VARCHAR(255) DEFAULT NULL COMMENT '范围'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公共知识';
CREATE TABLE IF NOT EXISTS kb_evolve_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  msg_id BIGINT DEFAULT NULL COMMENT '消息ID',
  rule VARCHAR(255) DEFAULT NULL COMMENT '规则',
  batch_result TEXT DEFAULT NULL COMMENT '批量结果',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进化日志';

-- ============ G组:分析/大屏(可抄6:dash_id派生comp_id) ============
CREATE TABLE IF NOT EXISTS an_report_tpl(
  tpl_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '模板ID',
  kind VARCHAR(16) NOT NULL COMMENT '种类',
  dim TEXT DEFAULT NULL COMMENT '维度(TEXT存JSON)',
  metric TEXT DEFAULT NULL COMMENT '指标',
  threshold TEXT DEFAULT NULL COMMENT '阈值'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分析模板';
CREATE TABLE IF NOT EXISTS dash_component(
  dash_id VARCHAR(32) NOT NULL COMMENT '大屏ID(父码)',
  comp_id VARCHAR(32) NOT NULL COMMENT '组件ID=父码派生(可抄6)',
  type VARCHAR(32) NOT NULL COMMENT '类型',
  bind_cfg TEXT DEFAULT NULL COMMENT '绑定配置',
  refresh_sec INT NOT NULL DEFAULT 300 COMMENT '刷新秒',
  role_allow VARCHAR(255) DEFAULT NULL COMMENT '角色白名单',
  PRIMARY KEY(dash_id, comp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='大屏组件';

-- ============ H组:权限(行式矩阵,禁Sxxx宽表避坑6) ============
CREATE TABLE IF NOT EXISTS sys_role(
  role_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '角色ID',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '分级码可抄1,001/001002式',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(64) NOT NULL COMMENT '名称',
  cat_allow VARCHAR(500) DEFAULT NULL COMMENT '分类范围',
  func_allow VARCHAR(500) DEFAULT NULL COMMENT '功能范围',
  data_scope VARCHAR(500) DEFAULT NULL COMMENT '数据范围'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色';
CREATE TABLE IF NOT EXISTS sys_user_role(
  username VARCHAR(64) NOT NULL COMMENT '用户',
  role_id VARCHAR(32) NOT NULL COMMENT '角色',
  PRIMARY KEY(username, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联物理删除';

-- ============ I组:基础资料 ============
-- 成品线:prod_category(分类) -> product_master(档案,CP-独立编码) -> bom_master/bom_line(配方:成品=>物料明细)
-- 物料配置/成品配置/BOM配置关系:物料管进出计量,成品管接单交付,BOM是配方桥(一成品多版本,领料按BOM展开,完工按BOM倒冲)
CREATE TABLE IF NOT EXISTS prod_category(
  cat_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '成品分类码',
  parent_code VARCHAR(32) DEFAULT NULL COMMENT '父分类',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '定长分级码',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(64) NOT NULL COMMENT '名称',
  sort INT NOT NULL DEFAULT 0 COMMENT '排序',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  KEY idx_pcat_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品分类树';
CREATE TABLE IF NOT EXISTS product_master(
  product_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '成品编码CP-开头,独立于物料编码',
  cat_code VARCHAR(32) DEFAULT NULL COMMENT '逻辑外键->prod_category.cat_code',
  name VARCHAR(128) NOT NULL COMMENT '成品名称',
  spec VARCHAR(128) DEFAULT NULL COMMENT '规格',
  style VARCHAR(64) DEFAULT NULL COMMENT '款号',
  customer VARCHAR(64) DEFAULT NULL COMMENT '归属客户',
  base_unit VARCHAR(16) NOT NULL DEFAULT '件' COMMENT '基本单位',
  price_ref DECIMAL(18,2) DEFAULT NULL COMMENT '参考单价',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态',
  KEY idx_prod_cat (cat_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品档案(与物料平级的一大模块)';
CREATE TABLE IF NOT EXISTS bom_master(
  product_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->product_master.product_code',
  version VARCHAR(16) NOT NULL COMMENT '配方版本,一成品多版本,启用仅一个(应用层保)',
  handler VARCHAR(64) DEFAULT NULL COMMENT '经办人',
  eff_date DATETIME DEFAULT NULL COMMENT '生效日期',
  status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT 'BOM状态:草稿/启用/停用',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY(product_code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM头(配方版本)';
CREATE TABLE IF NOT EXISTS bom_line(
  product_code VARCHAR(32) NOT NULL COMMENT '成品',
  version VARCHAR(16) NOT NULL COMMENT '版本',
  line_no INT NOT NULL COMMENT '行号',
  material_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->mat_master.material_code,配方用料',
  qty DECIMAL(18,3) NOT NULL COMMENT '单位成品耗用DECIMAL',
  unit VARCHAR(16) NOT NULL COMMENT '单位=物料base_unit',
  loss_rate DECIMAL(8,4) NOT NULL DEFAULT 0.0000 COMMENT '损耗率',
  PRIMARY KEY(product_code, version, line_no)
,
  KEY `ix_bomline_mat` (`material_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM行(配方明细:成品=>物料)';
-- 仓储域:只管物料和成品的进出与存放,不管配方;进出全走单据(doc_main+ledger),本域只存地点
CREATE TABLE IF NOT EXISTS warehouse(
  wh_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '仓库码WH-A外仓/WH-B内仓1/WH-C内仓2',
  parent_code VARCHAR(32) DEFAULT NULL COMMENT '父仓P_前缀',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '分级码001/002',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子',
  name VARCHAR(64) NOT NULL COMMENT '名称',
  wh_type VARCHAR(32) DEFAULT NULL COMMENT '类型:原料仓/成品仓/待检区/隔离区/外仓/内仓',
  stock_kind VARCHAR(16) DEFAULT NULL COMMENT '存放物:MAT物料/FIN成品/ALL两者',
  manager VARCHAR(64) DEFAULT NULL COMMENT '负责人',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用(有库存或库区只能停用不能删,应用层卡)',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库档案(地点,不管账,账在ledger)';
CREATE TABLE IF NOT EXISTS location(
  loc_code VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '库位结构化主键WH-ZONE-...',
  wh_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->warehouse',
  autocode VARCHAR(32) DEFAULT NULL COMMENT '分级码',
  zone_label VARCHAR(64) DEFAULT NULL COMMENT '中文显示名',
  capacity DECIMAL(18,3) DEFAULT NULL COMMENT '容量',
  qr_code VARCHAR(128) DEFAULT NULL COMMENT '库区码',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态',
  KEY idx_loc_wh (wh_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库位档案';
CREATE TABLE IF NOT EXISTS customer(
  cust_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '客户ID=KH001类',
  name VARCHAR(128) NOT NULL COMMENT '名称',
  cust_type VARCHAR(32) DEFAULT NULL COMMENT '类型:客户/供应商',
  contact VARCHAR(64) DEFAULT NULL COMMENT '联系人',
  phone VARCHAR(32) DEFAULT NULL COMMENT '电话',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '状态'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户档案';
-- 组织树(NB3可抄1标杆):autocode定长3位/级,字符串排序即树序;level由autocode长度推导,另存冗余
CREATE TABLE IF NOT EXISTS org_node(
  node_code VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '节点码',
  autocode VARCHAR(32) NOT NULL COMMENT '定长分级码001/001001式',
  lowest TINYINT NOT NULL DEFAULT 1 COMMENT '是否叶子(班组/工位=1)',
  name VARCHAR(64) NOT NULL COMMENT '名称',
  level VARCHAR(16) NOT NULL COMMENT '级别:监区/楼栋/楼层/车间/班组/工位',
  parent_code VARCHAR(64) DEFAULT NULL COMMENT '父节点P_前缀',
  leader VARCHAR(64) DEFAULT NULL COMMENT '负责人',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态',
  KEY idx_org_parent (parent_code),
  KEY idx_org_autocode (autocode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织架构树';
CREATE TABLE IF NOT EXISTS doc_template(
  tpl_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '模板码MB-SHD类',
  biz VARCHAR(16) NOT NULL COMMENT '前缀',
  version VARCHAR(16) NOT NULL COMMENT '版本v5类',
  content TEXT NOT NULL COMMENT '内容',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '状态'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据模板';

-- ============ J组:成品+盘点 ============
CREATE TABLE IF NOT EXISTS pd_task(
  pd_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '盘点单号PD[SERIAL:6]',
  sid INT DEFAULT NULL COMMENT '语义码13100类',
  mode VARCHAR(16) NOT NULL DEFAULT '人工临时' COMMENT '模式:02:30自动/人工临时',
  wh_code VARCHAR(32) DEFAULT NULL COMMENT '仓库范围冻结',
  scope TEXT DEFAULT NULL COMMENT '范围',
  biz_status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT '业务状态(与enabled分离)',
  handler VARCHAR(64) DEFAULT NULL COMMENT '经办人',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点任务';
-- O_/N_快照+差异(NB3可抄5):book=O_账面 real=N_实盘 diff=差异
CREATE TABLE IF NOT EXISTS pd_line(
  pd_no VARCHAR(64) NOT NULL COMMENT '逻辑外键->pd_task',
  line_no INT NOT NULL COMMENT '行号',
  o_qty DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '原账面O_(book_qty改名统一)',
  n_qty DECIMAL(18,3) DEFAULT NULL COMMENT '新实盘N_(real_qty改名统一)',
  diff_qty DECIMAL(18,3) DEFAULT NULL COMMENT '差异= N-O',
  material_code VARCHAR(32) NOT NULL COMMENT '物料',
  batch_no VARCHAR(32) DEFAULT NULL COMMENT '批次',
  book_qty DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '账面(兼容旧字段)',
  real_qty DECIMAL(18,3) DEFAULT NULL COMMENT '实盘(兼容旧字段)',
  unit VARCHAR(16) NOT NULL COMMENT '单位',
  reason VARCHAR(255) DEFAULT NULL COMMENT '原因',
  PRIMARY KEY(pd_no, line_no)
,
  KEY `ix_pdline_mat` (`material_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点行PD不动账,复核后另生TK/RK单调账';
CREATE TABLE IF NOT EXISTS deliver_sign(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'PK即FK->doc_main,JJ必填',
  receiver VARCHAR(64) NOT NULL COMMENT '接收人',
  sign_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签收时间',
  sender VARCHAR(64) DEFAULT NULL COMMENT '送货人',
  proof_ref TEXT DEFAULT NULL COMMENT '证据引用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='交付签收存证';
CREATE TABLE IF NOT EXISTS label_print(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  code VARCHAR(64) NOT NULL COMMENT '码值SB/BT/库区码',
  kind VARCHAR(16) NOT NULL COMMENT '种类',
  content VARCHAR(255) DEFAULT NULL COMMENT '内容',
  printed_by VARCHAR(64) DEFAULT NULL COMMENT '打印人',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  KEY idx_label_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签打印即记';
CREATE TABLE IF NOT EXISTS fee_settle(
  settle_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '结算单号',
  customer VARCHAR(64) NOT NULL COMMENT '客户',
  period VARCHAR(32) NOT NULL COMMENT '账期日/周/月',
  qty_send DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '送货数',
  qty_issue DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '发料数',
  qty_fin DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '成品数',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '金额DECIMAL(18,2)',
  biz_status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT '业务状态:草稿/确认/归档'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加工费对账头汇总';

-- ============ K组:工单/审批流(行式流转,禁Sxxx宽表) ============
CREATE TABLE IF NOT EXISTS flow_def(
  flow_key VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '流程键=doc_type派生',
  doc_type VARCHAR(16) NOT NULL COMMENT '单据前缀',
  steps_cfg TEXT NOT NULL COMMENT '步骤JSON([{k:S1,role:经办人,on:1}..])TEXT存',
  KEY idx_flow_doctype (doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批流定义';
CREATE TABLE IF NOT EXISTS flow_instance(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'PK即FK->doc_main',
  flow_key VARCHAR(64) NOT NULL COMMENT '流程键',
  cur_step VARCHAR(16) NOT NULL DEFAULT 'S1' COMMENT '当前步S1..S6',
  flow_status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT '流状态(与biz_status分离,避多义)',
  approver VARCHAR(64) DEFAULT NULL COMMENT '当前审批人',
  updated_at DATETIME DEFAULT NULL COMMENT '更新时间',
  hist TEXT DEFAULT NULL COMMENT '历史JSON',
  KEY idx_flow_key (flow_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批流实例';
CREATE TABLE IF NOT EXISTS wo_task(
  wo_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '生产工单号WO[SERIAL:6]',
  product_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->product_master,生产什么成品',
  bom_version VARCHAR(16) DEFAULT NULL COMMENT '配方版本,领料/倒冲按此版本展开',
  qty_plan DECIMAL(18,3) NOT NULL COMMENT '计划数',
  qty_done DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '完工数(一轮完工汇总)',
  workshop VARCHAR(64) DEFAULT NULL COMMENT '车间=org_node叶子',
  biz_status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT '业务状态',
  KEY idx_wo_product (product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产工单(成品线:接单=>领料=>完工=>入库)';

-- ============ L组:报表中心 ============
CREATE TABLE IF NOT EXISTS rpt_config(
  rpt_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '报表码',
  category VARCHAR(32) NOT NULL COMMENT '12类:收发存/余额/领退/调仓/退料/成品/差异/库龄/损耗/对账/日报/完工',
  period_type VARCHAR(16) NOT NULL COMMENT '周期类型',
  scope_cfg TEXT DEFAULT NULL COMMENT '范围配置',
  auto_cron VARCHAR(64) DEFAULT NULL COMMENT '自动cron'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报表配置';
CREATE TABLE IF NOT EXISTS rpt_instance(
  rpt_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '实例号',
  rpt_code VARCHAR(32) NOT NULL COMMENT '逻辑外键->rpt_config',
  period VARCHAR(32) DEFAULT NULL COMMENT '账期',
  biz_status VARCHAR(16) NOT NULL DEFAULT '草稿' COMMENT '草稿/发布,只读不改账',
  content_ref TEXT DEFAULT NULL COMMENT '内容引用',
  generated_by VARCHAR(64) DEFAULT NULL COMMENT '生成人',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  KEY idx_rpt_code (rpt_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报表实例';

-- ============ M组:系统管理扩展 ============
CREATE TABLE IF NOT EXISTS sys_user(
  username VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '账号(自然键,登录用)',
  name VARCHAR(64) NOT NULL COMMENT '姓名CODE/NAME成对',
  password_hash VARCHAR(128) DEFAULT NULL COMMENT '密码哈希',
  phone VARCHAR(32) DEFAULT NULL COMMENT '电话',
  data_scope VARCHAR(500) DEFAULT NULL COMMENT '数据范围仓库/客户/组织过滤',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用(与状态分离)',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态',
  last_login DATETIME DEFAULT NULL COMMENT '最后登录',
  last_device VARCHAR(64) DEFAULT NULL COMMENT '最后设备'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号主表';
CREATE TABLE IF NOT EXISTS equipment(
  eq_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '设备ID',
  kind VARCHAR(32) NOT NULL COMMENT '种类PDA/扫描枪/标签',
  sn VARCHAR(128) DEFAULT NULL COMMENT '序列号',
  holder VARCHAR(64) DEFAULT NULL COMMENT '持有人',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '状态'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备台账不进驾驶舱';
CREATE TABLE IF NOT EXISTS sync_queue(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '代理键',
  payload TEXT NOT NULL COMMENT '载荷JSON',
  biz_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '业务状态机:P具体值PENDING/SENT/FAIL',
  retries INT NOT NULL DEFAULT 0 COMMENT '重试数',
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入队时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='离线同步队列幂等补传';

-- ============ N组:调仓/对账/权限矩阵 ============
-- O_/N_快照标杆:apply=O_申请 sent=过程 recv=N_实收
CREATE TABLE IF NOT EXISTS transfer_ship(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'PK即FK->doc_main,DB调仓单',
  from_wh VARCHAR(32) NOT NULL COMMENT '源仓',
  to_wh VARCHAR(32) NOT NULL COMMENT '目标仓',
  from_loc VARCHAR(64) DEFAULT NULL COMMENT '源库位',
  to_loc VARCHAR(64) DEFAULT NULL COMMENT '目标库位',
  o_qty DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '申请数O_',
  qty_apply DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '申请数(兼容旧)',
  qty_sent DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '已发数',
  n_qty DECIMAL(18,3) DEFAULT NULL COMMENT '实收数N_',
  qty_recv DECIMAL(18,3) DEFAULT NULL COMMENT '实收数(兼容旧)',
  unit VARCHAR(16) NOT NULL COMMENT '单位',
  carrier VARCHAR(64) DEFAULT NULL COMMENT '承运(在途只读)',
  plate VARCHAR(32) DEFAULT NULL COMMENT '车牌',
  eta DATETIME DEFAULT NULL COMMENT '预计到达',
  diff_status VARCHAR(16) NOT NULL DEFAULT '无差异' COMMENT '差异确认状态',
  KEY idx_ship_to (to_wh)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调仓在途申请/已发/已收';
CREATE TABLE IF NOT EXISTS fee_settle_line(
  settle_no VARCHAR(64) NOT NULL COMMENT '逻辑外键->fee_settle',
  line_no INT NOT NULL COMMENT '行号',
  o_qty_send DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '原送货O_',
  n_qty_confirm DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '确认数N_',
  material_code VARCHAR(32) NOT NULL COMMENT '物料',
  qty_send DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '送货(兼容旧)',
  qty_issue DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '发料',
  qty_fin DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '成品',
  qty_confirm DECIMAL(18,3) NOT NULL DEFAULT 0.000 COMMENT '确认(兼容旧)',
  unit VARCHAR(16) NOT NULL COMMENT '单位',
  PRIMARY KEY(settle_no, line_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账明细订单级行';
CREATE TABLE IF NOT EXISTS sys_perm(
  role_id VARCHAR(32) NOT NULL COMMENT '角色',
  action VARCHAR(32) NOT NULL COMMENT '动作7种,行式70行(10角色x7动作)',
  allowed CHAR(1) NOT NULL DEFAULT '0' COMMENT '是否允许',
  PRIMARY KEY(role_id, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色动作矩阵';

-- ============ 初始种子(容量声明+SID+发号器,保证空库可跑) ============
INSERT INTO sys_config(cfg_key,cfg_value,remark) VALUES
('ORG_LEVEL_COUNT','6','组织级数:监区/楼栋/楼层/车间/班组/工位'),
('ORG_LEVEL_PER','1000','每级容量1000,与autocode/CID容量联动(NB3可抄2)'),
('DOC_NO_SERIAL_LEN','6','单号流水位宽[SERIAL:6]')
ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value);
INSERT INTO sys_biz_state(sid,biz,name,bill_no_format,state_status,enabled,inc_flag,dec_flag) VALUES
(10100,'RK','入库', 'RK[SERIAL:6]',1,1,1,0),
(10400,'LY','领用', 'LY[SERIAL:6]',1,1,0,1),
(10410,'TL','调仓领用','TL[SERIAL:6]',1,1,0,0),
(13100,'PD','实物盘点','PD[SERIAL:6]',0,1,0,0),
(10000,'DJ','物料登记', 'DJ[SERIAL:6]',1,1,0,0),
(10200,'JS','来料拒收', 'JS[SERIAL:6]',0,1,0,0),
(15000,'TK','物料退库', 'TK[SERIAL:6]',1,1,1,0),
(15050,'TC','成品退仓', 'TC[SERIAL:6]',1,1,0,0),
(19000,'DB','调仓', 'DB[SERIAL:6]',1,1,0,0),
(19100,'TZ','库存调整', 'TZ[SERIAL:6]',1,1,0,0),
(11200,'CP','成品登记', 'CP[SERIAL:6]',0,1,0,0),
(11300,'RK','成品入库', 'RK[SERIAL:6]',1,1,1,0),
(11400,'JJ','成品交付', 'JJ[SERIAL:6]',1,1,0,1),
(11500,'WO','生产工单', 'WO[SERIAL:6]',0,1,0,0),
(11600,'SQ','申请领料', 'SQ[SERIAL:6]',0,1,0,0)
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO sys_sequence(seq_name,cid,next_val,remark) VALUES
('DOC_MAIN.DOC_NO',0,10000001,'单据主键池'),
('DOC_MAIN.DOC_NO_RK',0,10000001,'入库单号'),
('DOC_MAIN.DOC_NO_LY',0,10000001,'领用单号'),
('STOCK_LEDGER.ID',0,10000001,'流水代理键池'),
('PD_TASK.PD_NO',0,10000001,'盘点单号'),
('DOC_MAIN.DOC_NO_CP',0,10000001,'成品登记单号'),
('DOC_MAIN.DOC_NO_JJ',0,10000001,'交付单号'),
('DOC_MAIN.DOC_NO_SQ',0,10000001,'申请领料单号'),
('WO_TASK.WO_NO',0,10000001,'生产工单号')
ON DUPLICATE KEY UPDATE next_val=VALUES(next_val);
INSERT INTO sys_bill_method(sid, method_code, method_name, enabled) VALUES
(10100,'01','正常采购',1),(10100,'02','自建转固',1),(10100,'99','其他方式',1),
(10400,'01','新人领用',1),(10400,'02','日常领用',1),(10400,'99','其他领用',1),
(10410,'01','出差借用',1),(10410,'02','客户借用',1),
(13100,'01','日常盘点',1),
(19000,'01','日常调仓',1),(19000,'99','其他调仓',1),
(10200,'01','整批拒收',1),(10200,'02','部分拒收',1),(10200,'99','其他拒收',1),
(15000,'01','车间余料回仓',1),(15000,'02','入库冲红',1),(15000,'03','损坏退还',1),
(11200,'01','成品建档',1),
(11300,'01','成品完工入库',1),(11300,'02','委托回厂',1),
(11400,'01','客户交付',1),(11400,'02','本厂暂存转出',1),
(19100,'01','盘盈盘亏调整',1),(19100,'02','库位纠正',1),
(11500,'01','计划下达',1),(11500,'02','返工补单',1),
(11600,'01','车间申请',1),(11600,'02','计划申请',1)
ON DUPLICATE KEY UPDATE method_name=VALUES(method_name);





-- END: 本文件可重复执行(CREATE TABLE IF NOT EXISTS + INSERT..ON DUPLICATE KEY),无独立CREATE INDEX,无物理外键,无ENUM/JSON/CHECK

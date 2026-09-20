-- WMS 最终版 DDL (单库单文件, MySQL 5.6, InnoDB, utf8mb4, 可直接执行)
-- 库名:wms;33 表 8 组;先业务(A/B)、后平台(D/E/G/H)、F 二期、C 随功能启用。
-- 永久约束 [PERMANENT]:单据前缀 DJ/RK/LY/TL/PD;stock_ledger 只增不改,PD 不动账;
-- idem_key=doc_no:line_no:biz 唯一;数量必带 qty+unit;溯源到 BT 批级;
-- 命名空间 /api/v1/web|app|ai;错误码 DUP_SCAN/OVER_ISSUE/SCOPE_DENIED。
-- MySQL 5.6 注意:无 CHECK(应用层 guards 强制)、无 JSON 类型(JSON 存 TEXT)、
-- 无 CTE/窗口函数(Text2SQL 必须生成 5.6 方言)、CREATE INDEX 无 IF NOT EXISTS(部署前查 INFORMATION_SCHEMA)。
-- 模型不写死:a6api 上哪个都行,切模型只改本地 .env 的 LLM_MODEL,不改代码。
SET NAMES utf8mb4;

-- ============ A 组:业务核心 ============
-- 物料主档
CREATE TABLE IF NOT EXISTS mat_master(
  material_code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  spec VARCHAR(128),
  unit VARCHAR(16) NOT NULL,
  pack_qty DECIMAL(18,3) NOT NULL DEFAULT 1,
  manage_mode VARCHAR(16) NOT NULL DEFAULT 'QTY',
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 批次:建批即绑来源
CREATE TABLE IF NOT EXISTS batch(
  batch_no VARCHAR(32) NOT NULL PRIMARY KEY,
  material_code VARCHAR(32) NOT NULL,
  partner_id VARCHAR(64),
  source_doc_no VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(64),
  CONSTRAINT fk_batch_mat FOREIGN KEY (material_code) REFERENCES mat_master(material_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 单件(BT 级溯源可不逐件建,散件/重点件建)
CREATE TABLE IF NOT EXISTS material_item(
  barcode VARCHAR(64) NOT NULL PRIMARY KEY,
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32) NOT NULL,
  source_doc_no VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '在库',
  CONSTRAINT fk_item_mat FOREIGN KEY (material_code) REFERENCES mat_master(material_code),
  CONSTRAINT fk_item_batch FOREIGN KEY (batch_no) REFERENCES batch(batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 现存快照(问答默认查它,快)
CREATE TABLE IF NOT EXISTS stock_onhand(
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32) NOT NULL,
  wh VARCHAR(32) NOT NULL,
  loc VARCHAR(64) NOT NULL,
  on_hand DECIMAL(18,3) NOT NULL DEFAULT 0,
  avail DECIMAL(18,3) NOT NULL DEFAULT 0,
  pending DECIMAL(18,3) NOT NULL DEFAULT 0,
  quarantine DECIMAL(18,3) NOT NULL DEFAULT 0,
  frozen DECIMAL(18,3) NOT NULL DEFAULT 0,
  PRIMARY KEY(material_code, batch_no, wh, loc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 流水(只增不改,仲裁以它为准;过账唯一入口写;dir 仅 +/-,应用层强制)
CREATE TABLE IF NOT EXISTS stock_ledger(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32),
  barcode VARCHAR(64),
  wh VARCHAR(32),
  loc VARCHAR(64),
  qty DECIMAL(18,3) NOT NULL,
  unit VARCHAR(16) NOT NULL,
  dir CHAR(1) NOT NULL,
  biz VARCHAR(16) NOT NULL,
  by_user VARCHAR(64) NOT NULL,
  device VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idem_key VARCHAR(128) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 关联:由行数据表达单据关系(MVP:TL->LY/RK->DJ/PD->TK/RK;二期加行不改表)
CREATE TABLE IF NOT EXISTS stock_doc_ref(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  from_doc VARCHAR(64) NOT NULL,
  to_doc VARCHAR(64) NOT NULL,
  rel VARCHAR(32) NOT NULL,
  UNIQUE KEY uk_doc_ref(from_doc, to_doc, rel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 单据主/行(MVP 仅 DJ/RK/LY/TL/PD;type 应用层校验)
CREATE TABLE IF NOT EXISTS doc_main(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY,
  type VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  handler VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS doc_line(
  doc_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL,
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32),
  qty DECIMAL(18,3) NOT NULL,
  unit VARCHAR(16) NOT NULL,
  PRIMARY KEY(doc_no, line_no),
  CONSTRAINT fk_line_main FOREIGN KEY (doc_no) REFERENCES doc_main(doc_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 附件(照片存证:压 1024px/jpeg0.7/<=6 张;JSON 存 TEXT)
CREATE TABLE IF NOT EXISTS doc_attachment(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_no VARCHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  ref TEXT NOT NULL,
  by_user VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ B 组:存证审计 ============
CREATE TABLE IF NOT EXISTS scan_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  result VARCHAR(16) NOT NULL,
  doc_no VARCHAR(64),
  by_user VARCHAR(64),
  device VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS audit_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  by_user VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  doc_no VARCHAR(64),
  detail TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ C 组:OCR/问答日志(先建不连,真调启用) ============
CREATE TABLE IF NOT EXISTS ocr_document(
  ocr_id VARCHAR(64) NOT NULL PRIMARY KEY,
  doc_no VARCHAR(64),
  conf DECIMAL(8,4),
  ref TEXT,
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ocr_field_result(
  ocr_id VARCHAR(64) NOT NULL,
  field VARCHAR(64) NOT NULL,
  candidate TEXT,
  conf DECIMAL(8,4),
  PRIMARY KEY(ocr_id, field),
  CONSTRAINT fk_ocr_doc FOREIGN KEY (ocr_id) REFERENCES ocr_document(ocr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_qa_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  by_user VARCHAR(64),
  question TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  rows_count INT,
  ms INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ D 组:问答平台前台 ============
-- 分类(一/二级导航)
CREATE TABLE IF NOT EXISTS ai_category(
  cat_id VARCHAR(32) NOT NULL PRIMARY KEY,
  parent_id VARCHAR(32),
  name VARCHAR(64) NOT NULL,
  icon VARCHAR(64),
  sort INT NOT NULL DEFAULT 0,
  enabled CHAR(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 快捷操作(检索/生成/执行/跳转,应用层校验)
CREATE TABLE IF NOT EXISTS ai_shortcut(
  shortcut_id VARCHAR(32) NOT NULL PRIMARY KEY,
  cat_id VARCHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  title VARCHAR(128) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  role_allow VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Prompt 模板(每分类独立版本+AB组)
CREATE TABLE IF NOT EXISTS ai_prompt_tpl(
  tpl_id VARCHAR(32) NOT NULL PRIMARY KEY,
  cat_id VARCHAR(32) NOT NULL,
  version VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  ab_group VARCHAR(16)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 会话/消息/反馈/收藏(收藏与个人快捷合一)
CREATE TABLE IF NOT EXISTS ai_conversation(
  sess_id VARCHAR(64) NOT NULL PRIMARY KEY,
  cat_id VARCHAR(32),
  by_user VARCHAR(64),
  title VARCHAR(255),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_message(
  msg_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sess_id VARCHAR(64) NOT NULL,
  role VARCHAR(8) NOT NULL,
  content TEXT NOT NULL,
  format VARCHAR(16)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_feedback(
  msg_id BIGINT NOT NULL PRIMARY KEY,
  result VARCHAR(16) NOT NULL,
  reason VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_favorite(
  by_user VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  ref_id VARCHAR(64) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY(by_user, kind, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ E 组:数据源集成(只读账号;行级权限;跨库关联) ============
CREATE TABLE IF NOT EXISTS ds_source(
  src_id VARCHAR(32) NOT NULL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  host VARCHAR(128),
  port INT,
  db_name VARCHAR(64),
  read_user VARCHAR(64),
  sync_mode VARCHAR(16) NOT NULL DEFAULT '直连',
  period VARCHAR(32)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ds_table_allow(
  src_id VARCHAR(32) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  alias VARCHAR(64),
  PRIMARY KEY(src_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ds_field_allow(
  src_id VARCHAR(32) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  field VARCHAR(64) NOT NULL,
  alias VARCHAR(64),
  mask VARCHAR(16),
  row_scope VARCHAR(255),
  PRIMARY KEY(src_id, table_name, field)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ds_category_scope(
  cat_id VARCHAR(32) NOT NULL,
  src_id VARCHAR(32) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  PRIMARY KEY(cat_id, src_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ds_join_rel(
  src_a VARCHAR(32) NOT NULL,
  table_a VARCHAR(64) NOT NULL,
  field_a VARCHAR(64) NOT NULL,
  src_b VARCHAR(32) NOT NULL,
  table_b VARCHAR(64) NOT NULL,
  field_b VARCHAR(64) NOT NULL,
  PRIMARY KEY(src_a, table_a, field_a, src_b, table_b, field_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ F 组:知识记忆(二期) ============
CREATE TABLE IF NOT EXISTS kb_memory(
  mem_id VARCHAR(64) NOT NULL PRIMARY KEY,
  layer VARCHAR(8) NOT NULL,
  content TEXT NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS kb_public_doc(
  doc_id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  chunk TEXT NOT NULL,
  version VARCHAR(16),
  scope VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS kb_evolve_log(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msg_id BIGINT,
  rule VARCHAR(255),
  batch_result TEXT,
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ G 组:分析/大屏(先合后拆) ============
-- 五类分析(kind=单点/汇总/决策/报告/预测,应用层校验)+四类大屏组件合一
CREATE TABLE IF NOT EXISTS an_report_tpl(
  tpl_id VARCHAR(32) NOT NULL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  dim TEXT,
  metric TEXT,
  threshold TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dash_component(
  dash_id VARCHAR(32) NOT NULL,
  comp_id VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL,
  bind_cfg TEXT,
  refresh_sec INT NOT NULL DEFAULT 300,
  role_allow VARCHAR(255),
  PRIMARY KEY(dash_id, comp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ H 组:权限(用户沿用现有体系,只建映射) ============
CREATE TABLE IF NOT EXISTS sys_role(
  role_id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  cat_allow VARCHAR(500),
  func_allow VARCHAR(500),
  data_scope VARCHAR(500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sys_user_role(
  username VARCHAR(64) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  PRIMARY KEY(username, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 索引(溯源三索引必建;5.6 无 IF NOT EXISTS,重复跑先查 INFORMATION_SCHEMA) ============
CREATE INDEX ix_ledger_barcode ON stock_ledger(barcode);
CREATE INDEX ix_ledger_batch ON stock_ledger(batch_no);
CREATE INDEX ix_ledger_doc ON stock_ledger(doc_no);
CREATE INDEX ix_ledger_mat ON stock_ledger(material_code);
CREATE INDEX ix_item_batch ON material_item(batch_no);
CREATE INDEX ix_line_mat ON doc_line(material_code);
CREATE INDEX ix_msg_sess ON ai_message(sess_id);
CREATE INDEX ix_mem_layer ON kb_memory(layer);
CREATE INDEX ix_field_src ON ds_field_allow(src_id, table_name);
CREATE INDEX ix_scope_cat ON ds_category_scope(cat_id);
CREATE INDEX ix_comp_dash ON dash_component(dash_id);

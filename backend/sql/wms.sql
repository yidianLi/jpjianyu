-- WMS 最终版 DDL (单库单文件, MySQL 5.6, InnoDB, utf8mb4, 可直接执行)
-- 库名:wms;57 表 13 组;以 prototype 全部页面为主,单 stock/doc 真源,其他域只加主档/任务/配置表。
-- 永久约束 [PERMANENT]:单据前缀全集 SQ/DJ/JS/RK/LY/TL/TK/DB/PD/TZ/CP/JJ/TC,MVP 先用 DJ/RK/LY/TL/PD,
-- 扩展类型只放应用层白名单+stock_doc_ref 行,不建新单据表;
-- stock_ledger 只增不改,PD 不动账;idem_key=doc_no:line_no:biz 唯一;数量必带 qty+unit;溯源到 BT 批级;
-- 命名空间 /api/v1/web|app|ai;错误码 DUP_SCAN/OVER_ISSUE/SCOPE_DENIED。
-- MySQL 5.6 注意:无 CHECK(应用层 guards 强制)、无 JSON 类型(JSON 存 TEXT)、
-- 无 CTE/窗口函数(Text2SQL 必须生成 5.6 方言)、CREATE INDEX 无 IF NOT EXISTS(部署前查 INFORMATION_SCHEMA)。
-- 模型不写死:a6api 上哪个都行,切模型只改本地 .env 的 LLM_MODEL,不改代码。
SET NAMES utf8mb4;

-- ============ A 组:业务核心(物料+成品共用同一套库存/单据真源) ============
-- mat_master 统收全部编码(含 CP- 成品);product_master 只存成品扩展属性(款号/客户),同码
CREATE TABLE IF NOT EXISTS mat_master(
  material_code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  spec VARCHAR(128),
  unit VARCHAR(16) NOT NULL,
  pack_qty DECIMAL(18,3) NOT NULL DEFAULT 1,
  manage_mode VARCHAR(16) NOT NULL DEFAULT 'QTY',
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS batch(
  batch_no VARCHAR(32) NOT NULL PRIMARY KEY,
  material_code VARCHAR(32) NOT NULL,
  partner_id VARCHAR(64),
  source_doc_no VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(64),
  CONSTRAINT fk_batch_mat FOREIGN KEY (material_code) REFERENCES mat_master(material_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS material_item(
  barcode VARCHAR(64) NOT NULL PRIMARY KEY,
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32) NOT NULL,
  source_doc_no VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '在库',
  CONSTRAINT fk_item_mat FOREIGN KEY (material_code) REFERENCES mat_master(material_code),
  CONSTRAINT fk_item_batch FOREIGN KEY (batch_no) REFERENCES batch(batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 现存快照:物料与成品共用,成品编码 CP- 开头同样存此表(wh=成品仓A/B)
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
-- stock_ledger.biz 只存前缀(DJ/RK/LY/TL/PD/SQ/JS/TK/DB/TZ/CP/JJ/TC),中文只做显示映射
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
-- 关联:由行数据表达单据关系(MVP TL->LY/RK->DJ/PD->TK/RK;成品 CP->RK/JJ<-RK/TC<-RK;二期加行不改表)
CREATE TABLE IF NOT EXISTS stock_doc_ref(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  from_doc VARCHAR(64) NOT NULL,
  to_doc VARCHAR(64) NOT NULL,
  rel VARCHAR(32) NOT NULL,
  UNIQUE KEY uk_doc_ref(from_doc, to_doc, rel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 单据主/行:全部工单唯一入口,MVP DJ/RK/LY/TL/PD,扩展 SQ/JS/TK/DB/TZ/CP/JJ/TC 均存此表,type 应用层白名单校验
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
  loc VARCHAR(64),
  qc_result VARCHAR(32),
  reason VARCHAR(255),
  PRIMARY KEY(doc_no, line_no),
  CONSTRAINT fk_line_main FOREIGN KEY (doc_no) REFERENCES doc_main(doc_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
  biz_type VARCHAR(16),
  result VARCHAR(16) NOT NULL DEFAULT '已完成',
  before_val VARCHAR(255),
  after_val VARCHAR(255),
  device VARCHAR(64),
  detail TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ C 组:OCR/问答日志 ============
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
CREATE TABLE IF NOT EXISTS ai_category(
  cat_id VARCHAR(32) NOT NULL PRIMARY KEY,
  parent_id VARCHAR(32),
  name VARCHAR(64) NOT NULL,
  icon VARCHAR(64),
  sort INT NOT NULL DEFAULT 0,
  enabled CHAR(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_shortcut(
  shortcut_id VARCHAR(32) NOT NULL PRIMARY KEY,
  cat_id VARCHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  title VARCHAR(128) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  role_allow VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_prompt_tpl(
  tpl_id VARCHAR(32) NOT NULL PRIMARY KEY,
  cat_id VARCHAR(32) NOT NULL,
  version VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  ab_group VARCHAR(16)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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

-- ============ E 组:数据源集成 ============
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

-- ============ G 组:分析/大屏 ============
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

-- ============ H 组:权限 ============
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

-- ============ I 组:基础资料(原型 base.html P1-P6) ============
-- 成品档案:CP- 开头必须先在 mat_master 建码,此处只存成品扩展属性(款号/客户)
CREATE TABLE IF NOT EXISTS product_master(
  product_code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  style VARCHAR(64),
  customer VARCHAR(64),
  unit VARCHAR(16) NOT NULL DEFAULT '件',
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- BOM:一成品多版本,启用只能一个(应用层保证)
CREATE TABLE IF NOT EXISTS bom_master(
  product_code VARCHAR(32) NOT NULL,
  version VARCHAR(16) NOT NULL,
  handler VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '草稿',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(product_code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS bom_line(
  product_code VARCHAR(32) NOT NULL,
  version VARCHAR(16) NOT NULL,
  line_no INT NOT NULL,
  material_code VARCHAR(32) NOT NULL,
  qty DECIMAL(18,3) NOT NULL,
  unit VARCHAR(16) NOT NULL,
  loss_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  PRIMARY KEY(product_code, version, line_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 仓库档案:WH-A 外仓/WH-B 内仓1/WH-C 内仓2;有库存或库区只能停用不能删(应用层)
CREATE TABLE IF NOT EXISTS warehouse(
  wh_code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  wh_type VARCHAR(32),
  manager VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 库区档案:loc_code 结构化主键,另有中文显示名
CREATE TABLE IF NOT EXISTS location(
  loc_code VARCHAR(64) NOT NULL PRIMARY KEY,
  wh_code VARCHAR(32) NOT NULL,
  zone_label VARCHAR(64),
  capacity DECIMAL(18,3),
  qr_code VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 客户档案:客户=供应商,原型 KH001 恒达服饰
CREATE TABLE IF NOT EXISTS customer(
  cust_id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  cust_type VARCHAR(32),
  contact VARCHAR(64),
  phone VARCHAR(32),
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 组织架构:监区->楼栋->楼层->车间->班组->工位,领料/退料车间下拉从此取
CREATE TABLE IF NOT EXISTS org_node(
  node_code VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL,
  parent_code VARCHAR(64),
  leader VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 单据模板:OCR/问答字段描述来源,MB-SHD 送货单模板 v5 类
CREATE TABLE IF NOT EXISTS doc_template(
  tpl_code VARCHAR(32) NOT NULL PRIMARY KEY,
  biz VARCHAR(16) NOT NULL,
  version VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ J 组:成品管理+仓储作业扩展(原型 finished/location/stocktake) ============
-- 盘点任务:02:30自动/人工临时,范围冻结,未复核不调账
CREATE TABLE IF NOT EXISTS pd_task(
  pd_no VARCHAR(64) NOT NULL PRIMARY KEY,
  mode VARCHAR(16) NOT NULL DEFAULT '人工临时',
  wh_code VARCHAR(32),
  scope TEXT,
  status VARCHAR(16) NOT NULL DEFAULT '草稿',
  handler VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 盘点行:账面/实盘/差异+原因+照片(照片存 doc_attachment)
CREATE TABLE IF NOT EXISTS pd_line(
  pd_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL,
  material_code VARCHAR(32) NOT NULL,
  batch_no VARCHAR(32),
  book_qty DECIMAL(18,3) NOT NULL DEFAULT 0,
  real_qty DECIMAL(18,3),
  diff_qty DECIMAL(18,3),
  unit VARCHAR(16) NOT NULL,
  reason VARCHAR(255),
  PRIMARY KEY(pd_no, line_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 交付签收存证:成品交付 JJ 必填接收人+签收时间+证据
CREATE TABLE IF NOT EXISTS deliver_sign(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY,
  receiver VARCHAR(64) NOT NULL,
  sign_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sender VARCHAR(64),
  proof_ref TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 二维码/标签打印:SB/BT/库区码,打印即记
CREATE TABLE IF NOT EXISTS label_print(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  content VARCHAR(255),
  printed_by VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 加工费对账:单据中心 processing-fee.html,日周月账期,客户确认后归档
CREATE TABLE IF NOT EXISTS fee_settle(
  settle_no VARCHAR(64) NOT NULL PRIMARY KEY,
  customer VARCHAR(64) NOT NULL,
  period VARCHAR(32) NOT NULL,
  qty_send DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_issue DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_fin DECIMAL(18,3) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT '草稿'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ K 组:工单/审批流(原型 material-workbench/finished/approve-flow) ============
-- 审批流定义:按 doc_type 配级数,冲红默认高一档;steps_cfg JSON 约定 [{k:S1,role:经办人,on:1,auto:1}..{k:S6,role:仓管员,on:1,last:1}]
CREATE TABLE IF NOT EXISTS flow_def(
  flow_key VARCHAR(64) NOT NULL PRIMARY KEY,
  doc_type VARCHAR(16) NOT NULL,
  steps_cfg TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 审批流实例:提交S1..仓管确认S6,历史记 hist(TEXT 存 JSON)
CREATE TABLE IF NOT EXISTS flow_instance(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY,
  flow_key VARCHAR(64) NOT NULL,
  cur_step VARCHAR(16) NOT NULL DEFAULT 'S1',
  status VARCHAR(16) NOT NULL DEFAULT '草稿',
  approver VARCHAR(64),
  updated_at TIMESTAMP NULL,
  hist TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 车间工单:一轮完工汇总/完工触发报表来源
CREATE TABLE IF NOT EXISTS wo_task(
  wo_no VARCHAR(64) NOT NULL PRIMARY KEY,
  product_code VARCHAR(32) NOT NULL,
  qty_plan DECIMAL(18,3) NOT NULL,
  qty_done DECIMAL(18,3) NOT NULL DEFAULT 0,
  workshop VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '草稿'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ L 组:报表中心(原型 report/report-config,12类) ============
-- 报表配置:收发存/余额/领退/调仓/退料分布/成品/差异/库龄/损耗/对账/日报周月报/完工汇总
CREATE TABLE IF NOT EXISTS rpt_config(
  rpt_code VARCHAR(32) NOT NULL PRIMARY KEY,
  category VARCHAR(32) NOT NULL,
  period_type VARCHAR(16) NOT NULL,
  scope_cfg TEXT,
  auto_cron VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 报表实例:自动生成草稿,人工确认发布,只读不改账
CREATE TABLE IF NOT EXISTS rpt_instance(
  rpt_no VARCHAR(64) NOT NULL PRIMARY KEY,
  rpt_code VARCHAR(32) NOT NULL,
  period VARCHAR(32),
  status VARCHAR(16) NOT NULL DEFAULT '草稿',
  content_ref TEXT,
  generated_by VARCHAR(64),
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ M 组:系统管理扩展(原型 users/login/equipment/mobile) ============
-- 账号主表:账号可多选角色,数据范围按仓库/客户/组织过滤
CREATE TABLE IF NOT EXISTS sys_user(
  username VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(128),
  phone VARCHAR(32),
  data_scope VARCHAR(500),
  status VARCHAR(16) NOT NULL DEFAULT '启用',
  last_login TIMESTAMP NULL,
  last_device VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 设备台账:只记台账(PDA/扫描枪/标签),不进驾驶舱(驾驶舱已定无设备)
CREATE TABLE IF NOT EXISTS equipment(
  eq_id VARCHAR(64) NOT NULL PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  sn VARCHAR(128),
  holder VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT '启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 离线同步队列:PDA 弱网先写队列,联网补传,幂等键防重
CREATE TABLE IF NOT EXISTS sync_queue(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payload TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  retries INT NOT NULL DEFAULT 0,
  `at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ N 组:本次补齐(transfer/audit/users 原型缺口) ============
-- 调仓在途:本系统无调拨只有调仓;DB=调仓单 申请/已发/已收+运输在途只读(承运/车牌/ETA)+差异确认
CREATE TABLE IF NOT EXISTS transfer_ship(
  doc_no VARCHAR(64) NOT NULL PRIMARY KEY,
  from_wh VARCHAR(32) NOT NULL,
  to_wh VARCHAR(32) NOT NULL,
  from_loc VARCHAR(64),
  to_loc VARCHAR(64),
  qty_apply DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_sent DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_recv DECIMAL(18,3),
  unit VARCHAR(16) NOT NULL,
  carrier VARCHAR(64),
  plate VARCHAR(32),
  eta TIMESTAMP NULL,
  diff_status VARCHAR(16) NOT NULL DEFAULT '无差异'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 对账明细:fee_settle 存头汇总,订单级行存此表
CREATE TABLE IF NOT EXISTS fee_settle_line(
  settle_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL,
  material_code VARCHAR(32) NOT NULL,
  qty_send DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_issue DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_fin DECIMAL(18,3) NOT NULL DEFAULT 0,
  qty_confirm DECIMAL(18,3) NOT NULL DEFAULT 0,
  unit VARCHAR(16) NOT NULL,
  PRIMARY KEY(settle_no, line_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 角色动作矩阵:users.html 10种角色x7种动作,70 行数据
CREATE TABLE IF NOT EXISTS sys_perm(
  role_id VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  allowed CHAR(1) NOT NULL DEFAULT '0',
  PRIMARY KEY(role_id, action)
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
CREATE INDEX ix_bomline_mat ON bom_line(material_code);
CREATE INDEX ix_loc_wh ON location(wh_code);
CREATE INDEX ix_pdline_mat ON pd_line(material_code);
CREATE INDEX ix_rpt_code ON rpt_instance(rpt_code);
CREATE INDEX ix_flow_key ON flow_instance(flow_key);
CREATE INDEX ix_wo_product ON wo_task(product_code);
CREATE INDEX ix_ship_doc ON transfer_ship(to_wh);
CREATE INDEX ix_feeline_settle ON fee_settle_line(settle_no);
CREATE INDEX ix_perm_role ON sys_perm(role_id);

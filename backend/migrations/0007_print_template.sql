-- 0007: 打印报表模板(★报表自定义:入库验收单/领用签字单/调拨确认单等可定义修改)
CREATE TABLE IF NOT EXISTS print_template(
  tpl_code VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '模板码PT级',
  name VARCHAR(128) NOT NULL COMMENT '模板名称',
  doc_type VARCHAR(16) NOT NULL COMMENT '适用单据前缀:RK入库/LY领用/DB调拨等',
  title VARCHAR(128) NOT NULL COMMENT '打印标题',
  header_note VARCHAR(255) DEFAULT NULL COMMENT '表头说明',
  footer_note VARCHAR(255) DEFAULT NULL COMMENT '表脚说明(签字栏等)',
  columns_cfg TEXT NOT NULL COMMENT '列定义JSON[{k,label,w}]',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打印报表模板(可自定义修改)';

INSERT IGNORE INTO print_template(tpl_code,name,doc_type,title,header_note,footer_note,columns_cfg,enabled)
VALUES
('PT-RK','入库验收单','RK','物料入库验收单','仓库：{wh}  库位：{loc}  入库日期：{at}','验收人：________  仓管：________  审批：________',
 '[{"k":"line_no","label":"行号","w":60},{"k":"material_code","label":"物料编码","w":160},{"k":"batch_no","label":"批次","w":120},{"k":"qty","label":"数量","w":90},{"k":"unit","label":"单位","w":70},{"k":"loc","label":"库位","w":120},{"k":"reason","label":"备注","w":140}]',1),
('PT-LY','领用签字单','LY','物料领用签字单','领用人：{handler}  仓库：{wh}  领用日期：{at}','领用人：________  发料人：________  车间：________',
 '[{"k":"line_no","label":"行号","w":60},{"k":"material_code","label":"物料编码","w":160},{"k":"batch_no","label":"批次","w":120},{"k":"qty","label":"数量","w":90},{"k":"unit","label":"单位","w":70},{"k":"loc","label":"库位","w":120},{"k":"reason","label":"备注","w":140}]',1),
('PT-DB','调拨确认单','DB','物料调拨确认单','调出：{wh}  调入：{to_wh}  调拨日期：{at}','调出仓管：________  调入仓管：________  审批：________',
 '[{"k":"line_no","label":"行号","w":60},{"k":"material_code","label":"物料编码","w":160},{"k":"batch_no","label":"批次","w":120},{"k":"qty","label":"数量","w":90},{"k":"unit","label":"单位","w":70},{"k":"loc","label":"调出库位","w":120},{"k":"reason","label":"备注","w":140}]',1);

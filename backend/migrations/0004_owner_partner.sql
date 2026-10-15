-- 0004: 来料加工归属:现存与单据加partner_id(客户=送料方,缺口/排行按此口径)
ALTER TABLE stock_onhand
  ADD COLUMN partner_id VARCHAR(64) DEFAULT NULL COMMENT '归属客户=customer.name' AFTER frozen;
ALTER TABLE doc_main
  ADD COLUMN partner_id VARCHAR(64) DEFAULT NULL COMMENT '往来方=客户' AFTER qc_at;

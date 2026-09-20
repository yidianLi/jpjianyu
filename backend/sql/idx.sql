-- WMS V2.1 索引 (MySQL 5.6, 含溯源三索引, 后端必建)
-- 5.6 不支持 CREATE INDEX IF NOT EXISTS:重复跑会报错,部署脚本自行先查 INFORMATION_SCHEMA。
CREATE INDEX ix_ledger_barcode ON stock_ledger(barcode);
CREATE INDEX ix_ledger_batch ON stock_ledger(batch_no);
CREATE INDEX ix_ledger_doc ON stock_ledger(doc_no);
CREATE INDEX ix_ledger_mat ON stock_ledger(material_code);
CREATE INDEX ix_item_batch ON material_item(batch_no);
CREATE INDEX ix_line_mat ON doc_line(material_code);

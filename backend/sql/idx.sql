-- WMS V2.1 索引（含溯源三索引，后端必建）
CREATE INDEX IF NOT EXISTS ix_ledger_barcode ON stock_ledger(barcode);
CREATE INDEX IF NOT EXISTS ix_ledger_batch ON stock_ledger(batch_no);
CREATE INDEX IF NOT EXISTS ix_ledger_doc ON stock_ledger(doc_no);
CREATE INDEX IF NOT EXISTS ix_ledger_mat ON stock_ledger(material_code);
CREATE INDEX IF NOT EXISTS ix_item_batch ON material_item(batch_no);
CREATE INDEX IF NOT EXISTS ix_line_mat ON doc_line(material_code);

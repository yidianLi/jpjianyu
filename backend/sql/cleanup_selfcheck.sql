-- 清理 selfcheck.py 演示自检残留(按 handler='selfcheck' 标记).
-- 仅删自检自建的单据/流水/现存/批次,不触碰演示数据.
-- 用法: mysql -uroot -p wms < cleanup_selfcheck.sql
DELETE FROM stock_ledger WHERE doc_no IN
  (SELECT doc_no FROM doc_main WHERE handler='selfcheck');
DELETE FROM material_item WHERE source_doc_no IN
  (SELECT doc_no FROM doc_main WHERE handler='selfcheck');
DELETE FROM flow_instance WHERE doc_no IN
  (SELECT doc_no FROM doc_main WHERE handler='selfcheck');
DELETE FROM doc_line WHERE doc_no IN
  (SELECT doc_no FROM doc_main WHERE handler='selfcheck');
DELETE FROM doc_main WHERE handler='selfcheck';
DELETE FROM stock_onhand WHERE batch_no LIKE 'SC-%';
DELETE FROM batch WHERE batch_no LIKE 'SC-%';

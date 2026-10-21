-- 清理 walk.py 全入口巡检残留(按 handler='walk' / 批次 WALK-* 标记,不碰演示数据).
DELETE FROM audit_log WHERE doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM audit_log WHERE doc_no IN ('DZ000022','RC000019','PT000020');
DELETE FROM stock_ledger WHERE doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM material_item WHERE source_doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM flow_instance WHERE doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM transfer_ship WHERE doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM doc_line WHERE doc_no IN (SELECT doc_no FROM doc_main WHERE handler='walk');
DELETE FROM doc_main WHERE handler='walk';
DELETE FROM stock_onhand WHERE batch_no LIKE 'WALK-%';
DELETE FROM batch WHERE batch_no LIKE 'WALK-%';
DELETE FROM fee_settle_line WHERE settle_no='DZ000022';
DELETE FROM fee_settle WHERE settle_no='DZ000022';
DELETE FROM rpt_instance WHERE rpt_no='RPT000018';
DELETE FROM rpt_custom WHERE rpt_code='RC000019';
DELETE FROM print_template WHERE tpl_code='PT000020';
-- 0005: 存量现存补归属(一次性回填,可重复执行):
-- 1)批次有往来方->现存; 2)来源单有归属->现存; 3)来源单挂订单->订单客户->现存
UPDATE stock_onhand o JOIN batch b
  ON b.batch_no=o.batch_no AND b.partner_id IS NOT NULL AND b.partner_id<>''
  SET o.partner_id=b.partner_id
  WHERE (o.partner_id IS NULL OR o.partner_id='');
UPDATE stock_onhand o JOIN doc_main m
  ON m.doc_no=o.batch_no OR m.doc_no IN
    (SELECT source_doc_no FROM batch WHERE batch_no=o.batch_no)
  SET o.partner_id=m.partner_id
  WHERE (o.partner_id IS NULL OR o.partner_id='')
    AND m.partner_id IS NOT NULL AND m.partner_id<>'';
UPDATE stock_onhand o JOIN doc_main m
  ON m.doc_no IN (SELECT source_doc_no FROM batch WHERE batch_no=o.batch_no)
  JOIN sale_order s ON s.order_no=m.src_order_no
  SET o.partner_id=s.customer
  WHERE (o.partner_id IS NULL OR o.partner_id='');

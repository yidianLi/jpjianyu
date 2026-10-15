-- 0003: 到货分析四时间戳+来源订单(存量表ALTER,新库以wms.sql为准)
ALTER TABLE doc_main
  ADD COLUMN src_order_no VARCHAR(64) DEFAULT NULL COMMENT '来源订单(到货关联客户订单)' AFTER `at`,
  ADD COLUMN ordered_at DATETIME DEFAULT NULL COMMENT '下单时间(四时间戳1)' AFTER src_order_no,
  ADD COLUMN shipped_at DATETIME DEFAULT NULL COMMENT '发货时间(四时间戳2)' AFTER ordered_at,
  ADD COLUMN arrived_at DATETIME DEFAULT NULL COMMENT '实到时间(四时间戳3)' AFTER shipped_at,
  ADD COLUMN qc_at DATETIME DEFAULT NULL COMMENT '验收时间(四时间戳4)' AFTER arrived_at;

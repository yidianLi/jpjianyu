-- 0008: 报废处置单据类型 + 批次效期(临期预警)
ALTER TABLE batch
  ADD COLUMN expire_date DATE DEFAULT NULL COMMENT '效期:入库按保质天数推算,供临期预警';
INSERT INTO sys_biz_state(sid,biz,name,bill_no_format,state_status,enabled,inc_flag,dec_flag)
VALUES (15300,'BF','报废处置','BF[SERIAL:6]',1,1,0,1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

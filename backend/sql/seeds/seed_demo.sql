-- 演示种子:仅 SEED_DEMO=1 时灌入,生产库勿用.
-- 含演示账号/主档/设备/对账.重灌安全:计数器用GREATEST防回拨.

-- 演示账号(空密码哈希=免密演示登录,生产必须先设哈希):admin系统管理员/demo仓库演示员
INSERT INTO sys_role(role_id,autocode,lowest,name,cat_allow,func_allow,data_scope) VALUES
('R-ADMIN','1',1,'系统管理员','*','*','*'),
('R-WH','1',1,'仓库演示员','*','*','WH-A,WH-B,WH-C')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO sys_user(username,name,password_hash,phone,data_scope,enabled,status,last_login,last_device) VALUES
('admin','系统管理员','',NULL,'*',1,'启用',NULL,NULL),
('demo','仓库演示员','',NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO sys_user_role(username,role_id) VALUES
('admin','R-ADMIN'),
('demo','R-WH')
ON DUPLICATE KEY UPDATE username=VALUES(username);
-- 正式版幂等落库:Idempotency-Key与响应快照,重启不丢

-- 演示主档(与前端Demo同名,空库开箱即用):3物料/4仓/4库位/1客户/1成品+BOM(V1启用)
INSERT INTO mat_master(material_code,cat_code,autocode,lowest,name,spec,base_unit,pack_unit,pack_qty,manage_mode,price_ref,max_qty,min_qty,enabled,status) VALUES
('HD-OXF-001','ML',NULL,1,'牛津布','600D','米','卷',100.000,'QTY',0.85,50000.000,1000.000,1,'启用'),
('HD-ZP-011','FJ',NULL,1,'拉链','5号尼龙','件','包',100.000,'QTY',0.52,20000.000,500.000,1,'启用'),
('HD-NK-005','FJ',NULL,1,'纽扣','四合扣','件','包',500.000,'QTY',0.95,30000.000,1000.000,1,'启用')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO warehouse(wh_code,parent_code,autocode,lowest,name,wh_type,stock_kind,manager,enabled,status) VALUES
('WH-A',NULL,'001',1,'外仓','外仓','MAT','张建国',1,'启用'),
('WH-B',NULL,'002',1,'内仓1','内仓','MAT','李小明',1,'启用'),
('WH-C',NULL,'003',1,'内仓2','内仓','MAT','王芳',1,'启用'),
('WH-D',NULL,'004',1,'成品仓A','成品仓','FIN','刘强',1,'启用')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO location(loc_code,wh_code,autocode,zone_label,capacity,qr_code,enabled,status) VALUES
('WH-A-01','WH-A','001001','外仓A区1道',10000.000,'WH-A-01',1,'启用'),
('WH-B-01','WH-B','002001','内仓1区1道',8000.000,'WH-B-01',1,'启用'),
('WH-C-01','WH-C','003001','内仓2区1道',8000.000,'WH-C-01',1,'启用'),
('F01','WH-D','004001','成品区1道',20000.000,'F01',1,'启用')
ON DUPLICATE KEY UPDATE zone_label=VALUES(zone_label);
INSERT INTO customer(cust_id,name,cust_type,contact,phone,status) VALUES
('KH001','恒达服饰','客户','陈经理','13800000001','启用')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO product_master(product_code,cat_code,name,spec,style,customer,base_unit,price_ref,enabled,status) VALUES
('CP-JK-001','CP','夹克','常规款','JK-2026','恒达服饰','件',128.00,1,'启用')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO bom_master(product_code,version,handler,eff_date,status) VALUES
('CP-JK-001','V1','张建国',NOW(),'启用')
ON DUPLICATE KEY UPDATE status=VALUES(status);
INSERT INTO bom_line(product_code,version,line_no,material_code,qty,unit,loss_rate) VALUES
('CP-JK-001','V1',1,'HD-OXF-001',2.500,'米',0.0200),
('CP-JK-001','V1',2,'HD-ZP-011',1.000,'件',0.0000),
('CP-JK-001','V1',3,'HD-NK-005',5.000,'件',0.0100)
ON DUPLICATE KEY UPDATE qty=VALUES(qty);
-- 演示设备(PDA-03/04与鉴权白名单一致,序列号脱敏展示)
INSERT INTO equipment(eq_id,kind,sn,holder,status) VALUES
('PDA-03','PDA','SN202600000003','张建国','启用'),
('PDA-04','PDA','SN202600000004','李小明','启用')
ON DUPLICATE KEY UPDATE holder=VALUES(holder);
-- 演示加工费对账(与前端Demo同名客户)
INSERT INTO fee_settle(settle_no,customer,period,qty_send,qty_issue,qty_fin,amount,biz_status) VALUES
('DZ2026091201','恒达服饰','2026-09',5000.000,3200.000,1500.000,3700.00,'待核对'),
('DZ2026091103','宏远纺织','2026-09',2000.000,1350.000,1280.000,3200.00,'确认')
ON DUPLICATE KEY UPDATE amount=VALUES(amount);
-- 演示设备(与鉴权白名单一致):PDA-03/04
INSERT INTO equipment(eq_id,kind,sn,holder,status) VALUES
('PDA-03','PDA','SN-PDA03-2026','张建国','启用'),
('PDA-04','PDA','SN-PDA04-2026','李小明','启用')
ON DUPLICATE KEY UPDATE holder=VALUES(holder);

-- END: 本文件可重复执行(CREATE TABLE IF NOT EXISTS + INSERT..ON DUPLICATE KEY),无独立CREATE INDEX,无物理外键,无ENUM/JSON/CHECK

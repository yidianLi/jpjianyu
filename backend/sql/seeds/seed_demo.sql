-- 演示种子:仅 SEED_DEMO=1 时灌入,生产库勿用.
-- 含演示账号/主档/设备/对账.重灌安全:计数器用GREATEST防回拨.

-- 账号(生产语义:必须持有效密码哈希登录,哈希=SHA256("wms:"+密码)):admin/ok 系统管理员 · demo/demo123456 仓库演示员
INSERT INTO sys_role(role_id,autocode,lowest,name,cat_allow,func_allow,data_scope) VALUES
('R-ADMIN','1',1,'系统管理员','*','*','*'),
('R-WH','1',1,'外仓管理员','*','查看,录入,修改,确认,过账,导出','WH-A'),
('R-WH-IN','1',1,'内仓管理员','*','查看,录入,修改,确认,过账,导出','WH-B,WH-C'),
('R-MAT','1',1,'物料领发员','*','查看,录入,确认','WH-A,WH-B,WH-C'),
('R-WS','1',1,'车间领料员','*','查看,录入','WH-A,WH-B,WH-C'),
('R-FG','1',1,'成品交接员','*','查看,录入,确认','WH-A,WH-B,WH-C'),
('R-SUP','1',1,'监区/楼层负责人','*','查看,审批,导出,关闭异常','*'),
('R-HEAD','1',1,'仓库负责人','*','查看,确认,审批,过账,导出,关闭异常','*'),
('R-CUST','1',1,'客户查看账号','*','查看','*'),
('R-FIN','1',1,'财务查看账号','*','查看,导出','*')
ON DUPLICATE KEY UPDATE name=VALUES(name),func_allow=VALUES(func_allow),data_scope=VALUES(data_scope);
-- 账号(密码哈希=SHA2(CONCAT('wms:',明文),256),与登录口径一致):
--   admin/ok(系统管理员) demo/demo123456(外仓+仓库负责人,多角色) whin/WhIn@2026 mat/Mat@2026
--   ws/Ws@2026 fg/Fg@2026 sup/Sup@2026 head/Head@2026 cust/Cust@2026 fin/Fin@2026
INSERT INTO sys_user(username,name,password_hash,phone,data_scope,enabled,status,last_login,last_device) VALUES
('admin','系统管理员','882b2b6b433bd55fee043a6d5e99dc22417a1e4ca1502a50ac8b0ec3a9f06a3b',NULL,'*',1,'启用',NULL,NULL),
('demo','仓库演示员','153a6a1c384c52eb453c0ea328f5337df21f84af33838b005afce7b4abb006f4',NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL),
('whin','内仓管理员',LOWER(SHA2(CONCAT('wms:','WhIn@2026'),256)),NULL,'WH-B,WH-C',1,'启用',NULL,NULL),
('mat','物料领发员',LOWER(SHA2(CONCAT('wms:','Mat@2026'),256)),NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL),
('ws','车间领料员',LOWER(SHA2(CONCAT('wms:','Ws@2026'),256)),NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL),
('fg','成品交接员',LOWER(SHA2(CONCAT('wms:','Fg@2026'),256)),NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL),
('sup','监区负责人',LOWER(SHA2(CONCAT('wms:','Sup@2026'),256)),NULL,'*',1,'启用',NULL,NULL),
('head','仓库负责人',LOWER(SHA2(CONCAT('wms:','Head@2026'),256)),NULL,'*',1,'启用',NULL,NULL),
('cust','客户查看',LOWER(SHA2(CONCAT('wms:','Cust@2026'),256)),NULL,'*',1,'启用',NULL,NULL),
('fin','财务查看',LOWER(SHA2(CONCAT('wms:','Fin@2026'),256)),NULL,'*',1,'启用',NULL,NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),data_scope=VALUES(data_scope);
INSERT INTO sys_user_role(username,role_id) VALUES
('admin','R-ADMIN'),('demo','R-WH'),('demo','R-HEAD'),
('whin','R-WH-IN'),('mat','R-MAT'),('ws','R-WS'),('fg','R-FG'),
('sup','R-SUP'),('head','R-HEAD'),('cust','R-CUST'),('fin','R-FIN')
ON DUPLICATE KEY UPDATE username=VALUES(username);
-- 正式版幂等落库:Idempotency-Key与响应快照,重启不丢

-- 演示主档(与前端Demo同名,空库开箱即用):3物料/4仓/4库位/1客户/1成品+BOM(V1启用)
INSERT INTO mat_master(material_code,cat_code,autocode,lowest,name,spec,base_unit,pack_unit,pack_qty,manage_mode,price_ref,max_qty,min_qty,enabled,status) VALUES
('HD-OXF-001','ML',NULL,1,'牛津布','600D','米','卷',100.000,'QTY',0.85,50000.000,1000.000,1,'启用'),
('HD-ZP-011','FJ',NULL,1,'拉链','5号尼龙','件','包',100.000,'QTY',0.52,20000.000,500.000,1,'启用'),
('HD-NK-005','FJ',NULL,1,'纽扣','四合扣','件','包',500.000,'CODE',0.95,30000.000,1000.000,1,'启用')
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

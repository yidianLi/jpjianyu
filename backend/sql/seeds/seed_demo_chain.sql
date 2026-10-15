-- 一键演示数据(幂等,可重复执行):订单->计划->工单链 + 临期批次.
-- 演示前执行一次,保证链不断、前后端对得上.
-- 用法: mysql -uroot -p wms < seed_demo_chain.sql

-- 客户订单 SO(恒达服饰/夹克):订3000件,交期下月
INSERT INTO sale_order(order_no,customer,product_code,qty_order,due_date,biz_status)
VALUES ('SO000011','恒达服饰','CP-JK-001',3000.000,'2026-11-15','已下达')
ON DUPLICATE KEY UPDATE qty_order=VALUES(qty_order);

-- 生产计划 PP(来源SO000011):计划2800件
INSERT INTO prod_plan(plan_no,order_no,product_code,qty_plan,workshop,start_date,due_date,biz_status)
VALUES ('PP000012','SO000011','CP-JK-001',2800.000,'缝制一车间','2026-10-10','2026-11-10','已下达')
ON DUPLICATE KEY UPDATE qty_plan=VALUES(qty_plan);

-- 生产工单 WO(按BOM V1):计划2800件
INSERT INTO wo_task(wo_no,product_code,bom_version,qty_plan,qty_done,workshop,biz_status)
VALUES ('WO000013','CP-JK-001','V1',2800.000,0.000,'缝制一车间','已下达')
ON DUPLICATE KEY UPDATE qty_plan=VALUES(qty_plan);

-- 临期演示批次:20天后到期(预警口days=30可命中),60天后到期(对照)
INSERT INTO batch(batch_no,material_code,source_doc_no,created_by,expire_date)
VALUES ('BT-DEMO-01','HD-OXF-001','DJ000001','admin',CURDATE()+INTERVAL 20 DAY),
       ('BT-DEMO-02','HD-ZP-011','DJ000001','admin',CURDATE()+INTERVAL 60 DAY)
ON DUPLICATE KEY UPDATE expire_date=VALUES(expire_date);

-- 演示对账(与库里既有两条同口径,状态走确认语义)
INSERT INTO fee_settle(settle_no,customer,period,qty_send,qty_issue,qty_fin,amount,biz_status)
VALUES ('DZ2026091201','恒达服饰','2026-09',5000.000,3200.000,1500.000,3700.00,'确认')
ON DUPLICATE KEY UPDATE amount=VALUES(amount);

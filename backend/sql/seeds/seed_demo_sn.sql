-- 单件追溯演示:纽扣 HD-NK-005 改为 CODE(一物一码)管理;临期批同步归属.
-- 已在 seed_demo_chain 执行后补一次即可(幂等).
UPDATE mat_master SET manage_mode='CODE' WHERE material_code='HD-NK-005';
UPDATE batch SET material_code='HD-NK-005' WHERE batch_no='BT-DEMO-01';

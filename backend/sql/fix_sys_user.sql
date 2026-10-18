-- 修复:重建被误删的 sys_user 表并回灌演示账号(admin/ok, demo/demo123456)
CREATE TABLE IF NOT EXISTS sys_user(
  username VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '账号(自然键,登录用)',
  name VARCHAR(64) NOT NULL COMMENT '姓名CODE/NAME成对',
  password_hash VARCHAR(128) DEFAULT NULL COMMENT '密码哈希',
  phone VARCHAR(32) DEFAULT NULL COMMENT '电话',
  data_scope VARCHAR(500) DEFAULT NULL COMMENT '数据范围仓库/客户/组织过滤',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用(与状态分离)',
  status VARCHAR(16) NOT NULL DEFAULT '启用' COMMENT '显示状态',
  last_login DATETIME DEFAULT NULL COMMENT '最后登录',
  last_device VARCHAR(64) DEFAULT NULL COMMENT '最后设备'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号主表';
INSERT INTO sys_user(username,name,password_hash,phone,data_scope,enabled,status,last_login,last_device) VALUES
('admin','系统管理员','882b2b6b433bd55fee043a6d5e99dc22417a1e4ca1502a50ac8b0ec3a9f06a3b',NULL,'*',1,'启用',NULL,NULL),
('demo','仓库演示员','153a6a1c384c52eb453c0ea328f5337df21f84af33838b005afce7b4abb006f4',NULL,'WH-A,WH-B,WH-C',1,'启用',NULL,NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash);
INSERT INTO sys_user_role(username,role_id) VALUES
('admin','R-ADMIN'),('demo','R-WH')
ON DUPLICATE KEY UPDATE username=VALUES(username);
SELECT username,name,enabled FROM sys_user;

#!/bin/sh
# 生产首启引导:库中无任何账号且提供了 WMS_BOOTSTRAP_ADMIN=1 时,按 WMS_ADMIN_PASSWORD 建首个管理员.
# 密码哈希口径与应用一致:SHA256("wms:"+明文).
if [ "$WMS_BOOTSTRAP_ADMIN" = "1" ]; then
  if [ -z "$WMS_ADMIN_PASSWORD" ]; then
    echo "WMS_BOOTSTRAP_ADMIN=1 但未提供 WMS_ADMIN_PASSWORD,跳过首管创建."
    exit 0
  fi
  cnt=$(mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "SELECT COUNT(*) FROM sys_user" "$MYSQL_DATABASE")
  if [ "$cnt" = "0" ]; then
    hash=$(printf 'wms:%s' "$WMS_ADMIN_PASSWORD" | sha256sum | awk '{print $1}')
    u="${WMS_ADMIN_USER:-admin}"
    mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "\
INSERT INTO sys_role(role_id,autocode,lowest,name,cat_allow,func_allow,data_scope) VALUES('R-ADMIN','1',1,'系统管理员','*','*','*') ON DUPLICATE KEY UPDATE name=VALUES(name);\
INSERT INTO sys_user(username,name,password_hash,enabled,status) VALUES('$u','系统管理员','$hash',1,'启用') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash);\
INSERT INTO sys_user_role(username,role_id) VALUES('$u','R-ADMIN') ON DUPLICATE KEY UPDATE username=VALUES(username);"
    echo "bootstrap admin '$u' created."
  else
    echo "sys_user 非空($cnt),跳过首管创建."
  fi
else
  echo "WMS_BOOTSTRAP_ADMIN!=1,跳过首管创建(首次生产部署请设 WMS_BOOTSTRAP_ADMIN=1 并配 WMS_ADMIN_PASSWORD)."
fi

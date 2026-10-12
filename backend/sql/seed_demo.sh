#!/bin/sh
# 演示种子门:仅 SEED_DEMO=1 灌入,生产保持干净库.
if [ "$SEED_DEMO" = "1" ]; then
  echo "SEED_DEMO=1, importing demo seeds..."
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /opt/seeds/seed_demo.sql
else
  echo "SEED_DEMO!=1, skip demo seeds."
fi

"""数据库方言适配:一套代码跑 MySQL 与国产库(达梦DM/人大金仓Kingbase/瀚高HGDB).

- 连接串由 DB_URL 决定方言,无需改代码;
- 本模块抹平三类 MySQL 专有语法,供各 router/core 复用:
  1) 分页: LIMIT :o,:n        -> LIMIT :n OFFSET :o
  2) 幂等插入: INSERT IGNORE  -> INSERT ... ON CONFLICT DO NOTHING
  3) upsert:  ON DUPLICATE KEY UPDATE -> ON CONFLICT(...) DO UPDATE
- 反引号标识符已从 SQL 中去除(仅 `at` 等非保留字),双引号/无引号各库皆通.
"""
from app.core.db import engine

NAME = (engine.dialect.name or "mysql").lower()
IS_MYSQL = NAME in ("mysql", "mariadb")
# 国产库常见方言名:达梦 dm/dmPython,金仓 kingbase,瀚高/GaussDB postgresql
IS_POSTGRES_LIKE = NAME in ("postgresql", "kingbase", "dm", "hgdb", "gaussdb")


def upsert_tail(key_cols, set_cols):
    """返回 upsert 语句在 VALUES(...) 之后应追加的片段.

    key_cols: 冲突判定列; set_cols: 冲突时更新的列.
    """
    sets = ", ".join("%s=VALUES(%s)" % (c, c) for c in set_cols)
    if IS_MYSQL:
        return " ON DUPLICATE KEY UPDATE " + sets
    keys = ", ".join(key_cols)
    exsets = ", ".join("%s=EXCLUDED.%s" % (c, c) for c in set_cols)
    return " ON CONFLICT (%s) DO UPDATE SET %s" % (keys, exsets)


def insert_ignore_prefix():
    """INSERT IGNORE 在 MySQL 是前缀;其它库用 INSERT 再补 conflict 后缀."""
    return "INSERT IGNORE" if IS_MYSQL else "INSERT"


def insert_ignore_suffix(key_cols):
    """配合 insert_ignore_prefix 使用:非 MySQL 追加 ON CONFLICT DO NOTHING."""
    if IS_MYSQL:
        return ""
    return " ON CONFLICT (%s) DO NOTHING" % ", ".join(key_cols)


def limit_offset(limit_param="n", off_param="o"):
    """统一分页片段(各库通用写法)."""
    return " LIMIT :%s OFFSET :%s" % (limit_param, off_param)

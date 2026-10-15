# 国产化部署说明（数据库适配）

目标：同一套代码，通过配置即可运行在 **达梦 DM / 人大金仓 KingbaseES / 瀚高 HGDB（或 GaussDB）** 上，
满足「可运行于国产化服务器 + 麒麟系统 + 国产数据库」的国产化要求。

## 1. 连接配置（改一个环境变量而已）

`app/core/db.py` 只读 `DB_URL`，方言由连接串决定，代码零改动：

| 数据库 | DB_URL 示例 |
| --- | --- |
| MySQL 5.6 | `mysql+pymysql://user:pass@host:3306/wms` |
| 达梦 DM8 | `dm+dmPython://user:pass@host:5236/wms` |
| 人大金仓 KingbaseES | `kingbase+ksycopg2://user:pass@host:54321/wms` |
| 瀚高 / PostgreSQL 族 | `postgresql+psycopg2://user:pass@host:5432/wms` |

在 `backend/config/.env` 或容器环境变量里注入即可，例如：

```
DB_URL=dm+dmPython://WMS_USER:******@127.0.0.1:5236/wms
```

> 驱动按目标库安装：达梦 `dmPython`、金仓 `ksycopg2`、瀚高 `psycopg2`。

## 2. SQL 兼容性（代码层已抹平）

历史代码里只用到少量 MySQL 专有语法，已集中到 `app/core/dialect.py` 抹平，其余全部为标准 SQL：

| MySQL 专有 | 国产库等价 | 处理方式 |
| --- | --- | --- |
| `LIMIT :o,:n` | `LIMIT :n OFFSET :o` | 已统一改写（各库通用） |
| `INSERT IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` | `dialect.insert_ignore_*()` |
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT(...) DO UPDATE` | `dialect.upsert_tail()` |
| 反引号 `` `col` `` | 无引号 / 双引号 | 已从 SQL 中去除（仅 `` `at` `` 等非保留字） |

`dialect.NAME / IS_MYSQL / IS_POSTGRES_LIKE` 在运行时由连接串自动判定。

## 3. 建表（DDL）

`wms.sql` 是 MySQL 5.6 方言的权威建表脚本。国产库建表二选一：

1. **用生成器转换**（本仓库提供）：
   ```bash
   python backend/sql/gen_portable_ddl.py
   ```
   产出 `wms_pg.sql`（金仓/瀚高/PG 族）与 `wms_dm.sql`（达梦）。
   转换覆盖：反引号、`INT(n)`/`TINYINT`/`DATETIME`、`AUTO_INCREMENT`、
   `ON UPDATE CURRENT_TIMESTAMP`、表尾 `ENGINE=InnoDB ...`、行内索引拆分等。

2. **用厂商迁移工具**（推荐二次校验）：达梦 DTS / 金仓 KDTS 直接从 MySQL 迁移结构与数据。

> 生成脚本为 best-effort，**上线前务必在目标库实测**。已知需人工确认点：
> - 文件头部 `CREATE DATABASE / USE / SET NAMES` 为 MySQL 写法，国产库请按库替换；
> - 列注释被移除，如需保留可用 `COMMENT ON COLUMN ... IS '...'` 补；
> - 达梦对 `IF NOT EXISTS`、`IDENTITY(1,1)` 支持情况按版本核对。

## 4. 运行时验证清单

- [ ] 目标库执行建表 DDL 成功；
- [ ] 应用以国产库 `DB_URL` 启动，`Application startup complete`；
- [ ] 跑通：登录 → 建单 → 过账（写 `stock_onhand` upsert）→ 分页列表 → 库存/单据/对账导出 xlsx；
- [ ] 冒烟与单测：`python backend/smoke.py`、`python -m pytest backend/tests`。

## 5. 中间件国产化（如甲方要求）

- 操作系统：统信 UOS / 麒麟 Kylin（应用为纯 Python，直接部署即可）；
- 应用服务器：可用 Nginx（国产发行版自带）或麒麟内置；
- 数据库：见上；
- CPU：飞腾 / 鲲鹏 / 龙芯（Python 与驱动均有对应架构包）。

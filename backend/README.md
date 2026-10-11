# WMS 后端启动说明

## 要求

- Python 3.11 / MySQL 5.6（`wms.sql V2.3` 为真源，不换库）
- 每文件 ≤300 行（阿里规约），命名见名知意

## 启动

```bash
cd E:/jianyu/backend
pip install -r requirements.txt
python smoke.py
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Docker 一键起：`docker compose up -d`（`mysql:5.6` + `wms-api`，`sql/wms.sql` 自动初始化，需先启动 Docker Desktop 守护进程）。

## 路由

- `GET /health` 健康检查
- `/api/v1/web/*` PC 端（现存/流水/溯源/单据/主档/驾驶舱）
- `/api/v1/app/*` PDA 端（待办/扫码/清单/提交/补传）
- `/api/v1/ai/*` 问答/OCR（只读禁过账，`LIMIT≤200`）

## 口径

- 单号 `前缀[SERIAL:6]`，中央发号 `sys_sequence`
- `unit` 必须等于档案 `base_unit`
- `SQ/JS/PD` 不动账；`LY` 超发 `OVER_ISSUE`；`TK-01=车间退料`
- 写口 `Idempotency-Key` 必填，重复 409 返原结果

## 验证记录（2026-10-11 step10）

- `wms.sql` 静态核查：64×`CREATE TABLE IF NOT EXISTS`、0 独立 `CREATE INDEX`、
  0 `CHECK`、JSON 仅注释/`COMMENT`（列类型全 `TEXT`）、5 处 `ON DUPLICATE KEY` 种子幂等。
- `smoke.py` 8/8 通过（护栏/幂等/分页/返回体/驾驶舱公式）。
- 容器联调待办：本机 Docker 守护进程未启动，`docker compose up` +
  空库两跑 + 5 读口冒烟待守护进程就绪后执行。

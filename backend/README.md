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

Docker 一键起：`docker compose up -d`（`mysql:5.6` + `wms-api`，`sql/wms.sql` 自动初始化）。

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

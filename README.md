# 监狱公司物料管理系统 · 原型代码

在线演示（GitHub Pages）：`prototype/app.html` 为桌面端入口，`prototype/mobile-app/live-app.html` 为移动端入口。

## 目录结构

```text
prototype/
  app.html              # 桌面端应用壳（含侧边导航）
  index.html            # 旧入口
  pages/                # 各业务页面（home/dashboard/material-workbench/receipt/issue/return/transfer/stocktake/location/inventory/report/approve-flow/ai/ocr/users/equipment/docs/login 等）
    base.html           # 基础模板
    home.html           # 首页
    material-workbench.html
    ...
  assets/               # 前端静态资源
    nav.js / app-router.js / flow.js / store.js / theme.css ...
  mobile-app/           # 移动端 H5（含 live-app.html 入口、screens/ 子页面、api-client.js）
```

根目录另有需求与设计文档（`监狱公司物料管理系统-*.md`、`物料管理-一期流程图.md`）。

## 本地预览

直接用浏览器打开 `prototype/app.html` 即可（部分 fetch 逻辑建议起静态服务）：

```bash
cd prototype
python -m http.server 8000
# 访问 http://localhost:8000/app.html
```

移动端：

```bash
cd prototype/mobile-app
python -m http.server 8001
# 访问 http://localhost:8001/live-app.html
```

## 说明

- 纯静态原型，无构建步骤、无后端依赖。
- 图片/截图/PSD/`prototype.rar`/构建产物等大文件已通过 `.gitignore` 排除，未提交。

# PDA 扫描对接方案 · V1.0

> 面向：移动端/客户端开发、交付、现场联调
> 结论：**PDA 端打包为 APK（`pda-app` WebView 壳 + 厂商 `ScanManager` 广播），H5 现场作业页零改动复用；扫描 + 拍照回传全链路已打通。**
> 起步件：`pda-app/`（Android Studio 直接 Open 构建）

---

## 一、现状与两套 SDK

PDA 端现状是 PWA（`prototype/mobile-app/manifest.json`，`display: standalone`），**PWA 拿不到原生广播、不能调扫描 SDK**，所以必须打包成 APK 才能吃到全能力。

厂商开发包给了**两套 API**，务必分清：

| 套件 | 入口 | 条码广播字段 | 说明 |
|---|---|---|---|
| 新版（`lc\5,扫描2.0\…\ScanManager_V202508251650.jar`） | `android.bld.ScanManager` | `scan.rcv.message` → `barcodeData`(String) | 能力最全：5 种输出模式、连续扫描、码制开关、拍照回传 |
| 旧版/系统类（`参考\…扫描开发包(12.04)`、`uniapp-扫描/scan.vue`） | `android.device.ScanDevice`（`plus.android`） | `scan.rcv.message` → `barocode`(byte[], UTF-8) | uni-app 用反射直调，无需 jar |

> 两者广播 action 相同、**字段名不同**；壳已同时兼容。

---

## 二、三条路线对比与选型

| 方案 | 做法 | 改动量 | 能力 | 结论 |
|---|---|---|---|---|
| A 输入框/键盘模式 | 设备设"输入框/键盘模式"，扫码=按键+回车进聚焦框；H5 用 `input[data-scan-input]` 回收 | 零原生代码 | 依赖焦点、编码，不能控扫描开关/拍照 | 快速试点 / 兜底 |
| **B WebView 壳 + ScanManager 广播** | 原生壳内嵌 WebView 载 H5；`setOPMode(0)` 广播→`evaluateJavascript("PdaScanFeed(..)")` | 一个 Activity（一次性构建），**H5 零改动** | 全能力：开关/连续/码制/**拍照** | ✅ **采用** |
| C uni-app + 原生插件 | `scan.vue` 那套 `ScanDevice`/jar 做 uni 插件 | 需把移动页面重写为 uni-app | 原生、跨端 | 仅当整体迁 uni-app 才选 |

---

## 三、对接链路

```
扫描头(硬件按键) ─▶ 厂商扫描服务 ─▶ 广播 scan.rcv.message {barcodeData|barocode}
                                        │
                            MainActivity.BroadcastReceiver
                                        │ evaluateJavascript
                                        ▼
       H5: window.PdaScanFeed(code) ─▶ pda-scan.js emit(code,'broadcast')
                                        │  ├─ PdaScan.on(fn) 订阅者
                                        │  └─ input[data-scan-input] 聚焦回车(键盘模式)

扫描头拍照 ─▶ 广播 android.bld.scan.action.SAVE_IMAGE(enable) 打开
           ─▶ 广播 android.bld.scan.action.SEND_IMAGE {BitmapBytes}
                                        │ 压缩 JPEG(≤1280px/q72) + 存设备
                                        ▼
       H5: window.PdaPhotoFeed(dataUrl,meta) ─▶ PdaPhoto.on(fn) / 'pdaPhoto' 事件
                                        │ 提交时:POST /app/photos → 得到 /uploads/xxx.jpg
                                        ▼
                     POST /web/docs/{doc_no}/attachments {kind:'照片', ref:url}
```

---

## 四、代码落点

| 位置 | 作用 |
|---|---|
| `pda-app/app/src/main/java/com/jianyu/pda/MainActivity.java` | WebView 壳：`ScanManager` 初始化(OP=0/连续扫)、扫码广播、拍照广播、JS 注入、原生桥 `AndroidShell` |
| `pda-app/app/libs/ScanManager_V202508251650.jar` | 扫描头 SDK（已放入；换版本替换此文件即可） |
| `pda-app/app/src/main/res/values/strings.xml` → `h5_url` | 后端 H5 地址（也可用 `adb -e url` 覆盖） |
| `prototype/mobile-app/pda-scan.js` | H5 统一桥：`PdaScan`（扫码）+ **`PdaPhoto`（照片）**，键盘楔/广播双通道 |
| `prototype/mobile-app/api-client.js` | `uploadPhoto` / `addAttachment` / `warehouses` / `locations` / `createShip` / `createPd` 等 |
| `prototype/mobile-app/screens/scan.html` | 业务类型选择、行数量步进、**真提交建单**（显示真实单号）、照片条+放大预览 |
| `prototype/mobile-app/screens/checklist.html` | 接 `PdaScan`：扫物料码自动定位到"待确认的第一行"，无需点按钮 |
| `prototype/mobile-app/screens/register.html` | 扫码交接码 → 逐个查码 → 行容器(可调数量) → 真提交建单 |
| `backend/app/routers/app_scan.py` | **扫码解析**：`POST /app/scan`（写扫码日志）+ `GET /app/lookup`（只查码），支持 **DOC 单据码 / SB 物料码 / LOC 库位码** 三类 |
| `backend/app/routers/app_.py` | 登录/待办/清单/提交/补传（≤300 行，扫码解析已拆出） |
| `backend/app/routers/photos.py` | **新增** `POST /api/v1/app/photos`：JSON base64 → 落盘 `uploads/` → 返回 `/uploads/xxx.jpg` |
| `backend/app/main.py` | 挂载 `/uploads` 静态目录；注册 photos / app_scan 路由（`/api/v1/app`） |
| `backend/docker-compose.yml` | api 容器新增可写卷 `./uploads:/srv/uploads` + `WMS_UPLOAD_DIR` |

---

## 五、拍照回传（SAVE_IMAGE / SEND_IMAGE）

1. 壳 `onResume` 发 `android.bld.scan.action.SAVE_IMAGE`（extra `enable=true`）打开拍照回传；`onPause` 关闭。
2. 设备回传 `android.bld.scan.action.SEND_IMAGE`，extra `BitmapBytes`(byte[])。
3. 壳：解码 → 压到长边 ≤1280、JPEG q72 → 存 `getExternalFilesDir("photos")` → 生成 `data:image/jpeg;base64,...`。
4. 注入 H5 `window.PdaPhotoFeed(dataUrl,{name,size})`；H5 存进 `photos[]`，页面显示缩略图与计数。
5. 提交后：H5 `queuePhotos(doc_no)` 逐张 `POST /app/photos`（data_url）→ 后端落盘返回 URL → `POST /web/docs/{doc_no}/attachments`（kind=照片, ref=URL）挂到单据。
6. **进度与重试**：每张照片状态 `待传/上传中/已传/失败(重N)`；失败按 2^n 秒退避自动重试至 3 次，仍失败可点缩略图「重试」；照片条显示"已传 x/总 y"。
7. **断网补传**：未传成功的照片存 `localStorage`（`wms_photo_q_v1`，最多 6 张），联网或下次提交自动补传；不阻断扫码/提交主流程（`AppApi.submit` 亦有离线队列）。

> 后端不引 multipart 依赖（沿用附件"只记引用"口径）：`/app/photos` 只把照片存到 `uploads/` 并给出 URL，业务库仍只存引用。

---

## 六、扫什么码 → 什么效果（现场对照表）

| 扫的码 | 后端识别(`kind`) | APP 里的效果 |
|---|---|---|
| **单据码**（单号/单据二维码，如 `RK000090`） | `DOC` | 自动填入「关联单据」框，列表提示"单据 RK000090（RK POSTED）"；可继续扫物料码把料挂到该单 |
| **物料条码**（单件码 `SBxxx` / 物料编码） | `SB` | 列表新增一行：物料名·批次，可 −/+ 调数量；提交时按此建单 |
| **库位码**（`WH-A-01` / 库区二维码） | `LOC` | 自动定位当前库位（后续物料行都记这个库位） |
| 都不匹配 | 404 | 提示"无效码"，不入单 |

> 识别顺序：**单据 → 物料 → 库位**。单据码扫描不写物料扫码日志（它不是物料码）。

## 七、联调步骤

1. 手机与 PC 同网段；后端已起（`http://<PC-IP>:8080`）。
2. Android Studio 打开 `pda-app`，改 `strings.xml` 的 `h5_url`（默认已配 `http://10.8.0.12:8080/proto/mobile-app/screens/home.html`）后 Run；或 adb：
   `adb shell am start -n com.jianyu.pda/.MainActivity -e url "http://10.8.0.12:8080/proto/mobile-app/screens/home.html"`
3. `screens/scan.html` 按扫描键 → 出现条码（Toast 回显）；带拍照的机型 → 照片条出现缩略图。
4. 提交 → 单据生成（页面显示真实单号），后端 `doc_attachment` 出现 kind=照片 的记录，`/uploads/xxx.jpg` 可访问。
5. 日志过滤：`adb logcat -s PdaShell`。

### 已验证（真机栈 HTTP 全链，2026-10-22）
| 环节 | 结果 |
|---|---|
| `/app/login` → PDA 设备令牌 | 200，device=PDA-03 |
| `/app/lookup` 扫物料码 | 200，`{material, batch, name, unit}` |
| `/app/lookup` 扫单据码 | 200，`{kind:DOC, doc_no, doc_type, biz_status}` |
| `/app/submit` 仅给条码 | 200 → 真实建单 `RK0000xx`，`biz_status=POSTED` |
| 过账后库存流水 | `stock_ledger` 落 `dir=1 / qty / device=PDA-03` |
| 扫码日志挂单 | `scan_log.doc_no` = 建出的单号 |
| `/app/photos` → `/uploads/*.png` | 200 + 静态可访问 |
| 挂附件 → 列附件 | 200，`doc_attachment` 有 kind=照片 记录 |
| `/app/checklists` → 确认 | 200；未勾选 400、有差异无原因 400（差异口径已按数量比对） |
| `pytest backend/tests` | 52 passed, 2 skipped |

> ⚠️ **硬件扫描枪本身尚未在真机验证**（本机无 adb 设备）。代码链路按厂商文档实现，装机后若扫不出码，看 `adb logcat -s PdaShell`。

## 八、可扩展（按需极少改）
- **连续扫描**：`setContinueScan(true/false)`；**码制开关**：`DecoderConfigValues.ParamID.*` + `setSYMValueInts`；**灯光**：`LIGHTS_MODE`。
- **输出模式**：`setOPMode(0广播/1输入框/2键盘/3单次输入/4剪贴板)`。
- **H5 主动开扫**：`window.AndroidShell.startScan()/stopScan()/photoEnabled(false)`。

## 九、FAQ
- **无反应**：核对 `setOPMode(0)`、`openScanner()+startDecode()`、设备扫描服务动作与 `SCAN_ACTION` 一致。
- **扫出码但页面没反应**：确认 H5 已引入 `pda-scan.js`（`scan/checklist/register` 三页均已引）；壳侧看 `PdaShell` 日志是否打印 `load url=`。
- **登录后还是"未登录/离线"**：后端响应是 `{code,msg,data,total}`（无 `ok` 字段），`api-client.js` 已统一补 `ok`；若仍异常，检查 `localStorage.wms_app_token` 与 `/app/login` 是否成功。
- **提交提示"资料不全已暂存"**：`lines` 缺物料/数量/单位。现场用扫码行即可（缺数量按 1 件计）；手工拼的 payload 需带 `material_code`。
- **照片不出**：确认 `SAVE_IMAGE` 已发（`onResume`）、设备机型是否支持随扫拍照、`BitmapBytes` 非空；`adb logcat -s PdaShell` 看 `photo handle fail`。
- **照片 403**：上传需 PDA 设备令牌（`/app/login` 签发 device=PDA-03）。
- **照片挂不上单据**：先有 `doc_no`（`/app/submit` 返回），再 `POST /web/docs/{doc_no}/attachments`。
- **盘点/调仓页 403**：建盘点任务需「确认」权限，普通 PDA 账号没有；这两页目前仍是演示态（见下）。
- **页面白屏**：同网段 / CORS（`WMS_CORS_ORIGINS`）/ `usesCleartextTraffic`（已内置）。

## 十、已知未完成
- `screens/stocktake.html`、`screens/transfer.html` 仍是**演示态**（未接 `/web/pd_tasks`、`/web/transfer_ships`），且建盘点需「确认」权限；列为 P1。

## 十一、变更清单
- 新增 `pda-app/`（WebView 壳工程 + 扫描 jar + 拍照链路）。
- 新增 `backend/app/routers/photos.py`（照片上传）、`backend/app/routers/app_scan.py`（扫码解析，支持 DOC/SB/LOC）。
- `main.py` 挂 `/uploads` + 注册新路由；compose 增可写卷与 `WMS_UPLOAD_DIR`。
- `prototype/mobile-app/pda-scan.js`（`PdaPhoto` 通道）、`api-client.js`（补 `ok` 字段 + 照片/主档/盘点/调仓方法）、`screens/scan.html`（重写：业务类型/数量/真提交/照片放大）、`screens/checklist.html`（接 PdaScan）、`screens/register.html`（真提交）。
- 本文档。
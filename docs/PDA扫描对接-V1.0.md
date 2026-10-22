# PDA 扫描对接方案 · V1.1

> 面向：移动端/客户端开发、交付、现场联调
> 结论：**PDA 端打包为 APK（`pda-app` WebView 壳 + 厂商 `ScanManager` 广播），只做扫码（一维码 / 二维码），扫码→查码→建单全链已打通。**
> 起步件：`pda-app/`（Android Studio 直接 Open 构建）

---

## 一、现状与两套 SDK

PDA 端现状是 PWA（`prototype/mobile-app/manifest.json`，`display: standalone`），**PWA 拿不到原生广播、不能调扫描 SDK**，所以必须打包成 APK 才能吃到扫描头能力。

厂商开发包给了**两套 API**，务必分清：

| 套件 | 入口 | 条码广播字段 | 说明 |
|---|---|---|---|
| 新版（`lc\5,扫描2.0\…\ScanManager_V202508251650.jar`） | `android.bld.ScanManager` | `scan.rcv.message` → `barcodeData`(String) + `length` + `barcodeType` | 5 种输出模式、连续扫描、码制开关（`enableSYM1D/2D`） |
| 旧版（`参考\…扫描开发包(12.04)`） | `android.bld.ScanManager`（同 jar 家族） | `scan.rcv.message` → `barocode`(byte[]) + `length` + `barocodeType` | 需按 length 截断再 UTF-8 解码 |

> 两者广播 action 相同、**字段名不同**；壳按 **`barcodeData` → `barocode`(按 length) → `barcode`/`data`** 顺序依次兼容。

---

## 二、路线选型

| 方案 | 做法 | 改动量 | 能力 | 结论 |
|---|---|---|---|---|
| A 输入框/键盘模式 | 设备设"输入框/键盘模式"，扫码=按键+回车进聚焦框；H5 用 `input[data-scan-input]` 回收 | 零原生代码 | 依赖焦点、编码，不能控扫描开关 | 兜底 |
| **B WebView 壳 + ScanManager 广播** | 原生壳内嵌 WebView 载 H5；`setOPMode(0)` 广播→`evaluateJavascript("PdaScanFeed(..)")` | 一个 Activity（一次性构建） | 稳定、可控扫描开关、**一维/二维码全开** | ✅ **采用** |
| C uni-app + 原生插件 | `scan.vue` 那套 `ScanDevice`/jar 做 uni 插件 | 需把移动页面重写为 uni-app | 原生、跨端 | 仅当整体迁 uni-app 才选 |

---

## 三、对接链路（纯扫码）

```
扫描头(硬件按键) ─▶ 厂商扫描服务 ─▶ 广播 scan.rcv.message
                                        │  新版 barcodeData / 旧版 barocode+length
                            MainActivity.BroadcastReceiver → parseScan()
                                        │ evaluateJavascript
                                        ▼
       H5: window.PdaScanFeed(code, typeId) ─▶ pda-scan.js emit(code,'broadcast',type)
                                        │  ├─ PdaScan.on(fn) 订阅者: fn(code, source, typeId)
                                        │  └─ input[data-scan-input] 聚焦回车(键盘模式兜底)
                                        ▼
                    查码 /app/lookup → DOC 单据码 / SB 物料码 / LOC 库位码 → 建单 /app/submit
```

**码制**：壳显式 `enableSYM1D(true)` + `enableSYM2D(true)`（全部一维码 + 全部二维码），`typeId` 透传给 H5（`PdaScan.symName()` 可转中文名）。

```

---

## 四、代码落点

| 位置 | 作用 |
|---|---|
| `pda-app/app/src/main/java/com/jianyu/pda/MainActivity.java` | WebView 壳：`ScanManager` 初始化(OP=0/连续扫/**一维+二维码全开**)、扫码广播解析(`parseScan` 兼容两套字段)、JS 注入、原生桥 `AndroidShell` |
| `pda-app/app/libs/ScanManager_V202508251650.jar` | 扫描头 SDK（已放入；换版本替换此文件即可） |
| `pda-app/app/src/main/res/values/strings.xml` → `h5_url` | 后端 H5 地址（也可用 `adb -e url` 覆盖） |
| `prototype/mobile-app/pda-scan.js` | H5 统一桥：`PdaScan`（扫码），键盘楔/广播双通道，回调带 `code, source, typeId` |
| `prototype/mobile-app/api-client.js` | `scan` / `lookup` / `submit` / `confirmChecklist` / `warehouses` / `locations` / `createShip` / `createPd` 等 |
| `prototype/mobile-app/screens/scan.html` | 业务类型选择、行数量步进、**真提交建单**（显示真实单号） |
| `prototype/mobile-app/screens/checklist.html` | 接 `PdaScan`：扫物料码自动定位到"待确认的第一行"，无需点按钮 |
| `prototype/mobile-app/screens/register.html` | 扫码交接码 → 逐个查码 → 行容器(可调数量) → 真提交建单 |
| `prototype/mobile-app/screens/stocktake.html` | **实物盘点 PD**：建任务 → 取账面行 → 扫物料码定位行 → 填实盘数 → 逐行确认 → 差异调账 |
| `prototype/mobile-app/screens/transfer.html` | **库存调仓 DB**：选源/目标仓与库位 → 扫物料码累加行 → 提交建单 → 列表接收实收 |
| `backend/app/routers/app_scan.py` | **扫码解析**：`POST /app/scan`（写扫码日志）+ `GET /app/lookup`（只查码），支持 **DOC 单据码 / SB 物料码 / LOC 库位码** 三类 |
| `backend/app/routers/app_ops.py` | **PDA 现场作业**：`/app/pd_tasks`（盘点）与 `/app/transfer_ships`（调仓），PDA 设备令牌 + 功能权限双校验 |
| `backend/app/routers/app_.py` | 登录/待办/清单/提交/补传（≤300 行，扫码解析已拆出） |
| `backend/app/main.py` | 注册 app_scan / app_ops 路由（`/api/v1/app`） |

---

## 五、扫什么码 → 什么效果（现场对照表）

| 扫的码 | 后端识别(`kind`) | APP 里的效果 |
|---|---|---|
| **单据码**（单号/单据二维码，如 `RK000090`） | `DOC` | 自动填入「关联单据」框，列表提示"单据 RK000090（RK POSTED）"；可继续扫物料码把料挂到该单 |
| **物料条码**（单件码 `SBxxx` / 物料编码） | `SB` | 列表新增一行：物料名·批次，可 −/+ 调数量；提交时按此建单 |
| **库位码**（`WH-A-01` / 库区二维码） | `LOC` | 自动定位当前库位（后续物料行都记这个库位） |
| 都不匹配 | 404 | 提示"无效码"，不入单 |

> 识别顺序：**单据 → 物料 → 库位**。单据码扫描不写物料扫码日志（它不是物料码）。

## 六、联调步骤

1. 手机与 PC 同网段；后端已起（`http://<PC-IP>:8080`）。
2. Android Studio 打开 `pda-app`，改 `strings.xml` 的 `h5_url`（默认已配 `http://10.8.0.12:8080/proto/mobile-app/screens/home.html`）后 Run；或 adb：
   `adb shell am start -n com.jianyu.pda/.MainActivity -e url "http://10.8.0.12:8080/proto/mobile-app/screens/home.html"`
3. `screens/scan.html` 按扫描键 → 出现条码（Toast 回显），列表新增一行。
4. 提交 → 单据生成，页面显示真实单号（如 `RK000116 POSTED`）。
5. 日志过滤：`adb logcat -s PdaShell`（会打印 `scan: code=xxx type=QR/Code128/...`）。

### 已验证（真机栈 HTTP 全链，2026-10-22）
| 环节 | 结果 |
|---|---|
| `/app/login` → PDA 设备令牌 | 200，device=PDA-03 |
| `/app/lookup` 扫物料码 | 200，`{material, batch, name, unit}` |
| `/app/lookup` 扫单据码 | 200，`{kind:DOC, doc_no, doc_type, biz_status}` |
| `/app/submit` 仅给条码 | 200 → 真实建单 `RK000116`，`biz_status=POSTED` |
| 过账后库存流水 | `stock_ledger` 落 `dir=1 / qty / device=PDA-03` |
| 扫码日志挂单 | `scan_log.doc_no` = 建出的单号 |
| `/app/checklists` → 确认 | 200；未勾选 400、有差异无原因 400 |
| `/app/pd_tasks` 建/取行/确认/调账 | 200，调账生成 `TZ` 单并 `POSTED` |
| `/app/transfer_ships` 建单/列表/实收 | 200，差异转「待复核」 |
| `pytest backend/tests` | 52 passed, 2 skipped |

> ⚠️ **硬件扫描枪本身尚未在真机验证**（本机无 adb 设备）。代码链路按厂商 Demo 源码实现，装机后若扫不出码，看 `adb logcat -s PdaShell`。

---

## 八、可扩展（按需极少改）
- **连续扫描**：`setContinueScan(true/false)`；**码制开关**：`DecoderConfigValues.ParamID.*` + `setSYMValueInts`；**灯光**：`LIGHTS_MODE`。
- **输出模式**：`setOPMode(0广播/1输入框/2键盘/3单次输入/4剪贴板)`。
- **H5 主动开扫**：`window.AndroidShell.startScan()/stopScan()/enableSymbologies(true)`。

## 九、FAQ
- **无反应**：核对 `setOPMode(0)`、`openScanner()+startDecode()`、设备扫描服务动作与 `SCAN_ACTION` 一致。
- **扫出码但页面没反应**：确认 H5 已引入 `pda-scan.js`（`scan/checklist/register` 三页均已引）；壳侧看 `PdaShell` 日志是否打印 `load url=`。
- **登录后还是"未登录/离线"**：后端响应是 `{code,msg,data,total}`（无 `ok` 字段），`api-client.js` 已统一补 `ok`；若仍异常，检查 `localStorage.wms_app_token` 与 `/app/login` 是否成功。
- **提交提示"资料不全已暂存"**：`lines` 缺物料/数量/单位。现场用扫码行即可（缺数量按 1 件计）；手工拼的 payload 需带 `material_code`。
- **扫出来是乱码**：旧版 SDK 的 `barocode` 是字节数组，壳按 `length` 截断后按 UTF-8 解码；若厂商用的是 GBK，改 `MainActivity.parseScan()` 里的字符集。
- **某个码制扫不出**：壳已 `enableSYM1D(true)+enableSYM2D(true)`；仍扫不出用 `scan.setSYMValueInts(DecoderConfigValues.ParamID.*, ...)` 单独开该码制，或在设备「扫描设置」里启用。
- **扫到码但页面不跳转**：确认该页已引 `../pda-scan.js`；壳日志应出现 `scan: code=...`。
- **盘点/调仓页 403**：建盘点任务需「确认」权限，普通 PDA 账号没有；这两页目前仍是演示态（见下）。
- **页面白屏**：同网段 / CORS（`WMS_CORS_ORIGINS`）/ `usesCleartextTraffic`（已内置）。

## 十、已知未完成
- 硬件扫描枪本身未在真机验证（本机无 adb 设备），代码链路按厂商文档实现。

## 十一、现场作业权限（PDA 角色）

新增角色 **`R-PDA`「PDA现场作业员」**（`查看,录入,确认`，数据范围 `*`），已挂给 `ws`/`mat`/`demo`：
- `/app/*` 是 PDA 专用入口，用 `/app/login` 签发的**设备令牌**（device=PDA-03）；但令牌仍带用户名，
  所以 PDA 作业接口除设备校验外，**还按角色校验功能权限**（盘点需「确认」，调仓建单需「录入」）。
- 仓库维度也校验：源仓不在用户 `data_scope` 内 → 403。
- 种子同步：`backend/sql/seeds/seed_demo.sql` 已加 `R-PDA` 角色与账号关联（重灌安全）。

### 盘点 PD 流程
```
建任务(选仓库) → 抓账面行 → 扫物料码定位行 → 填实盘数 → 确认本行(逐行)
   → 全部确认后「差异调账」→ 生成 TZ 调整单并过账（盘盈增账 / 盘亏减账）
```
盘点本身**不动账**，只有差异调账才动（与 PC 端口径一致）。

### 调仓 DB 流程
```
选源仓/目标仓 + 库位 → 扫物料码累加行与数量 → 提交建单(多物料拆多张 DB 单)
   → 列表里填实收数「接收」→ 差异转「待复核」
```
调仓是**在途申请单**（源仓减/在途增为业务口径），实收差异由复核环节处理。

## 十二、变更清单
- 新增 `pda-app/`（WebView 壳工程 + 扫描 jar，纯扫码：一维/二维码）。
- 新增 `backend/app/routers/app_scan.py`（扫码解析，支持 DOC/SB/LOC）、`backend/app/routers/app_ops.py`（PDA 盘点/调仓）。
- 新增角色 `R-PDA`「PDA现场作业员」；`seed_demo.sql` 同步。
- `main.py` 注册 app_scan / app_ops 路由。
- `prototype/mobile-app/pda-scan.js`（统一扫码桥，回调带 `code, source, typeId`）、`api-client.js`（补 `ok` 字段 + 盘点/调仓方法走 `/app/*`）、`screens/scan.html`（重写：业务类型/数量/真提交）、`screens/checklist.html`（接 PdaScan，去相机）、`screens/register.html`（真提交）、`screens/stocktake.html`（真盘点）、`screens/transfer.html`（真调仓）。
- **V1.1 收敛为纯扫码**：删除拍照回传（原生壳 `SAVE_IMAGE/SEND_IMAGE`、前端 `PdaPhoto`、后端 `photos.py` 与 `/uploads` 静态目录、compose 可写卷）；`checklist.html` 去掉 html5-qrcode 相机扫码，统一走硬件扫描头 + 手动输入兜底。
- `backend/tests/test_idem.py`：幂等键改用随机键（原固定键在真库重跑会命中 `idem_log` 历史记录导致断言失败）。
- 本文档。
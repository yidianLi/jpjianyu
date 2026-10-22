# PDA 扫描对接方案 · V1.0

> 面向：移动端/客户端开发、交付、现场联调
> 结论先给：**采用 B 方案——Android WebView 壳 + 厂商 `ScanManager` 广播模式，回填给现有 H5（`pda-scan.js`）**。
> 起步件：`pda-app/`（可直接用 Android Studio 打开构建）

---

## 一、现状与两套 SDK

我们的 PDA 现场作业端是 **H5**（`prototype/mobile-app`），后端走 `/app` 接口（设备白名单 PDA-03/04）。

厂商开发包实际给了**两套 API**，务必分清：

| 套件 | 入口 | 条码广播字段 | 说明 |
|---|---|---|---|
| 新版（`lc\5,扫描2.0\…\ScanManager_V202508251650.jar`） | `android.bld.ScanManager` | `scan.rcv.message` → `barcodeData`(String) | 能力最全：5 种输出模式、连续扫描、码制开关、拍照回传 |
| 旧版/系统类（`参考\…\扫描开发包(12.04)`、`uniapp-扫描/scan.vue`） | `android.device.ScanDevice`（`plus.android`） | `scan.rcv.message` → `barocode`(byte[], UTF-8) | uni-app 用反射直调，无需 jar |

> 两者广播 action 相同、**字段名不同**；壳已同时兼容。

---

## 二、三条路线对比与选型

| 方案 | 做法 | 改动量 | 能力 | 结论 |
|---|---|---|---|---|
| A 输入框/键盘模式 | 设备设"输入框/键盘模式"，扫码=按键+回车进聚焦框；H5 用 `input[data-scan-input]` 回收 | 零原生代码 | 依赖焦点、编码，不能控扫描开关/拍照 | 快速试点 / 兜底 |
| **B WebView 壳 + ScanManager 广播** | 原生壳内嵌 WebView 载 H5；`setOPMode(0)` 广播→`evaluateJavascript("PdaScanFeed(..)")` | 一个 Activity（一次性构建），**H5 零改动** | 全能力：开关/连续/码制/拍照 | ✅ **推荐** |
| C uni-app + 原生插件 | `scan.vue` 那套 `ScanDevice`/jar 做 uni 插件 | **需把移动页面重写为 uni-app** | 原生、跨端 | 仅当整体迁 uni-app 才选 |

**选 B 的理由**：保留全部已写好的 H5 页面与 `pda-scan.js` 桥；原生只做"接收广播并回填"这一件事，最稳、最少维护、能力最全。

---

## 三、B 方案对接链路

```
扫描头(硬件按键/触发)
   └─(厂商扫描服务)─▶ 广播 scan.rcv.message {barcodeData | barocode}
                          │
                 MainActivity.BroadcastReceiver
                          │  webView.evaluateJavascript(...)
                          ▼
   H5: window.PdaScanFeed(code)  ──▶  pda-scan.js emit(code,'broadcast')
                          │
              ┌───────────┴───────────┐
        PdaScan.on(fn) 订阅者      页面 input[data-scan-input]
        (scan/transfer/stocktake…)  聚焦回车亦可用(键盘模式/兜底)
```

- H5 桥已在：`prototype/mobile-app/pda-scan.js` 暴露 `PdaScan.on / bind / emit` 与 `window.PdaScanFeed`。
- 壳注入逻辑见 `pda-app/app/src/main/java/com/jianyu/pda/MainActivity.java`：
  `injectScan()` 依次尝试 `PdaScanFeed → pdaScan 事件 → 聚焦输入框`，保证任何页面都能收到。

---

## 四、代码落点

| 位置 | 作用 |
|---|---|
| `pda-app/app/src/main/java/com/jianyu/pda/MainActivity.java` | WebView 壳 + `ScanManager` 初始化 + 广播接收 + JS 注入 + 可选原生桥 `AndroidShell` |
| `pda-app/app/libs/ScanManager_V202508251650.jar` | 扫描头 SDK（已放入；换版本替换此文件即可） |
| `pda-app/app/src/main/res/values/strings.xml` → `h5_url` | 后端 H5 地址（也可 `adb -e url` 覆盖） |
| `pda-app/README.md` | 构建与联调速查 |
| `prototype/mobile-app/pda-scan.js` | 已就绪的 H5 桥（无需改） |

---

## 五、联调步骤

1. 手机与 PC 同网段；后端已起（`http://<PC-IP>:8080`）。
2. Android Studio 打开 `pda-app`，把 `strings.xml` 的 `h5_url` 改成你的 H5 地址后 Run；或 adb：
   `adb shell am start -n com.jianyu.pda/.MainActivity -e url "http://<PC-IP>:8080/proto/mobile-app/screens/home.html"`
3. 打开 `screens/scan.html`，按扫描键扫一张条码 → 页面应出现该码（Toast 也会回显）。
4. 观察日志（TAG `PdaShell` / `PdaShell/console`）确认广播到达与注入执行。

---

## 六、可扩展（按需极少改）
- **连续扫描**：已 `setContinueScan(true)`；关闭改 false。
- **拍照回传**：发 `android.bld.scan.action.SAVE_IMAGE` 打开、接收 `SEND_IMAGE` 的 `BitmapBytes`（参考 `Demo MainActivity`）。
- **码制开关**：`DecoderConfigValues.ParamID.*` + `setSYMValueInts(ids,vals)` / `enableAllSYM(bool)`。
- **输出模式**：`setOPMode(0广播/1输入框/2键盘/3单次输入/4剪贴板)`。

## 七、FAQ
- **无反应**：核对 `setOPMode(0)`、`openScanner()+startDecode()`、`SCAN_ACTION` 与设备扫描服务动作一致。
- **乱码**：旧版走 `barocode` byte[] 时按 UTF-8 解码（已内置）；若厂商自定义编码，调 `handleScanIntent` 解码处。
- **页面白屏**：同网段 / CORS（`WMS_CORS_ORIGINS`）/ `usesCleartextTraffic`（已内置）。
- **想走 A 试点**：`setOPMode(1/2)` + H5 `input[data-scan-input]` 聚焦即用，零广播。

## 八、变更清单
- 新增 `pda-app/`（WebView 壳工程 + 扫描 jar）。
- 复用 `prototype/mobile-app/pda-scan.js`（未改动）。
- 本文档。
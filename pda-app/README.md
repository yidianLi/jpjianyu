# 简普 WMS · PDA 壳（WebView + 扫描头）

用一台 Android WebView 壳加载现有的 H5 现场作业页（`prototype/mobile-app`），
通过厂商扫描头 SDK（`ScanManager`，广播模式）把扫到的一维码/二维码回填给 H5。
H5 端**无需改动**：`prototype/mobile-app/pda-scan.js` 已暴露 `window.PdaScanFeed(code, typeId)`。

> **只做扫码**：本壳聚焦"扫描头→H5"这一件事，不处理拍照/相机。码制显式开启全部一维码 + 全部二维码。

## 目录
```
pda-app/
├─ app/
│  ├─ libs/ScanManager_V202508251650.jar   ← 扫描头 SDK(已放入)
│  ├─ build.gradle
│  └─ src/main/
│     ├─ AndroidManifest.xml
│     ├─ java/com/jianyu/pda/MainActivity.java  ← 壳 + 广播解析 + JS 注入
│     └─ res/values/strings.xml                 ← h5_url 后端地址
├─ settings.gradle / build.gradle / gradle.properties
└─ gradle/wrapper/gradle-wrapper.properties
```

## 关键流程
1. `ScanManager.getDefaultInstance(this)` → `setOPMode(0)`（广播模式）→ `setContinueScan(true)` → `enableSYM1D(true)+enableSYM2D(true)`（一维+二维码全开）→ `openScanner()` → `startDecode()`。
2. 注册广播 `scan.rcv.message`；`parseScan()` 按 **`barcodeData`(新版 String) → `barocode`(旧版 byte[]，按 `length` 截断 UTF-8) → `barcode`/`data`** 顺序兼容取码，并取 `barcodeType`/`barocodeType` 码制 ID。
3. `webView.evaluateJavascript("... window.PdaScanFeed('<code>', <typeId>) ...")` 回填 H5；
   H5 无 `PdaScanFeed` 时退化为派发 `pdaScan` 事件 / 写入聚焦输入框。

## 配置后端地址（二选一）
- 改 `app/src/main/res/values/strings.xml` 的 `h5_url`（默认已配 `http://10.8.0.12:8080/proto/mobile-app/screens/home.html`，按现场后端地址改）。
- 或运行时用 adb 启动参数覆盖（联调最方便，需在 Application 读 KEY；本壳已支持 `-e url`）：
  `adb shell am start -n com.jianyu.pda/.MainActivity -e url "http://<PC-IP>:8080/proto/mobile-app/screens/home.html"`

## 构建
- **本机已配好（D 盘）现成命令**：
  ```
  powershell -ExecutionPolicy Bypass -File pda-app\build.ps1 release
  ```
  脚本自动设好 `JAVA_HOME=D:\Android\jdk17`、`ANDROID_HOME=D:\Android\Sdk`、`Gradle=D:\Android\gradle-8.2`，产物复制到 `output\apk\JianyuPDA-v1.0-release.apk`。
- **Android Studio**：直接 Open 本目录，Gradle 同步后 Run。
- **命令行手动**：
  ```
  cd pda-app
  $env:JAVA_HOME="D:\Android\jdk17"; $env:ANDROID_HOME="D:\Android\Sdk"
  D:\Android\gradle-8.2\gradle-8.2\bin\gradle.bat assembleRelease
  ```
- 产物：`app/build/outputs/apk/{debug,release}/app-*.apk`（已生成 `JianyuPDA-v1.0-release.apk` / `-debug.apk` 归档在 `output/apk/`）。
- **发布签名**：`keystore.properties`（不入库）指向 `D:\jianyu-keys\jianyu-pda.jks`；缺失则 release 出未签名包。

## 与 H5 对接（已有）
- 页面里 `input[data-scan-input]`：键盘/输入框模式聚焦即可回收（回车触发）。
- 广播模式：壳调用 `window.PdaScanFeed(code)`，`pda-scan.js` 统一 `emit`，所有 `PdaScan.on(...)` 订阅者收。
- 可选原生桥：`window.AndroidShell.startScan() / stopScan() / isPda() / device() / enableSymbologies(bool)`。
- 回调签名：`PdaScan.on(function(code, source, typeId){})`，`source` = `broadcast`(硬件扫描) / `wedge`(键盘回车) / `manual`；`typeId` = 码制 ID（`PdaScan.symName(typeId)` 转名称，3=Code128 4=Code39 10=EAN13 17=QR 19=UPC-A …）。

## 广播字段兼容（按厂商 Demo 源码核对）
| SDK | 广播 action | 条码字段 | 码制字段 |
|---|---|---|---|
| 新版(`lc\5,扫描2.0` Demo) | `scan.rcv.message` | `barcodeData`(String) + `length`(int) | `barcodeType`(byte) |
| 旧版(12.04 Demo) | `scan.rcv.message` | `barocode`(byte[]) + `length`(int) | `barocodeType`(byte) |

壳按 `barcodeData` → `barocode`(按 length 截断) → `barcode`/`data` 顺序依次兼容。若你的设备广播 action 不是 `scan.rcv.message`，改 `MainActivity.SCAN_ACTION` 一处即可。

## 常见问题
- **扫码无反应**：确认 `setOPMode(0)`、已 `openScanner()+startDecode()`；确认设备系统设置的扫描服务动作是 `scan.rcv.message`。
- **某个码制扫不出**：壳已 `enableSYM1D(true)+enableSYM2D(true)` 全开；仍不行用 `scan.setSYMValueInts(DecoderConfigValues.ParamID.*, ...)` 单独开，或在设备「扫描设置」里启用。
- **中文/乱码**：走 `barocode` 字节数组时按 UTF-8 解码（已内置）；厂商若用 GBK，改 `parseScan()` 的字符集。
- **页面刷不出**：手机与 PC 同网段、后端允许该 `Origin`（`WMS_CORS_ORIGINS`）、`usesCleartextTraffic=true`（已内置）。
- **想用输入框模式**：把 `setOPMode(0)` 改 `1`/`2`，H5 聚焦 `[data-scan-input]` 即可（无需广播）。
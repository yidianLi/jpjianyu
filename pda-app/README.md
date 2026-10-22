# 简普 WMS · PDA 壳（WebView + 扫描头）

用一台 Android WebView 壳加载现有的 H5 现场作业页（`prototype/mobile-app`），
通过厂商扫描头 SDK（`ScanManager`，广播模式）把扫到的条码回填给 H5。
H5 端**无需改动**：`prototype/mobile-app/pda-scan.js` 已暴露 `window.PdaScanFeed(code)`。

## 目录
```
pda-app/
├─ app/
│  ├─ libs/ScanManager_V202508251650.jar   ← 扫描头 SDK(已放入)
│  ├─ build.gradle
│  └─ src/main/
│     ├─ AndroidManifest.xml
│     ├─ java/com/jianyu/pda/MainActivity.java  ← 壳 + 广播接收 + JS 注入
│     └─ res/values/strings.xml                 ← h5_url 后端地址
├─ settings.gradle / build.gradle / gradle.properties
└─ gradle/wrapper/gradle-wrapper.properties
```

## 关键流程
1. `ScanManager.getDefaultInstance(this)` → `setOPMode(0)`（广播模式）→ `setContinueScan(true)` → `openScanner()` → `startDecode()`。
2. 注册广播 `scan.rcv.message`；收到后取 `barcodeData`(新版 String) 或 `barocode`(旧版 byte[])。
3. `webView.evaluateJavascript("... window.PdaScanFeed('<code>') ...")` 回填 H5；
   H5 无 `PdaScanFeed` 时退化为派发 `pdaScan` 事件 / 写入聚焦输入框。

## 配置后端地址（二选一）
- 改 `app/src/main/res/values/strings.xml` 的 `h5_url`（默认占位 `http://192.168.1.10:8080/proto/mobile-app/screens/home.html`）。
- 或运行时用 adb 启动参数覆盖（联调最方便，需在 Application 读 KEY；本壳已支持 `-e url`）：
  `adb shell am start -n com.jianyu.pda/.MainActivity -e url "http://<PC-IP>:8080/proto/mobile-app/screens/home.html"`

## 构建
- **Android Studio**：直接 Open 本目录，Gradle 同步后 Run。
  （若缺 `gradle-wrapper.jar`，Studio 会提示生成，或执行 `gradle wrapper --gradle-version 8.2`。）
- **命令行**：`cd pda-app && gradle assembleDebug`（需本机有 Android SDK 与 Gradle 8.x）。
- 产物：`app/build/outputs/apk/debug/app-debug.apk`。

## 与 H5 对接（已有）
- 页面里 `input[data-scan-input]`：键盘/输入框模式聚焦即可回收（回车触发）。
- 广播模式：壳调用 `window.PdaScanFeed(code)`，`pda-scan.js` 统一 `emit`，所有 `PdaScan.on(...)` 订阅者收。
- 可选原生桥：`window.AndroidShell.startScan() / stopScan() / isPda() / device()`。

## 广播字段兼容
| SDK | 广播 action | 条码字段 |
|---|---|---|
| 新版(2025 jar，本工程) | `scan.rcv.message` | `barcodeData`（String） |
| 旧版/系统类 ScanDevice | `scan.rcv.message` | `barocode`（byte[]，UTF-8 解码） |

壳里两者都兼容。若你的设备广播 action 不是 `scan.rcv.message`，改 `MainActivity.SCAN_ACTION` 一处即可。

## 常见问题
- **扫码无反应**：确认 `setOPMode(0)`、已 `openScanner()+startDecode()`；确认设备系统设置的扫描服务动作是 `scan.rcv.message`。
- **中文/乱码**：确认走的是 `barocode` 字节数组时按 UTF-8 解码（已内置）。
- **页面刷不出**：手机与 PC 同网段、后端允许该 `Origin`（`WMS_CORS_ORIGINS`）、`usesCleartextTraffic=true`（已内置）。
- **想用输入框模式**：把 `setOPMode(0)` 改 `1`/`2`，H5 聚焦 `[data-scan-input]` 即可（无需广播）。
package com.jianyu.pda;

import android.app.Activity;
import android.bld.ScanManager;
import android.bld.scan.configuration.DecoderConfigValues;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.KeyEvent;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.nio.charset.StandardCharsets;

/**
 * WMS PDA 壳:WebView 载 H5 现场作业 + 厂商扫描头(纯扫码:一维码/二维码).
 *
 * 扫描链路:
 *   扫描头 → 厂商扫描服务 → 广播 scan.rcv.message
 *     ├ 新版 SDK: extra "barcodeData"(String) + "length"(int) + "barcodeType"(byte)
 *     └ 旧版 SDK: extra "barocode"(byte[]) + "length"(int) + "barocodeType"(byte)
 *   → evaluateJavascript 调 window.PdaScanFeed(code, type)  (见 mobile-app/pda-scan.js)
 *
 * 码制: 显式开启全部一维码 + 全部二维码(enableSYM1D/2D),其余不特意裁剪,
 *       避免现场拿到别的码制扫不出。
 */
public class MainActivity extends Activity {
    private static final String TAG = "PdaShell";
    /** 厂商扫描服务广播 action(可用 ScanManager.setBroadcastAction 改,这里给默认) */
    private static final String SCAN_ACTION = "scan.rcv.message";
    public static final String EXTRA_URL = "url";

    /** 码制 ID(取自 DecoderConfigValues.SymbologyID),仅用于日志与前端展示 */
    private static final int SYM_CODE128 = 3;
    private static final int SYM_CODE39 = 4;
    private static final int SYM_EAN13 = 10;
    private static final int SYM_QR = 17;
    private static final int SYM_UPCA = 19;
    private static final int SYM_DATAMATRIX = 8;

    private WebView web;
    private ScanManager scan;

    private final BroadcastReceiver scanRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent it) {
            handleScanIntent(it);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        web = new WebView(this);
        setContentView(web);
        setupWeb();
        setupScanner();
        web.loadUrl(resolveUrl());
    }

    private String resolveUrl() {
        Intent it = getIntent();
        String u = it != null ? it.getStringExtra(EXTRA_URL) : null;
        if (TextUtils.isEmpty(u)) {
            u = getSharedPreferences("pda", MODE_PRIVATE).getString("h5_url", null);
        }
        if (TextUtils.isEmpty(u)) u = getString(R.string.h5_url);
        Log.i(TAG, "load url=" + u);
        return u;
    }

    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG + "/console", m.message());
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidShell");
    }

    /** 扫描头初始化:广播模式 + 连续扫描 + 开启一维/二维全部码制 */
    private void setupScanner() {
        try {
            scan = ScanManager.getDefaultInstance(this);
            scan.setOPMode(0);              // 0=广播模式(1输入框/2键盘/3单次输入/4剪贴板)
            scan.setContinueScan(true);     // 连续扫描,扫完不停
            scan.setDisableSameBarcode(false); // 同一码允许重复扫(现场可能同件复扫)
            scan.setHandleKey(false);       // 不接管按键,避免吞掉返回键
            enableSymbologies();
            scan.openScanner();
            scan.startDecode();
            Log.i(TAG, "scanner ready, api=" + scan.getAPIVer());
        } catch (Throwable e) {
            Log.e(TAG, "scan init fail", e);
        }
    }

    /** 显式开启所有一维码与所有二维码(现场一维/二维混用) */
    private void enableSymbologies() {
        try {
            scan.enableSYM1D(true);
            scan.enableSYM2D(true);
        } catch (Throwable e) {
            Log.w(TAG, "enableSYM1D/2D failed, fallback enableAllSYM", e);
            try { scan.enableAllSYM(true); } catch (Throwable ignore) { }
        }
    }

    /**
     * 解析扫描广播:两套 SDK 字段名不同,依次兼容.
     * 返回 [code, typeId];取不到内容返回 null.
     */
    private String[] parseScan(Intent it) {
        String code = null;
        int type = -1;
        // 新版 SDK: barcodeData(String)
        try { code = it.getStringExtra("barcodeData"); } catch (Throwable ignore) { }
        // 旧版 SDK: barocode(byte[]) + length
        if (TextUtils.isEmpty(code)) {
            try {
                byte[] raw = it.getByteArrayExtra("barocode");
                if (raw != null && raw.length > 0) {
                    int len = it.getIntExtra("length", raw.length);
                    if (len <= 0 || len > raw.length) len = raw.length;
                    code = new String(raw, 0, len, StandardCharsets.UTF_8);
                }
            } catch (Throwable ignore) { }
        }
        if (TextUtils.isEmpty(code)) {
            // 兜底: 有些机型把内容放在 "barcode" 或 "data"
            try { code = it.getStringExtra("barcode"); } catch (Throwable ignore) { }
            if (TextUtils.isEmpty(code)) {
                try { code = it.getStringExtra("data"); } catch (Throwable ignore) { }
            }
        }
        // 码制: 新版 "barcodeType" / 旧版 "barocodeType"
        try {
            byte t = it.getByteExtra("barcodeType", (byte) -1);
            type = t & 0xFF;
        } catch (Throwable ignore) { }
        if (type < 0) {
            try {
                byte t = it.getByteExtra("barocodeType", (byte) -1);
                type = t & 0xFF;
            } catch (Throwable ignore) { }
        }
        if (TextUtils.isEmpty(code)) return null;
        return new String[]{code.trim(), String.valueOf(type)};
    }

    private void handleScanIntent(Intent it) {
        String[] parsed = parseScan(it);
        if (parsed == null) return;
        String code = parsed[0];
        String type = parsed[1];
        if (TextUtils.isEmpty(code)) return;
        int typeId = -1;
        try { typeId = Integer.parseInt(type); } catch (Throwable ignore) { }
        Log.i(TAG, "scan: code=" + code + " type=" + symName(typeId));
        injectScan(code, typeId);
    }

    /** 码制 ID → 名称(仅日志用) */
    private static String symName(int id) {
        switch (id) {
            case SYM_CODE128: return "CODE128";
            case SYM_CODE39: return "CODE39";
            case SYM_EAN13: return "EAN13";
            case SYM_UPCA: return "UPCA";
            case SYM_QR: return "QR";
            case SYM_DATAMATRIX: return "DATAMATRIX";
            case 100: return "ALL";
            default: return id < 0 ? "-" : ("ID" + id);
        }
    }

    /** 注入 H5:window.PdaScanFeed(code, typeId);H5 无此函数时派发 pdaScan 事件 */
    private void injectScan(final String code, final int typeId) {
        String js = "(function(){var c=" + jsStr(code) + ";var t=" + typeId + ";"
                + "try{if(window.PdaScanFeed){window.PdaScanFeed(c,t);return;}}catch(e){}"
                + "try{document.dispatchEvent(new CustomEvent('pdaScan',"
                + "{detail:{code:c,type:t,source:'broadcast'}}));return;}catch(e){}"
                + "var el=document.activeElement;"
                + "if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')){el.value=c;}"
                + "})()";
        web.post(new Runnable() {
            @Override public void run() {
                web.evaluateJavascript(js, null);
                Toast.makeText(MainActivity.this, code, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static String jsStr(String s) {
        return "'" + String.valueOf(s).replace("\\", "\\\\").replace("'", "\\'")
                .replace("\n", "\\n").replace("\r", "\\r") + "'";
    }

    /** 供 H5 可选调用:window.AndroidShell.startScan() 等 */
    public class Bridge {
        @JavascriptInterface public void startScan() {
            try { if (scan != null) scan.startDecode(); } catch (Throwable e) { }
        }
        @JavascriptInterface public void stopScan() {
            try { if (scan != null) scan.stopDecode(); } catch (Throwable e) { }
        }
        @JavascriptInterface public boolean isPda() { return true; }
        @JavascriptInterface public String device() { return Build.MODEL; }
        /** 码制开关:1D/2D 都开(现场一维二维混用) */
        @JavascriptInterface public void enableSymbologies(boolean on) {
            try {
                if (scan != null) {
                    scan.enableSYM1D(on);
                    scan.enableSYM2D(on);
                }
            } catch (Throwable e) { }
        }
        @JavascriptInterface public void setUrl(String u) {
            if (!TextUtils.isEmpty(u)) {
                getSharedPreferences("pda", MODE_PRIVATE).edit().putString("h5_url", u).apply();
            }
        }
    }

    @Override protected void onResume() {
        super.onResume();
        IntentFilter f = new IntentFilter(SCAN_ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(scanRx, f, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(scanRx, f);
        }
        try {
            if (scan != null) {
                scan.openScanner();
                scan.startDecode();
            }
        } catch (Throwable e) {
            Log.w(TAG, "resume scan fail", e);
        }
    }

    @Override protected void onPause() {
        try { unregisterReceiver(scanRx); } catch (Throwable ignore) { }
        try { if (scan != null) scan.stopDecode(); } catch (Throwable ignore) { }
        super.onPause();
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, e);
    }
}

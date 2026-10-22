package com.jianyu.pda;

import android.app.Activity;
import android.bld.ScanManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
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
 * WMS PDA 壳:WebView 载 H5 现场作业,ScanManager 广播模式接扫描头.
 * 广播 scan.rcv.message -> 取 barcodeData(新版String)/barocode(旧版byte[])
 * -> evaluateJavascript 调 window.PdaScanFeed(code)(见 mobile-app/pda-scan.js).
 */
public class MainActivity extends Activity {
    private static final String TAG = "PdaShell";
    private static final String SCAN_ACTION = "scan.rcv.message";
    public static final String EXTRA_URL = "url";

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

    private void setupScanner() {
        try {
            scan = ScanManager.getDefaultInstance(this);
            scan.setOPMode(0);            // 0=广播模式(见 Demo: 0广播/1输入框/2键盘/3单次输入/4剪贴板)
            scan.setContinueScan(true);   // 连续扫描
            scan.openScanner();
            scan.startDecode();
        } catch (Throwable e) {
            Log.e(TAG, "scan init fail", e);
        }
    }

    private void handleScanIntent(Intent it) {
        String data = null;
        try {
            data = it.getStringExtra("barcodeData");   // 新版 SDK(2025 jar)
        } catch (Throwable ignore) { }
        if (TextUtils.isEmpty(data)) {
            byte[] raw = it.getByteArrayExtra("barocode"); // 旧版/系统类 ScanDevice
            if (raw != null) data = new String(raw, StandardCharsets.UTF_8);
        }
        if (TextUtils.isEmpty(data)) return;
        injectScan(data.trim());
    }

    private void injectScan(final String code) {
        if (TextUtils.isEmpty(code)) return;
        String js = "(function(){var c=" + jsStr(code) + ";"
                + "try{if(window.PdaScanFeed){window.PdaScanFeed(c);return;}}catch(e){}"
                + "try{document.dispatchEvent(new CustomEvent('pdaScan',{detail:{code:c,source:'broadcast'}}));return;}catch(e){}"
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
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'")
                .replace("\n", "\\n").replace("\r", "\\r") + "'";
    }

    /** 供 H5 可选调用:window.AndroidShell.startScan() 等. */
    public class Bridge {
        @JavascriptInterface public void startScan() { try { scan.startDecode(); } catch (Throwable e) { } }
        @JavascriptInterface public void stopScan() { try { scan.stopDecode(); } catch (Throwable e) { } }
        @JavascriptInterface public boolean isPda() { return true; }
        @JavascriptInterface public String device() { return Build.MODEL; }
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
        try { if (scan != null) { scan.openScanner(); scan.startDecode(); } } catch (Throwable ignore) { }
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
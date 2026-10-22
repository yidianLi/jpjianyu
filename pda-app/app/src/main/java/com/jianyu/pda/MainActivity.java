package com.jianyu.pda;

import android.app.Activity;
import android.bld.ScanManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Base64;
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

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * WMS PDA 壳:WebView 载 H5 现场作业,ScanManager 广播模式接扫描头 + 拍照回传.
 *
 * 扫码:广播 scan.rcv.message -> barcodeData(新版 String)/barocode(旧版 byte[])
 *       -> evaluateJavascript 调 window.PdaScanFeed(code)(见 mobile-app/pda-scan.js)
 * 拍照:广播 android.bld.scan.action.SAVE_IMAGE(enable) 打开,
 *       android.bld.scan.action.SEND_IMAGE(BitmapBytes) 回传,
 *       -> 压缩 JPEG -> 存设备 + data_url -> window.PdaPhotoFeed(dataUrl, meta)
 */
public class MainActivity extends Activity {
    private static final String TAG = "PdaShell";
    private static final String SCAN_ACTION = "scan.rcv.message";
    private static final String ACTION_SCAN_SAVE_IMAGE = "android.bld.scan.action.SAVE_IMAGE";
    private static final String ACTION_SCAN_SEND_IMAGE = "android.bld.scan.action.SEND_IMAGE";
    private static final String EXTRA_SCAN_SAVE_IMAGE = "enable";
    private static final String EXTRA_IMAGE_BITMAPBYTES = "BitmapBytes";
    private static final int MAX_EDGE = 1280;
    private static final int JPEG_QUALITY = 72;
    public static final String EXTRA_URL = "url";

    private WebView web;
    private ScanManager scan;

    private final BroadcastReceiver scanRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent it) {
            handleScanIntent(it);
        }
    };

    private final BroadcastReceiver photoRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent it) {
            byte[] raw = it.getByteArrayExtra(EXTRA_IMAGE_BITMAPBYTES);
            if (raw != null && raw.length > 0) handlePhoto(raw);
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
            scan.setOPMode(0);            // 0=广播模式(1输入框/2键盘/3单次输入/4剪贴板)
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

    /* ---------------- 拍照回传 ---------------- */

    private void handlePhoto(byte[] raw) {
        try {
            Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (bmp == null) return;
            Bitmap scaled = scaleDown(bmp);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bos);
            byte[] jpg = bos.toByteArray();
            String name = savePhoto(jpg);
            final String dataUrl = "data:image/jpeg;base64,"
                    + Base64.encodeToString(jpg, Base64.NO_WRAP);
            final String meta = "{\"name\":" + jsStr(name)
                    + ",\"size\":" + jpg.length + "}";
            String js = "(function(){var u=" + jsStr(dataUrl) + ";var m=" + meta + ";"
                    + "try{if(window.PdaPhotoFeed){window.PdaPhotoFeed(u,m);return;}}catch(e){}"
                    + "try{document.dispatchEvent(new CustomEvent('pdaPhoto',"
                    + "{detail:{dataUrl:u,meta:m}}));return;}catch(e){}"
                    + "})()";
            web.post(new Runnable() {
                @Override public void run() {
                    web.evaluateJavascript(js, null);
                    Toast.makeText(MainActivity.this, "照片已回传", Toast.LENGTH_SHORT).show();
                }
            });
        } catch (Throwable e) {
            Log.e(TAG, "photo handle fail", e);
        }
    }

    private Bitmap scaleDown(Bitmap bmp) {
        int w = bmp.getWidth(), h = bmp.getHeight();
        int longEdge = Math.max(w, h);
        if (longEdge <= MAX_EDGE) return bmp;
        float k = (float) MAX_EDGE / (float) longEdge;
        return Bitmap.createScaledBitmap(bmp, Math.round(w * k), Math.round(h * k), true);
    }

    /** 照片存设备(app 私有外部目录),便于弱网时本地留存与后续补传. */
    private String savePhoto(byte[] jpg) {
        try {
            File dir = getExternalFilesDir("photos");
            if (dir == null) dir = new File(getFilesDir(), "photos");
            if (!dir.exists() && !dir.mkdirs()) return "";
            String name = System.currentTimeMillis() + "-" + (jpg.length) + ".jpg";
            File f = new File(dir, name);
            FileOutputStream fos = new FileOutputStream(f);
            try {
                fos.write(jpg);
            } finally {
                fos.close();
            }
            return f.getAbsolutePath();
        } catch (Throwable e) {
            Log.e(TAG, "save photo fail", e);
            return "";
        }
    }

    private void setSaveImage(boolean enable) {
        try {
            Intent it = new Intent(ACTION_SCAN_SAVE_IMAGE);
            it.putExtra(EXTRA_SCAN_SAVE_IMAGE, enable);
            sendBroadcast(it);
        } catch (Throwable e) {
            Log.e(TAG, "save image switch fail", e);
        }
    }

    private static String jsStr(String s) {
        return "'" + String.valueOf(s).replace("\\", "\\\\").replace("'", "\\'")
                .replace("\n", "\\n").replace("\r", "\\r") + "'";
    }

    /** 供 H5 可选调用:window.AndroidShell.startScan() 等. */
    public class Bridge {
        @JavascriptInterface public void startScan() { try { scan.startDecode(); } catch (Throwable e) { } }
        @JavascriptInterface public void stopScan() { try { scan.stopDecode(); } catch (Throwable e) { } }
        @JavascriptInterface public boolean isPda() { return true; }
        @JavascriptInterface public String device() { return Build.MODEL; }
        @JavascriptInterface public void photoEnabled(boolean on) { setSaveImage(on); }
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
            registerReceiver(photoRx, new IntentFilter(ACTION_SCAN_SEND_IMAGE),
                    Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(scanRx, f);
            registerReceiver(photoRx, new IntentFilter(ACTION_SCAN_SEND_IMAGE));
        }
        setSaveImage(true);
        try { if (scan != null) { scan.openScanner(); scan.startDecode(); } } catch (Throwable ignore) { }
    }

    @Override protected void onPause() {
        try { unregisterReceiver(scanRx); } catch (Throwable ignore) { }
        try { unregisterReceiver(photoRx); } catch (Throwable ignore) { }
        setSaveImage(false);
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
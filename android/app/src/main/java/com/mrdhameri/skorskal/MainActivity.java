package com.mrdhameri.skorskal;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 1201;
    private static final int PICK_FILE_REQUEST = 1202;
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final String HOME = "https://" + ORIGIN + "/assets/web/index.html";

    private WebView web;
    private PermissionRequest pendingCamera;
    private ValueCallback<Uri[]> pendingFile;
    private WebViewAssetLoader loader;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff102739);
        getWindow().setNavigationBarColor(0xff102739);
        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web = new WebView(this);
        web.setBackgroundColor(0xfff3f6f8);
        setContentView(web);

        android.webkit.WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        web.addJavascriptInterface(new NativeExports(), "SkorskalAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().getHost())) {
                    return loader.shouldInterceptRequest(request.getUrl());
                }
                return null;
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ORIGIN.equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) { notifyUser("Cannot open this link."); }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!ORIGIN.equals(request.getOrigin().getHost())) {
                        request.deny();
                        return;
                    }
                    boolean camera = false;
                    for (String kind : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(kind)) camera = true;
                    }
                    if (!camera) { request.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        if (pendingCamera != null) pendingCamera.deny();
                        pendingCamera = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                    }
                });
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFile != null) pendingFile.onReceiveValue(null);
                pendingFile = callback;
                try {
                    Intent chooser = params.createIntent();
                    chooser.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(chooser, PICK_FILE_REQUEST);
                    return true;
                } catch (Exception error) {
                    pendingFile = null;
                    callback.onReceiveValue(null);
                    notifyUser("Cannot open file picker.");
                    return false;
                }
            }
        });

        web.setDownloadListener((url, userAgent, contentDisposition, mime, size) -> {
            Uri uri = Uri.parse(url);
            if (ORIGIN.equals(uri.getHost()) && "/assets/web/Skorskal_A4_OMR_40.pdf".equals(uri.getPath())) {
                try (InputStream stream = getAssets().open("web/Skorskal_A4_OMR_40.pdf")) {
                    saveDownload(stream, "Skorskal_A4_OMR_40.pdf", "application/pdf");
                    notifyUser("OMR PDF saved to Downloads/Skorskal.");
                } catch (Exception error) { notifyUser("Could not save OMR PDF."); }
            }
        });
        web.loadUrl(HOME);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA_REQUEST && pendingCamera != null) {
            PermissionRequest request = pendingCamera;
            pendingCamera = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                request.deny();
                notifyUser("Camera permission is needed for live scanning.");
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE_REQUEST && pendingFile != null) {
            ValueCallback<Uri[]> value = pendingFile;
            pendingFile = null;
            value.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        }
    }

    private void saveDownload(InputStream input, String filename, String mime) throws Exception {
        String safe = filename.replaceAll("[^a-zA-Z0-9._ -]", "_");
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
        values.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Skorskal");
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri destination = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (destination == null) throw new IllegalStateException("Could not create download");
        try {
            try (OutputStream out = getContentResolver().openOutputStream(destination)) {
                if (out == null) throw new IllegalStateException("Cannot open download");
                byte[] buffer = new byte[16384];
                int n;
                while ((n = input.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(destination, done, null, null);
        } catch (Exception error) {
            getContentResolver().delete(destination, null, null);
            throw error;
        }
    }

    private void notifyUser(String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    private class NativeExports {
        @JavascriptInterface public void saveBase64(String base64, String name, String mime) {
            try {
                byte[] content = Base64.decode(base64, Base64.DEFAULT);
                try (InputStream in = new java.io.ByteArrayInputStream(content)) {
                    saveDownload(in, name, mime);
                }
                notifyUser("Saved to Downloads/Skorskal: " + name);
            } catch (Exception error) {
                notifyUser("Export failed: " + error.getMessage());
            }
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingCamera != null) pendingCamera.deny();
        if (pendingFile != null) { pendingFile.onReceiveValue(null); pendingFile = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}

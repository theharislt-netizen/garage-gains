package com.rigcore.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupImport")
public class BackupImportPlugin extends Plugin {
    private static final int MAX_BYTES = 8 * 1024 * 1024;

    @PluginMethod
    public void pickBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, Intent.createChooser(intent, "Choose backup file"), "pickBackupResult");
    }

    @ActivityCallback
    private void pickBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("No file selected");
            return;
        }
        try {
            JSObject ret = new JSObject();
            ret.put("canceled", false);
            ret.put("text", readUri(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read backup: " + e.getMessage());
        }
    }

    private String readUri(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) {
                throw new Exception("Could not open file");
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            int total = 0;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_BYTES) {
                    throw new Exception("Backup file is too large");
                }
                bos.write(buf, 0, n);
            }
            return decodeText(bos.toByteArray());
        }
    }

    private static String decodeText(byte[] bytes) {
        if (bytes.length >= 2 && bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xFE) {
            return new String(bytes, StandardCharsets.UTF_16LE);
        }
        if (bytes.length >= 2 && bytes[0] == (byte) 0xFE && bytes[1] == (byte) 0xFF) {
            return new String(bytes, Charset.forName("UTF-16BE"));
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }
}

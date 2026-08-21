package com.rigcore.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupImportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.yathoughts.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⚠️ registerPlugin 必须在 super.onCreate 之前
        // 它会往 initialPlugins 列表加类；super.onCreate 里 Bridge 才会实例化列表
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.ehsanbenvari.hsefieldlog;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HsePrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

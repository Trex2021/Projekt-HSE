package com.ehsanbenvari.hsefieldlog;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HsePrinter")
public class HsePrinterPlugin extends Plugin {
    private static final String DEFAULT_JOB_NAME = "HSE FieldLog - Management Report";

    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager printManager =
                    (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.unavailable("Android print service is unavailable.");
                    return;
                }

                WebView webView = bridge.getWebView();
                if (webView == null) {
                    call.unavailable("Application report view is unavailable.");
                    return;
                }

                String requestedName = call.getString("jobName", DEFAULT_JOB_NAME);
                String jobName = requestedName == null || requestedName.trim().isEmpty()
                    ? DEFAULT_JOB_NAME
                    : requestedName.trim();
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                    .build();

                printManager.print(jobName, adapter, attributes);
                call.resolve();
            } catch (Exception error) {
                call.reject("Unable to open Android print dialog.", error);
            }
        });
    }
}

package com.spotdl.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import androidx.activity.EdgeToEdge;

import org.json.JSONArray;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null) {
                forwardToJs("shareReceived", sharedText);
            }
        }
    }

    private void forwardToJs(final String event, final String data) {
        bridge.getWebView().post(() -> {
            try {
                String escapedEvent = new JSONArray().put(event).toString();
                escapedEvent = escapedEvent.substring(1, escapedEvent.length() - 1);
                String escapedData = new JSONArray().put(data).toString();
                escapedData = escapedData.substring(1, escapedData.length() - 1);
                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent(" + escapedEvent + ", { detail: " + escapedData + " }))",
                    null
                );
            } catch (Exception ignored) {}
        });
    }
}

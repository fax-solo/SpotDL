package com.spotdl.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import androidx.activity.EdgeToEdge;

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
            String escaped = data.replace("\\", "\\\\").replace("'", "\\'");
            bridge.getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + event + "', { detail: '" + escaped + "' }))",
                null
            );
        });
    }
}

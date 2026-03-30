package com.opentask.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable edge-to-edge so CSS env(safe-area-inset-*) gets correct values
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}

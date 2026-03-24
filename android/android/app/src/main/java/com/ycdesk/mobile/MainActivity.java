package com.ycdesk.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TCPSocketPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

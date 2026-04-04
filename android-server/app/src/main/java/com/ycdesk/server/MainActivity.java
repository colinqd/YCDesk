package com.ycdesk.server;

import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.Manifest;
import android.content.pm.PackageManager;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;

    private TextView tvStatus;
    private EditText etPort;
    private CheckBox cbUseHttps;
    private Button btnToggleServer;
    private TextView tvServerAddress;
    private TextView tvOnlineDevices;

    private boolean isServerRunning = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        initViews();
        requestPermissions();
    }

    private void initViews() {
        tvStatus = findViewById(R.id.tvStatus);
        etPort = findViewById(R.id.etPort);
        cbUseHttps = findViewById(R.id.cbUseHttps);
        btnToggleServer = findViewById(R.id.btnToggleServer);
        tvServerAddress = findViewById(R.id.tvServerAddress);
        tvOnlineDevices = findViewById(R.id.tvOnlineDevices);

        btnToggleServer.setOnClickListener(v -> toggleServer());
    }

    private void requestPermissions() {
        String[] permissions = {
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.POST_NOTIFICATIONS
        };

        boolean hasAllPermissions = true;
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                hasAllPermissions = false;
                break;
            }
        }

        if (!hasAllPermissions) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
        }
    }

    private void toggleServer() {
        if (isServerRunning) {
            stopServer();
        } else {
            startServer();
        }
    }

    private void startServer() {
        String portStr = etPort.getText().toString();
        if (TextUtils.isEmpty(portStr)) {
            portStr = "3000";
        }

        int port;
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            port = 3000;
        }

        boolean useHttps = cbUseHttps.isChecked();

        SignalingServerService.startServer(this, port, useHttps);
        
        isServerRunning = true;
        updateUI();
    }

    private void stopServer() {
        SignalingServerService.stopServer(this);
        
        isServerRunning = false;
        updateUI();
    }

    private void updateUI() {
        if (isServerRunning) {
            tvStatus.setText(R.string.server_running);
            btnToggleServer.setText(R.string.stop_server);
        } else {
            tvStatus.setText(R.string.server_stopped);
            btnToggleServer.setText(R.string.start_server);
        }
    }

    public void updateServerAddress(String address) {
        runOnUiThread(() -> {
            tvServerAddress.setText(getString(R.string.server_address) + ": " + address);
        });
    }

    public void updateOnlineDevices(int count) {
        runOnUiThread(() -> {
            tvOnlineDevices.setText(getString(R.string.online_devices) + ": " + count);
        });
    }
}

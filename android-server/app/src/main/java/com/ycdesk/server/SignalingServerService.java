package com.ycdesk.server;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SignalingServerService extends Service {

    private static final String CHANNEL_ID = "YCDeskServerChannel";
    private static final int NOTIFICATION_ID = 1;

    private static final String ACTION_START = "com.ycdesk.server.START";
    private static final String ACTION_STOP = "com.ycdesk.server.STOP";

    private final IBinder binder = new LocalBinder();
    private ExecutorService executorService;
    private SignalingServer server;
    private boolean isRunning = false;

    public class LocalBinder extends Binder {
        SignalingServerService getService() {
            return SignalingServerService.this;
        }
    }

    public static void startServer(Context context, int port, boolean useHttps) {
        Intent intent = new Intent(context, SignalingServerService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("port", port);
        intent.putExtra("useHttps", useHttps);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopServer(Context context) {
        Intent intent = new Intent(context, SignalingServerService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        executorService = Executors.newSingleThreadExecutor();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                int port = intent.getIntExtra("port", 3000);
                boolean useHttps = intent.getBooleanExtra("useHttps", false);
                startServerInternal(port, useHttps);
            } else if (ACTION_STOP.equals(action)) {
                stopServerInternal();
            }
        }
        return START_STICKY;
    }

    private void startServerInternal(int port, boolean useHttps) {
        if (isRunning) {
            return;
        }

        executorService.execute(() -> {
            try {
                server = new SignalingServer(port, useHttps);
                server.start();
                isRunning = true;

                String address = getLocalIPAddress() + ":" + port;
                updateMainActivity(address, 0);

                startForeground(NOTIFICATION_ID, createNotification());
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private void stopServerInternal() {
        if (!isRunning) {
            return;
        }

        executorService.execute(() -> {
            try {
                if (server != null) {
                    server.stop();
                }
                isRunning = false;
                stopForeground(true);
                stopSelf();
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private String getLocalIPAddress() {
        try {
            for (Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces(); en.hasMoreElements();) {
                NetworkInterface intf = en.nextElement();
                for (Enumeration<InetAddress> enumIpAddr = intf.getInetAddresses(); enumIpAddr.hasMoreElements();) {
                    InetAddress inetAddress = enumIpAddr.nextElement();
                    if (!inetAddress.isLoopbackAddress() && inetAddress.getHostAddress().indexOf(':') == -1) {
                        return inetAddress.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "127.0.0.1";
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "YCDesk Server",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .build();
    }

    private void updateMainActivity(String address, int deviceCount) {
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopServerInternal();
        if (executorService != null) {
            executorService.shutdown();
        }
    }
}

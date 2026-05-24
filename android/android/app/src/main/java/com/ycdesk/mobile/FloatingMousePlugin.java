package com.ycdesk.mobile;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "FloatingMouse",
    permissions = {
        @Permission(
            alias = "overlay",
            strings = {}
        )
    }
)
public class FloatingMousePlugin extends Plugin {
    private static final String TAG = "FloatingMousePlugin";

    private FloatingMouseService floatingMouseService;
    private boolean isBound = false;
    private PluginCall savedCall;

    private ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            FloatingMouseService.LocalBinder binder = (FloatingMouseService.LocalBinder) service;
            floatingMouseService = binder.getService();
            isBound = true;
            Log.d(TAG, "FloatingMouseService connected, isBound=" + isBound);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            floatingMouseService = null;
            isBound = false;
            Log.d(TAG, "FloatingMouseService disconnected");
        }
    };

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "FloatingMousePlugin loaded");
    }

    private boolean hasOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            boolean hasPermission = Settings.canDrawOverlays(getContext());
            Log.d(TAG, "hasOverlayPermission: " + hasPermission);
            return hasPermission;
        }
        Log.d(TAG, "hasOverlayPermission: true (Android < M)");
        return true;
    }

    private void requestOverlayPermission(PluginCall call) {
        Log.d(TAG, "requestOverlayPermission called");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(getContext())) {
                Log.d(TAG, "Opening overlay permission settings");
                savedCall = call;
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
                startActivityForResult(call, intent, "handleOverlayResult");
            } else {
                Log.d(TAG, "Already has overlay permission");
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
            }
        }
    }

    @ActivityCallback
    private void handleOverlayResult(PluginCall call, ActivityResult result) {
        Log.d(TAG, "handleOverlayResult: hasPermission=" + hasOverlayPermission());

        if (hasOverlayPermission()) {
            Log.d(TAG, "Overlay permission granted, showing floating mouse");
            if (call != null) {
                if ("requestPermission".equals(call.getMethodName())) {
                    JSObject res = new JSObject();
                    res.put("granted", true);
                    call.resolve(res);
                } else {
                    showFloatingMouseInternal(call);
                }
            }
        } else {
            Log.e(TAG, "Overlay permission denied");
            if (call != null) {
                JSObject res = new JSObject();
                res.put("success", false);
                res.put("error", "悬浮窗权限被拒绝，请在设置中开启");
                res.put("needPermission", true);
                call.resolve(res);
            }
        }
    }

    @PluginMethod
    public void startService(PluginCall call) {
        Log.d(TAG, "startService called");
        Activity activity = getActivity();
        Intent intent = new Intent(activity, FloatingMouseService.class);

        try {
            activity.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(intent);
            } else {
                activity.startService(intent);
            }

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("hasPermission", hasOverlayPermission());
                call.resolve(result);
                Log.d(TAG, "FloatingMouseService started, hasPermission=" + hasOverlayPermission());
            }, 500);
        } catch (Exception e) {
            Log.e(TAG, "startService error: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Log.d(TAG, "stopService called");
        if (isBound) {
            getActivity().unbindService(serviceConnection);
            isBound = false;
        }

        Intent intent = new Intent(getActivity(), FloatingMouseService.class);
        getActivity().stopService(intent);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
        Log.d(TAG, "FloatingMouseService stopped");
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasOverlayPermission());
        call.resolve(result);
        Log.d(TAG, "hasPermission: " + hasOverlayPermission());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Log.d(TAG, "requestPermission called");
        if (hasOverlayPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestOverlayPermission(call);
        }
    }

    @PluginMethod
    public void show(PluginCall call) {
        Log.d(TAG, "show called, isBound=" + isBound + ", hasPermission=" + hasOverlayPermission());

        if (!hasOverlayPermission()) {
            Log.d(TAG, "No overlay permission, requesting...");
            requestOverlayPermission(call);
            return;
        }

        showFloatingMouseInternal(call);
    }

    private void showFloatingMouseInternal(PluginCall call) {
        Log.d(TAG, "showFloatingMouseInternal called, floatingMouseService=" + floatingMouseService);

        if (floatingMouseService == null) {
            Log.e(TAG, "Service not started");
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Service not started");
            result.put("needStartService", true);
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                floatingMouseService.showFloatingMouse();
                floatingMouseService.setOnMouseEventListener(new FloatingMouseService.OnMouseEventListener() {
                    @Override
                    public void onMouseMove(float x, float y) {
                        sendMouseEvent("mousemove", 0, x, y, 0);
                    }

                    @Override
                    public void onMouseDown(int button, float x, float y) {
                        sendMouseEvent("mousedown", button, x, y, 0);
                    }

                    @Override
                    public void onMouseUp(int button, float x, float y) {
                        sendMouseEvent("mouseup", button, x, y, 0);
                    }

                    @Override
                    public void onScroll(float delta) {
                        sendMouseEvent("wheel", 0, 0, 0, delta);
                    }

                    @Override
                    public void onDoubleClick(int button, float x, float y) {
                        sendMouseEvent("dblclick", button, x, y, 0);
                    }

                    @Override
                    public void onDragStart(int button, float x, float y) {
                        sendMouseEvent("dragstart", button, x, y, 0);
                    }

                    @Override
                    public void onDragEnd(int button, float x, float y) {
                        sendMouseEvent("dragend", button, x, y, 0);
                    }
                });

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Floating mouse shown successfully");
            } catch (Exception e) {
                Log.e(TAG, "showFloatingMouse error: " + e.getMessage());
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Log.d(TAG, "hide called");
        if (floatingMouseService == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Service not started");
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            floatingMouseService.hideFloatingMouse();
        });

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void setSensitivity(PluginCall call) {
        if (floatingMouseService == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Service not started");
            call.resolve(result);
            return;
        }

        Float sensitivity = call.getFloat("value", 1.0f);
        floatingMouseService.setSensitivity(sensitivity);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isShowing(PluginCall call) {
        JSObject result = new JSObject();
        result.put("showing", floatingMouseService != null && floatingMouseService.isShowing());
        call.resolve(result);
    }

    @PluginMethod
    public void getMousePosition(PluginCall call) {
        JSObject result = new JSObject();
        if (floatingMouseService != null && floatingMouseService.isShowing()) {
            int[] pos = floatingMouseService.getMousePosition();
            int[] size = floatingMouseService.getScreenSize();
            result.put("x", pos[0]);
            result.put("y", pos[1]);
            result.put("screenWidth", size[0]);
            result.put("screenHeight", size[1]);
            result.put("success", true);
        } else {
            result.put("success", false);
            result.put("error", "Mouse service not running");
        }
        call.resolve(result);
    }

    private void sendMouseEvent(String type, int button, float x, float y, float delta) {
        JSObject event = new JSObject();
        event.put("type", type);
        event.put("button", button);
        event.put("x", x);
        event.put("y", y);
        event.put("delta", delta);
        notifyListeners("mouseEvent", event);
    }
}

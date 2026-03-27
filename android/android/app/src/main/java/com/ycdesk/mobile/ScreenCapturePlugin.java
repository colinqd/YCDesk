package com.ycdesk.mobile;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.IBinder;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {
    private static final String TAG = "ScreenCapturePlugin";
    private static final int REQUEST_MEDIA_PROJECTION = 1001;

    private MediaProjectionManager mediaProjectionManager;
    private ScreenCaptureService screenCaptureService;
    private boolean isServiceBound = false;
    private PluginCall pendingCall;
    private MediaProjection mediaProjection;

    private ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            ScreenCaptureService.LocalBinder binder = (ScreenCaptureService.LocalBinder) service;
            screenCaptureService = binder.getService();
            isServiceBound = true;
            Log.d(TAG, "Screen capture service bound");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            screenCaptureService = null;
            isServiceBound = false;
            Log.d(TAG, "Screen capture service disconnected");
        }
    };

    @Override
    public void load() {
        super.load();
        mediaProjectionManager = (MediaProjectionManager) getContext().getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
        bindService();
        Log.d(TAG, "ScreenCapturePlugin loaded");
    }

    public void onDestroy() {
        unbindService();
    }

    private void bindService() {
        Intent serviceIntent = new Intent(getContext(), ScreenCaptureService.class);
        getContext().startService(serviceIntent);
        getContext().bindService(serviceIntent, serviceConnection, android.content.Context.BIND_AUTO_CREATE);
    }

    private void unbindService() {
        if (isServiceBound) {
            getContext().unbindService(serviceConnection);
            isServiceBound = false;
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        this.pendingCall = call;
        Intent intent = mediaProjectionManager.createScreenCaptureIntent();
        startActivityForResult(call, intent, REQUEST_MEDIA_PROJECTION);
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (screenCaptureService == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Screen capture service not bound");
            call.resolve(result);
            return;
        }

        if (mediaProjection == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Media projection not initialized");
            call.resolve(result);
            return;
        }

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        if (screenCaptureService == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Screen capture service not bound");
            call.resolve(result);
            return;
        }

        screenCaptureService.stopCapture();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isCapturing(PluginCall call) {
        boolean isCapturing = screenCaptureService != null && screenCaptureService.isCapturing();
        JSObject result = new JSObject();
        result.put("isCapturing", isCapturing);
        call.resolve(result);
    }

    @PluginMethod
    public void getDisplaySize(PluginCall call) {
        if (screenCaptureService == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Screen capture service not bound");
            call.resolve(result);
            return;
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("width", screenCaptureService.getDisplayWidth());
        result.put("height", screenCaptureService.getDisplayHeight());
        call.resolve(result);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_MEDIA_PROJECTION && pendingCall != null) {
            if (resultCode == android.app.Activity.RESULT_OK && data != null) {
                mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("resultCode", resultCode);
                pendingCall.resolve(result);
            } else {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Permission denied");
                pendingCall.resolve(result);
            }
            pendingCall = null;
        }
    }
}
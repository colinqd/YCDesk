package com.ycdesk.mobile;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {
    private static final String TAG = "ScreenCapturePlugin";

    private MediaProjectionManager mediaProjectionManager;
    private ScreenCaptureService screenCaptureService;
    private boolean isServiceBound = false;
    private MediaProjection mediaProjection;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;

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
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
        }
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
        Intent intent = mediaProjectionManager.createScreenCaptureIntent();
        startActivityForResult(call, intent, "handleMediaProjectionResult");
    }

    @ActivityCallback
    private void handleMediaProjectionResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            mediaProjection = mediaProjectionManager.getMediaProjection(result.getResultCode(), result.getData());
            JSObject res = new JSObject();
            res.put("success", true);
            res.put("resultCode", result.getResultCode());
            call.resolve(res);
        } else {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("error", "Permission denied");
            call.resolve(res);
        }
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

        int width = screenCaptureService.getDisplayWidth();
        int height = screenCaptureService.getDisplayHeight();

        // Clean up previous ImageReader if exists
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
        }

        imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2);
        captureThread = new HandlerThread("ImageReaderThread");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());

        imageReader.setOnImageAvailableListener(reader -> {
            android.media.Image image = null;
            try {
                image = reader.acquireLatestImage();
                if (image != null) {
                    JSObject event = new JSObject();
                    event.put("width", image.getWidth());
                    event.put("height", image.getHeight());
                    notifyListeners("frameAvailable", event);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error processing frame: " + e.getMessage());
            } finally {
                if (image != null) {
                    image.close();
                }
            }
        }, captureHandler);

        screenCaptureService.startCapture(mediaProjection, imageReader.getSurface());

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("width", width);
        result.put("height", height);
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

        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
        }

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
}

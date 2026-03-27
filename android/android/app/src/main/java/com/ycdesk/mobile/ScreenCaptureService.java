package com.ycdesk.mobile;

import android.app.Service;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.projection.MediaProjection;
import android.os.Binder;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

import androidx.annotation.Nullable;

import java.util.concurrent.atomic.AtomicBoolean;

public class ScreenCaptureService extends Service {
    private static final String TAG = "ScreenCaptureService";
    private static final String SCREEN_CAPTURE_NAME = "YCDesk Screen Capture";
    private static final int DISPLAY_DPI = 480;

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private Surface surface;
    private HandlerThread handlerThread;
    private Handler handler;
    private final AtomicBoolean isCapturing = new AtomicBoolean(false);
    private int displayWidth;
    private int displayHeight;

    private final IBinder binder = new LocalBinder();

    public class LocalBinder extends Binder {
        ScreenCaptureService getService() {
            return ScreenCaptureService.this;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handlerThread = new HandlerThread("ScreenCaptureThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
        updateDisplaySize();
        Log.d(TAG, "ScreenCaptureService created");
    }

    @Override
    public void onDestroy() {
        stopCapture();
        if (handlerThread != null) {
            handlerThread.quitSafely();
        }
        Log.d(TAG, "ScreenCaptureService destroyed");
        super.onDestroy();
    }

    private void updateDisplaySize() {
        WindowManager windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager != null) {
            Display display = windowManager.getDefaultDisplay();
            DisplayMetrics metrics = new DisplayMetrics();
            display.getRealMetrics(metrics);
            displayWidth = metrics.widthPixels;
            displayHeight = metrics.heightPixels;
            Log.d(TAG, "Updated display size: " + displayWidth + "x" + displayHeight);
        } else {
            // Default size if unable to get display metrics
            displayWidth = 1920;
            displayHeight = 1080;
            Log.w(TAG, "Unable to get display metrics, using default size");
        }
    }

    public void startCapture(MediaProjection projection, Surface surface) {
        this.mediaProjection = projection;
        this.surface = surface;

        handler.post(() -> {
            if (isCapturing.get()) {
                Log.w(TAG, "Capture already started");
                return;
            }

            try {
                updateDisplaySize();
                createVirtualDisplay();
                isCapturing.set(true);
                Log.d(TAG, "Screen capture started");
            } catch (Exception e) {
                Log.e(TAG, "Error starting screen capture: " + e.getMessage());
            }
        });
    }

    public void stopCapture() {
        handler.post(() -> {
            if (!isCapturing.get()) {
                Log.w(TAG, "Capture not started");
                return;
            }

            try {
                if (virtualDisplay != null) {
                    virtualDisplay.release();
                    virtualDisplay = null;
                }
                if (mediaProjection != null) {
                    mediaProjection.stop();
                    mediaProjection = null;
                }
                isCapturing.set(false);
                Log.d(TAG, "Screen capture stopped");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping screen capture: " + e.getMessage());
            }
        });
    }

    private void createVirtualDisplay() {
        if (mediaProjection == null || surface == null) {
            Log.e(TAG, "Media projection or surface is null");
            return;
        }

        virtualDisplay = mediaProjection.createVirtualDisplay(
                SCREEN_CAPTURE_NAME,
                displayWidth,
                displayHeight,
                DISPLAY_DPI,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface,
                null,
                null
        );

        if (virtualDisplay == null) {
            Log.e(TAG, "Failed to create virtual display");
        } else {
            Log.d(TAG, "Virtual display created successfully: " + displayWidth + "x" + displayHeight);
        }
    }

    public boolean isCapturing() {
        return isCapturing.get();
    }

    public int getDisplayWidth() {
        return displayWidth;
    }

    public int getDisplayHeight() {
        return displayHeight;
    }

    public void updateDisplay() {
        updateDisplaySize();
        if (isCapturing.get() && virtualDisplay != null) {
            // Recreate virtual display with new size
            stopCapture();
            if (mediaProjection != null && surface != null) {
                startCapture(mediaProjection, surface);
            }
        }
    }
}
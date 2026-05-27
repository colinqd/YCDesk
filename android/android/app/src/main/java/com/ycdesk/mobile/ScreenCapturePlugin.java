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

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

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
                    // Convert Image to base64 JPEG for JS consumption
                    String base64Frame = imageToBase64Jpeg(image);
                    
                    JSObject event = new JSObject();
                    event.put("width", image.getWidth());
                    event.put("height", image.getHeight());
                    if (base64Frame != null) {
                        event.put("frameData", base64Frame);
                    }
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

    /**
     * Convert an android.media.Image (RGBA_8888) to a base64-encoded JPEG string.
     * Uses YUV -> RGB conversion if the image is in YUV format.
     */
    private String imageToBase64Jpeg(android.media.Image image) {
        try {
            Bitmap bitmap;
            int format = image.getFormat();

            if (format == android.graphics.ImageFormat.YUV_420_888) {
                bitmap = yuv420ToBitmap(image);
            } else {
                // RGBA_8888 or other formats
                android.media.Image.Plane[] planes = image.getPlanes();
                if (planes.length == 0) return null;

                ByteBuffer buffer = planes[0].getBuffer();
                bitmap = Bitmap.createBitmap(image.getWidth(), image.getHeight(), Bitmap.Config.ARGB_8888);
                bitmap.copyPixelsFromBuffer(buffer);
            }

            if (bitmap == null) return null;

            // Compress to JPEG
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, baos);
            byte[] jpegBytes = baos.toByteArray();
            baos.close();

            // Base64 encode
            String base64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP);

            // Recycle bitmap to free memory
            bitmap.recycle();

            return base64;
        } catch (Exception e) {
            Log.e(TAG, "imageToBase64Jpeg error: " + e.getMessage());
            return null;
        }
    }

    /**
     * Convert YUV_420_888 Image to Bitmap.
     */
    private Bitmap yuv420ToBitmap(android.media.Image image) {
        try {
            android.media.Image.Plane[] planes = image.getPlanes();
            if (planes.length < 3) return null;

            ByteBuffer yBuffer = planes[0].getBuffer();
            ByteBuffer uBuffer = planes[1].getBuffer();
            ByteBuffer vBuffer = planes[2].getBuffer();

            int ySize = yBuffer.remaining();
            int uSize = uBuffer.remaining();
            int vSize = vBuffer.remaining();

            byte[] nv21 = new byte[ySize + uSize + vSize];

            // Y plane
            yBuffer.get(nv21, 0, ySize);

            // V and U planes (interleaved for NV21)
            int uvIndex = ySize;
            // UV interleaving: V first for NV21
            int pixelStride = planes[1].getPixelStride();
            int rowStride = planes[1].getRowStride();

            if (pixelStride == 1) {
                // Already packed, need to swap U and V for NV21
                byte[] uBytes = new byte[uSize];
                byte[] vBytes = new byte[vSize];
                uBuffer.get(uBytes);
                vBuffer.get(vBytes);
                for (int i = 0; i < uSize && i < vSize; i++) {
                    nv21[ySize + i * 2] = vBytes[i];
                    nv21[ySize + i * 2 + 1] = uBytes[i];
                }
            } else {
                // De-interleave
                for (int row = 0; row < image.getHeight() / 2; row++) {
                    for (int col = 0; col < image.getWidth() / 2; col++) {
                        int uvPos = row * rowStride + col * pixelStride;
                        uBuffer.position(uvPos);
                        vBuffer.position(uvPos);
                        if (uBuffer.hasRemaining() && vBuffer.hasRemaining()) {
                            nv21[uvIndex++] = vBuffer.get();
                            nv21[uvIndex++] = uBuffer.get();
                        }
                    }
                }
            }

            // Decode NV21 to Bitmap
            android.graphics.YuvImage yuvImage = new android.graphics.YuvImage(
                nv21,
                android.graphics.ImageFormat.NV21,
                image.getWidth(),
                image.getHeight(),
                null
            );

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            yuvImage.compressToJpeg(
                new android.graphics.Rect(0, 0, image.getWidth(), image.getHeight()),
                70,
                out
            );

            byte[] jpegBytes = out.toByteArray();
            out.close();

            return BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.length);
        } catch (Exception e) {
            Log.e(TAG, "yuv420ToBitmap error: " + e.getMessage());
            return null;
        }
    }
}

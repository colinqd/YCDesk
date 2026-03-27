package com.ycdesk.mobile;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;

import androidx.core.app.NotificationCompat;

import com.ycdesk.mobile.R;

public class FloatingKeyboardService extends Service {
    private static final String TAG = "FloatingKeyboardService";
    private static final String CHANNEL_ID = "floating_keyboard_channel";
    private static final int NOTIFICATION_ID = 2;

    private WindowManager windowManager;
    private View floatingView;
    private WebView keyboardWebView;
    private View minimizedView;
    private boolean isMinimized = false;
    private boolean isVisible = false;

    private int screenWidth;
    private int screenHeight;

    private OnKeyListener keyListener;

    public interface OnKeyListener {
        void onKeyPress(String key);
        void onSpecialKey(String key, boolean ctrl, boolean alt, boolean shift);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (wm != null) {
            android.graphics.Point size = new android.graphics.Point();
            wm.getDefaultDisplay().getSize(size);
            screenWidth = size.x;
            screenHeight = size.y;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "FloatingKeyboardService started");
        startForeground(NOTIFICATION_ID, createNotification());
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return new LocalBinder();
    }

    public class LocalBinder extends android.os.Binder {
        public FloatingKeyboardService getService() {
            return FloatingKeyboardService.this;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Floating Keyboard",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Floating keyboard overlay service");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("YCDesk Keyboard")
            .setContentText("Floating keyboard is running")
            .setSmallIcon(R.drawable.cursor_pointer)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    public void setOnKeyListener(OnKeyListener listener) {
        this.keyListener = listener;
    }

    @SuppressLint({"ClickableViewAccessibility", "SetJavaScriptEnabled"})
    public void showKeyboard() {
        if (isVisible && !isMinimized) {
            Log.d(TAG, "Keyboard already visible");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(this)) {
                Log.e(TAG, "No overlay permission");
                return;
            }
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) {
            Log.e(TAG, "Cannot get WindowManager service");
            return;
        }

        int layoutFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        int keyboardHeight = (int) (screenHeight * 0.35 * 0.7);

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            keyboardHeight,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.START;
        params.x = 0;
        params.y = 0;

        try {
            floatingView = createKeyboardView();
            windowManager.addView(floatingView, params);
            isVisible = true;
            isMinimized = false;
            Log.d(TAG, "Floating keyboard shown successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to show keyboard: " + e.getMessage());
        }
    }

    public void hideKeyboard() {
        if (windowManager != null && floatingView != null) {
            windowManager.removeView(floatingView);
            floatingView = null;
            keyboardWebView = null;
        }
        if (windowManager != null && minimizedView != null) {
            windowManager.removeView(minimizedView);
            minimizedView = null;
        }
        isVisible = false;
        isMinimized = false;
        Log.d(TAG, "Floating keyboard hidden");
    }

    public void minimize() {
        if (isMinimized || windowManager == null || floatingView == null) {
            return;
        }

        windowManager.removeView(floatingView);
        floatingView = null;
        keyboardWebView = null;
        isMinimized = true;

        int layoutFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            60,
            60,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.END;
        params.x = 20;
        params.y = 100;

        minimizedView = new FrameLayout(this);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(0x80667eea);
        bg.setCornerRadius(30);
        minimizedView.setBackground(bg);

        android.widget.ImageView icon = new android.widget.ImageView(this);
        icon.setImageResource(R.drawable.cursor_pointer);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(30, 30);
        iconParams.gravity = Gravity.CENTER;
        icon.setLayoutParams(iconParams);
        ((FrameLayout) minimizedView).addView(icon);

        minimizedView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_UP) {
                    restore();
                }
                return true;
            }
        });

        windowManager.addView(minimizedView, params);
        Log.d(TAG, "Keyboard minimized");
    }

    public void restore() {
        if (!isMinimized || windowManager == null || minimizedView == null) {
            return;
        }

        windowManager.removeView(minimizedView);
        minimizedView = null;
        isMinimized = false;

        showKeyboard();
        Log.d(TAG, "Keyboard restored");
    }

    public boolean isVisible() {
        return isVisible && !isMinimized;
    }

    public boolean isMinimized() {
        return isMinimized;
    }

    @SuppressLint({"ClickableViewAccessibility", "SetJavaScriptEnabled"})
    private View createKeyboardView() {
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(0xCC000000);

        LinearLayout mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        FrameLayout.LayoutParams mainParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        mainLayout.setLayoutParams(mainParams);

        LinearLayout headerLayout = new LinearLayout(this);
        headerLayout.setOrientation(LinearLayout.HORIZONTAL);
        headerLayout.setBackgroundColor(0xFF333333);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerLayout.setLayoutParams(headerParams);
        headerLayout.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        headerLayout.setPadding(8, 4, 8, 4);

        ImageButton hideBtn = new ImageButton(this);
        hideBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        hideBtn.setBackgroundColor(0x00000000);
        hideBtn.setOnClickListener(v -> minimize());
        hideBtn.setColorFilter(0xFFFFFFFF);
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(40, 40);
        hideBtn.setLayoutParams(btnParams);
        headerLayout.addView(hideBtn);

        mainLayout.addView(headerLayout);

        keyboardWebView = new WebView(this);
        WebSettings settings = keyboardWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        keyboardWebView.setWebViewClient(new WebViewClient());
        keyboardWebView.setWebChromeClient(new WebChromeClient());
        keyboardWebView.setBackgroundColor(0x00000000);

        keyboardWebView.addJavascriptInterface(new KeyboardJsInterface(), "AndroidKeyboard");

        String htmlContent = generateKeyboardHtml();
        keyboardWebView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null);

        LinearLayout.LayoutParams webViewParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1.0f
        );
        keyboardWebView.setLayoutParams(webViewParams);
        mainLayout.addView(keyboardWebView);

        container.addView(mainLayout);
        return container;
    }

    private String generateKeyboardHtml() {
        return "<!DOCTYPE html>" +
            "<html>" +
            "<head>" +
            "<meta charset='UTF-8'>" +
            "<meta name='viewport' content='width=device-width, initial-scale=1.0, user-scalable=no'>" +
            "<style>" +
            "* { box-sizing: border-box; margin: 0; padding: 0; }" +
            "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; overflow: hidden; }" +
            ".keyboard { display: flex; flex-direction: column; gap: 1px; padding: 2px; }" +
            ".keyboard-row { display: flex; justify-content: center; gap: 1px; }" +
            ".key { min-width: 20px; height: 25px; background: rgba(80, 80, 80, 0.9); border: none; border-radius: 3px; color: white; font-size: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; }" +
            ".key:active { background: rgba(100, 100, 100, 0.9); }" +
            ".key.special { min-width: 28px; background: rgba(60, 60, 60, 0.9); }" +
            ".key.space { min-width: 84px; }" +
            ".key.ctrl { min-width: 24px; }" +
            "</style>" +
            "</head>" +
            "<body>" +
            "<div class='keyboard'>" +
            "<div class='keyboard-row'>" +
            "<button class='key special' onclick='sendKey(\"Escape\")'>ESC</button>" +
            "<button class='key' onclick='sendKey(\"F1\")'>F1</button>" +
            "<button class='key' onclick='sendKey(\"F2\")'>F2</button>" +
            "<button class='key' onclick='sendKey(\"F3\")'>F3</button>" +
            "<button class='key' onclick='sendKey(\"F4\")'>F4</button>" +
            "<button class='key' onclick='sendKey(\"F5\")'>F5</button>" +
            "<button class='key' onclick='sendKey(\"F6\")'>F6</button>" +
            "<button class='key' onclick='sendKey(\"F7\")'>F7</button>" +
            "<button class='key' onclick='sendKey(\"F8\")'>F8</button>" +
            "<button class='key' onclick='sendKey(\"F9\")'>F9</button>" +
            "<button class='key' onclick='sendKey(\"F10\")'>F10</button>" +
            "<button class='key' onclick='sendKey(\"F11\")'>F11</button>" +
            "<button class='key' onclick='sendKey(\"F12\")'>F12</button>" +
            "<button class='key special' onclick='sendKey(\"Delete\")'>DEL</button>" +
            "</div>" +
            "<div class='keyboard-row'>" +
            "<button class='key'>`</button>" +
            "<button class='key' onclick='sendKey(\"Digit1\")'>1</button>" +
            "<button class='key' onclick='sendKey(\"Digit2\")'>2</button>" +
            "<button class='key' onclick='sendKey(\"Digit3\")'>3</button>" +
            "<button class='key' onclick='sendKey(\"Digit4\")'>4</button>" +
            "<button class='key' onclick='sendKey(\"Digit5\")'>5</button>" +
            "<button class='key' onclick='sendKey(\"Digit6\")'>6</button>" +
            "<button class='key' onclick='sendKey(\"Digit7\")'>7</button>" +
            "<button class='key' onclick='sendKey(\"Digit8\")'>8</button>" +
            "<button class='key' onclick='sendKey(\"Digit9\")'>9</button>" +
            "<button class='key' onclick='sendKey(\"Digit0\")'>0</button>" +
            "<button class='key'>-</button>" +
            "<button class='key'>=</button>" +
            "<button class='key special' onclick='sendKey(\"Backspace\")'>⌫</button>" +
            "</div>" +
            "<div class='keyboard-row'>" +
            "<button class='key special' onclick='sendKey(\"Tab\")'>TAB</button>" +
            "<button class='key' onclick='sendKey(\"KeyQ\")'>Q</button>" +
            "<button class='key' onclick='sendKey(\"KeyW\")'>W</button>" +
            "<button class='key' onclick='sendKey(\"KeyE\")'>E</button>" +
            "<button class='key' onclick='sendKey(\"KeyR\")'>R</button>" +
            "<button class='key' onclick='sendKey(\"KeyT\")'>T</button>" +
            "<button class='key' onclick='sendKey(\"KeyY\")'>Y</button>" +
            "<button class='key' onclick='sendKey(\"KeyU\")'>U</button>" +
            "<button class='key' onclick='sendKey(\"KeyI\")'>I</button>" +
            "<button class='key' onclick='sendKey(\"KeyO\")'>O</button>" +
            "<button class='key' onclick='sendKey(\"KeyP\")'>P</button>" +
            "<button class='key'>[</button>" +
            "<button class='key'>]</button>" +
            "<button class='key'>\\</button>" +
            "</div>" +
            "<div class='keyboard-row'>" +
            "<button class='key special' onclick='sendKey(\"CapsLock\")'>CAPS</button>" +
            "<button class='key' onclick='sendKey(\"KeyA\")'>A</button>" +
            "<button class='key' onclick='sendKey(\"KeyS\")'>S</button>" +
            "<button class='key' onclick='sendKey(\"KeyD\")'>D</button>" +
            "<button class='key' onclick='sendKey(\"KeyF\")'>F</button>" +
            "<button class='key' onclick='sendKey(\"KeyG\")'>G</button>" +
            "<button class='key' onclick='sendKey(\"KeyH\")'>H</button>" +
            "<button class='key' onclick='sendKey(\"KeyJ\")'>J</button>" +
            "<button class='key' onclick='sendKey(\"KeyK\")'>K</button>" +
            "<button class='key' onclick='sendKey(\"KeyL\")'>L</button>" +
            "<button class='key'>;</button>" +
            "<button class='key'>'</button>" +
            "<button class='key special' onclick='sendKey(\"Enter\")'>↵</button>" +
            "</div>" +
            "<div class='keyboard-row'>" +
            "<button class='key special' onclick='sendKey(\"ShiftLeft\")'>SHIFT</button>" +
            "<button class='key' onclick='sendKey(\"KeyZ\")'>Z</button>" +
            "<button class='key' onclick='sendKey(\"KeyX\")'>X</button>" +
            "<button class='key' onclick='sendKey(\"KeyC\")'>C</button>" +
            "<button class='key' onclick='sendKey(\"KeyV\")'>V</button>" +
            "<button class='key' onclick='sendKey(\"KeyB\")'>B</button>" +
            "<button class='key' onclick='sendKey(\"KeyN\")'>N</button>" +
            "<button class='key' onclick='sendKey(\"KeyM\")'>M</button>" +
            "<button class='key'>,</button>" +
            "<button class='key'>.</button>" +
            "<button class='key'>/</button>" +
            "<button class='key special' onclick='sendKey(\"ShiftRight\")'>SHIFT</button>" +
            "</div>" +
            "<div class='keyboard-row'>" +
            "<button class='key ctrl' onclick='sendKey(\"ControlLeft\")'>CTRL</button>" +
            "<button class='key special' onclick='sendKey(\"MetaLeft\")'>WIN</button>" +
            "<button class='key special' onclick='sendKey(\"AltLeft\")'>ALT</button>" +
            "<button class='key space' onclick='sendKey(\"Space\")'>空格</button>" +
            "<button class='key special' onclick='sendKey(\"AltRight\")'>ALT</button>" +
            "<button class='key special' onclick='sendKey(\"ArrowLeft\")'>←</button>" +
            "<button class='key' onclick='sendKey(\"ArrowUp\")'>↑</button>" +
            "<button class='key' onclick='sendKey(\"ArrowDown\")'>↓</button>" +
            "<button class='key special' onclick='sendKey(\"ArrowRight\")'>→</button>" +
            "<button class='key ctrl' onclick='sendKey(\"ControlRight\")'>CTRL</button>" +
            "</div>" +
            "</div>" +
            "<script>" +
            "function sendKey(key) {" +
            "  if (window.AndroidKeyboard) {" +
            "    AndroidKeyboard.sendKey(key);" +
            "  }" +
            "}" +
            "</script>" +
            "</body>" +
            "</html>";
    }

    private class KeyboardJsInterface {
        @JavascriptInterface
        public void sendKey(String key) {
            Log.d(TAG, "Key pressed: " + key);
            if (keyListener != null) {
                keyListener.onKeyPress(key);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        hideKeyboard();
    }
}

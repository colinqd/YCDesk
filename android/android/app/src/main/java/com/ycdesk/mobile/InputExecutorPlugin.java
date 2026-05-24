package com.ycdesk.mobile;

import android.accessibilityservice.AccessibilityService;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.Window;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InputExecutor")
public class InputExecutorPlugin extends Plugin {
    private static final String TAG = "InputExecutorPlugin";
    private Instrumentation instrumentation;

    @Override
    public void load() {
        super.load();
        instrumentation = new Instrumentation();
        Log.d(TAG, "InputExecutorPlugin loaded, accessibility service available: " + InputAccessibilityService.isAvailable());
    }

    /**
     * Check if AccessibilityService is available for input injection.
     */
    private boolean useAccessibilityService() {
        return InputAccessibilityService.isAvailable();
    }

    @PluginMethod
    public void executeMouseMove(PluginCall call) {
        try {
            float x = (float) (double) call.getDouble("x", 0.0);
            float y = (float) (double) call.getDouble("y", 0.0);
            int screenWidth = call.getInt("screenWidth", 1920);
            int screenHeight = call.getInt("screenHeight", 1080);

            int absoluteX = (int) (x * screenWidth);
            int absoluteY = (int) (y * screenHeight);

            if (useAccessibilityService()) {
                // AccessibilityService dispatchGesture only supports touch, not hover.
                // Mouse move is handled by the floating cursor overlay, so we skip here.
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Mouse move via accessibility (handled by overlay): x=" + absoluteX + ", y=" + absoluteY);
                return;
            }

            // Fallback: Instrumentation
            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            MotionEvent motionEvent = MotionEvent.obtain(
                    downTime,
                    eventTime,
                    MotionEvent.ACTION_MOVE,
                    absoluteX,
                    absoluteY,
                    0
            );

            instrumentation.sendPointerSync(motionEvent);
            motionEvent.recycle();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Mouse move executed: x=" + absoluteX + ", y=" + absoluteY);
        } catch (Exception e) {
            Log.e(TAG, "Error executing mouse move: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeMouseDown(PluginCall call) {
        try {
            float x = (float) (double) call.getDouble("x", 0.0);
            float y = (float) (double) call.getDouble("y", 0.0);
            int button = call.getInt("button", 0);
            int screenWidth = call.getInt("screenWidth", 1920);
            int screenHeight = call.getInt("screenHeight", 1080);

            int absoluteX = (int) (x * screenWidth);
            int absoluteY = (int) (y * screenHeight);

            if (useAccessibilityService()) {
                InputAccessibilityService service = InputAccessibilityService.getInstance();
                boolean success;
                if (button == 2) {
                    // Right button -> long click
                    success = service.dispatchLongClick(absoluteX, absoluteY);
                } else {
                    // Left or middle button -> click
                    success = service.dispatchClick(absoluteX, absoluteY);
                }

                JSObject result = new JSObject();
                result.put("success", success);
                if (!success) {
                    result.put("error", "dispatchGesture failed");
                }
                call.resolve(result);
                Log.d(TAG, "Mouse down via accessibility: button=" + button + ", x=" + absoluteX + ", y=" + absoluteY);
                return;
            }

            // Fallback: Instrumentation
            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            int action = MotionEvent.ACTION_DOWN;
            if (button == 1) {
                action = MotionEvent.ACTION_DOWN;
            } else if (button == 2) {
                action = MotionEvent.ACTION_DOWN;
            }

            MotionEvent motionEvent = MotionEvent.obtain(
                    downTime,
                    eventTime,
                    action,
                    absoluteX,
                    absoluteY,
                    0
            );

            instrumentation.sendPointerSync(motionEvent);
            motionEvent.recycle();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Mouse down executed: button=" + button + ", x=" + absoluteX + ", y=" + absoluteY);
        } catch (Exception e) {
            Log.e(TAG, "Error executing mouse down: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeMouseUp(PluginCall call) {
        try {
            float x = (float) (double) call.getDouble("x", 0.0);
            float y = (float) (double) call.getDouble("y", 0.0);
            int button = call.getInt("button", 0);
            int screenWidth = call.getInt("screenWidth", 1920);
            int screenHeight = call.getInt("screenHeight", 1080);

            int absoluteX = (int) (x * screenWidth);
            int absoluteY = (int) (y * screenHeight);

            if (useAccessibilityService()) {
                // With AccessibilityService, click is dispatched as a single atomic gesture
                // in executeMouseDown, so mouseUp is a no-op here.
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Mouse up via accessibility (no-op, click is atomic): x=" + absoluteX + ", y=" + absoluteY);
                return;
            }

            // Fallback: Instrumentation
            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            int action = MotionEvent.ACTION_UP;

            MotionEvent motionEvent = MotionEvent.obtain(
                    downTime,
                    eventTime,
                    action,
                    absoluteX,
                    absoluteY,
                    0
            );

            instrumentation.sendPointerSync(motionEvent);
            motionEvent.recycle();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Mouse up executed: button=" + button + ", x=" + absoluteX + ", y=" + absoluteY);
        } catch (Exception e) {
            Log.e(TAG, "Error executing mouse up: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeMouseWheel(PluginCall call) {
        try {
            float deltaY = (float) (double) call.getDouble("deltaY", 0.0);
            float x = (float) (double) call.getDouble("x", 0.5);
            float y = (float) (double) call.getDouble("y", 0.5);
            int screenWidth = call.getInt("screenWidth", 1920);
            int screenHeight = call.getInt("screenHeight", 1080);

            if (useAccessibilityService()) {
                InputAccessibilityService service = InputAccessibilityService.getInstance();
                int absoluteX = (int) (x * screenWidth);
                int absoluteY = (int) (y * screenHeight);
                boolean success = service.dispatchScroll(absoluteX, absoluteY, deltaY);

                JSObject result = new JSObject();
                result.put("success", success);
                if (!success) {
                    result.put("error", "dispatchGesture scroll failed");
                }
                call.resolve(result);
                Log.d(TAG, "Mouse wheel via accessibility: deltaY=" + deltaY);
                return;
            }

            // Fallback: Instrumentation - use key events to simulate mouse wheel
            int keyCode = deltaY > 0 ? KeyEvent.KEYCODE_PAGE_DOWN : KeyEvent.KEYCODE_PAGE_UP;

            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            KeyEvent downEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0);
            KeyEvent upEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0);

            instrumentation.sendKeySync(downEvent);
            instrumentation.sendKeySync(upEvent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Mouse wheel executed: deltaY=" + deltaY);
        } catch (Exception e) {
            Log.e(TAG, "Error executing mouse wheel: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeKeyDown(PluginCall call) {
        try {
            String key = call.getString("key", "");
            boolean ctrlKey = call.getBoolean("ctrlKey", false);
            boolean shiftKey = call.getBoolean("shiftKey", false);
            boolean altKey = call.getBoolean("altKey", false);
            boolean metaKey = call.getBoolean("metaKey", false);
            int keyCode = getKeyCode(key);

            if (keyCode != -1) {
                long downTime = SystemClock.uptimeMillis();
                long eventTime = SystemClock.uptimeMillis();

                int metaState = 0;
                if (ctrlKey) metaState |= KeyEvent.META_CTRL_ON;
                if (shiftKey) metaState |= KeyEvent.META_SHIFT_ON;
                if (altKey) metaState |= KeyEvent.META_ALT_ON;
                if (metaKey) metaState |= KeyEvent.META_META_ON;

                // Handle special keys via AccessibilityService global actions
                if (useAccessibilityService()) {
                    InputAccessibilityService service = InputAccessibilityService.getInstance();
                    if (handleGlobalKey(service, keyCode)) {
                        JSObject result = new JSObject();
                        result.put("success", true);
                        call.resolve(result);
                        Log.d(TAG, "Key down via accessibility global action: key=" + key);
                        return;
                    }
                    // For other keys, fall through to Instrumentation
                }

                // Instrumentation fallback for key events
                if (ctrlKey) {
                    KeyEvent ctrlDown = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_CTRL_LEFT, 0, KeyEvent.META_CTRL_ON);
                    instrumentation.sendKeySync(ctrlDown);
                }
                if (shiftKey) {
                    KeyEvent shiftDown = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SHIFT_LEFT, 0, KeyEvent.META_SHIFT_ON);
                    instrumentation.sendKeySync(shiftDown);
                }
                if (altKey) {
                    KeyEvent altDown = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ALT_LEFT, 0, KeyEvent.META_ALT_ON);
                    instrumentation.sendKeySync(altDown);
                }
                if (metaKey) {
                    KeyEvent metaDown = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_META_LEFT, 0, KeyEvent.META_META_ON);
                    instrumentation.sendKeySync(metaDown);
                }

                KeyEvent downEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0, metaState);
                instrumentation.sendKeySync(downEvent);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Key down executed: key=" + key + ", keyCode=" + keyCode + ", meta=" + metaState);
            } else {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Unknown key: " + key);
                call.resolve(result);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error executing key down: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeKeyUp(PluginCall call) {
        try {
            String key = call.getString("key", "");
            boolean ctrlKey = call.getBoolean("ctrlKey", false);
            boolean shiftKey = call.getBoolean("shiftKey", false);
            boolean altKey = call.getBoolean("altKey", false);
            boolean metaKey = call.getBoolean("metaKey", false);
            int keyCode = getKeyCode(key);

            if (keyCode != -1) {
                long downTime = SystemClock.uptimeMillis();
                long eventTime = SystemClock.uptimeMillis();

                int metaState = 0;
                if (ctrlKey) metaState |= KeyEvent.META_CTRL_ON;
                if (shiftKey) metaState |= KeyEvent.META_SHIFT_ON;
                if (altKey) metaState |= KeyEvent.META_ALT_ON;
                if (metaKey) metaState |= KeyEvent.META_META_ON;

                // Global action keys don't need key up
                if (useAccessibilityService() && isGlobalKey(keyCode)) {
                    JSObject result = new JSObject();
                    result.put("success", true);
                    call.resolve(result);
                    return;
                }

                // Instrumentation fallback for key events
                KeyEvent upEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0, metaState);
                instrumentation.sendKeySync(upEvent);

                if (metaKey) {
                    KeyEvent metaUp = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_META_LEFT, 0);
                    instrumentation.sendKeySync(metaUp);
                }
                if (altKey) {
                    KeyEvent altUp = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ALT_LEFT, 0);
                    instrumentation.sendKeySync(altUp);
                }
                if (shiftKey) {
                    KeyEvent shiftUp = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SHIFT_LEFT, 0);
                    instrumentation.sendKeySync(shiftUp);
                }
                if (ctrlKey) {
                    KeyEvent ctrlUp = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_CTRL_LEFT, 0);
                    instrumentation.sendKeySync(ctrlUp);
                }

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Key up executed: key=" + key + ", keyCode=" + keyCode);
            } else {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Unknown key: " + key);
                call.resolve(result);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error executing key up: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeLockScreen(PluginCall call) {
        try {
            if (useAccessibilityService() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                InputAccessibilityService service = InputAccessibilityService.getInstance();
                boolean success = service.lockScreen();

                JSObject result = new JSObject();
                result.put("success", success);
                result.put("message", "Screen lock requested via accessibility");
                call.resolve(result);
                Log.d(TAG, "Lock screen via accessibility");
                return;
            }

            // Fallback: Instrumentation
            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            KeyEvent downEvent = new KeyEvent(downTime, eventTime,
                KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_POWER, 0);
            KeyEvent upEvent = new KeyEvent(downTime, eventTime,
                KeyEvent.ACTION_UP, KeyEvent.KEYCODE_POWER, 0);

            instrumentation.sendKeySync(downEvent);
            instrumentation.sendKeySync(upEvent);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Screen lock requested");
            call.resolve(result);
            Log.d(TAG, "Lock screen executed");
        } catch (Exception e) {
            Log.e(TAG, "Error executing lock screen: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void executeUnlockScreen(PluginCall call) {
        try {
            String password = call.getString("password", "");
            Context context = getContext();

            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                    | PowerManager.ACQUIRE_CAUSES_WAKEUP
                    | PowerManager.ON_AFTER_RELEASE,
                    "YCDesk:UnlockScreen"
                );
                wl.acquire(3000);
                wl.release();
            }

            Window window = getActivity().getWindow();
            if (window != null) {
                @SuppressWarnings("deprecation")
                int flags = WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED;
                window.addFlags(flags);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Screen unlock requested");
            call.resolve(result);
            Log.d(TAG, "Unlock screen executed");
        } catch (Exception e) {
            Log.e(TAG, "Error executing unlock screen: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", InputAccessibilityService.isAvailable());
        call.resolve(result);
    }

    @PluginMethod
    public void setControlledMode(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        Log.d(TAG, "Controlled mode " + (enabled ? "enabled" : "disabled"));
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Handle keys that map to AccessibilityService global actions.
     * Returns true if the key was handled as a global action.
     */
    private boolean handleGlobalKey(InputAccessibilityService service, int keyCode) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            return service.goBack();
        } else if (keyCode == KeyEvent.KEYCODE_HOME) {
            return service.goHome();
        } else if (keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
            return service.openRecents();
        }
        return false;
    }

    /**
     * Check if a keyCode maps to a global action.
     */
    private boolean isGlobalKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_BACK
            || keyCode == KeyEvent.KEYCODE_HOME
            || keyCode == KeyEvent.KEYCODE_APP_SWITCH;
    }

    private int getKeyCode(String key) {
        switch (key) {
            case "Enter":
                return KeyEvent.KEYCODE_ENTER;
            case "Backspace":
                return KeyEvent.KEYCODE_DEL;
            case "Tab":
                return KeyEvent.KEYCODE_TAB;
            case "Escape":
                return KeyEvent.KEYCODE_ESCAPE;
            case "Space":
                return KeyEvent.KEYCODE_SPACE;
            case "ArrowUp":
                return KeyEvent.KEYCODE_DPAD_UP;
            case "ArrowDown":
                return KeyEvent.KEYCODE_DPAD_DOWN;
            case "ArrowLeft":
                return KeyEvent.KEYCODE_DPAD_LEFT;
            case "ArrowRight":
                return KeyEvent.KEYCODE_DPAD_RIGHT;
            case "Shift":
                return KeyEvent.KEYCODE_SHIFT_LEFT;
            case "Control":
                return KeyEvent.KEYCODE_CTRL_LEFT;
            case "Alt":
                return KeyEvent.KEYCODE_ALT_LEFT;
            case "Meta":
                return KeyEvent.KEYCODE_META_LEFT;
            case "F1":
                return KeyEvent.KEYCODE_F1;
            case "F2":
                return KeyEvent.KEYCODE_F2;
            case "F3":
                return KeyEvent.KEYCODE_F3;
            case "F4":
                return KeyEvent.KEYCODE_F4;
            case "F5":
                return KeyEvent.KEYCODE_F5;
            case "F6":
                return KeyEvent.KEYCODE_F6;
            case "F7":
                return KeyEvent.KEYCODE_F7;
            case "F8":
                return KeyEvent.KEYCODE_F8;
            case "F9":
                return KeyEvent.KEYCODE_F9;
            case "F10":
                return KeyEvent.KEYCODE_F10;
            case "F11":
                return KeyEvent.KEYCODE_F11;
            case "F12":
                return KeyEvent.KEYCODE_F12;
            case "Delete":
                return KeyEvent.KEYCODE_FORWARD_DEL;
            case "Home":
                return KeyEvent.KEYCODE_HOME;
            case "End":
                return KeyEvent.KEYCODE_MOVE_END;
            case "PageUp":
                return KeyEvent.KEYCODE_PAGE_UP;
            case "PageDown":
                return KeyEvent.KEYCODE_PAGE_DOWN;
            default:
                // Handle single characters
                if (key.length() == 1) {
                    char c = key.charAt(0);
                    if (c >= 'a' && c <= 'z') {
                        return KeyEvent.KEYCODE_A + (c - 'a');
                    } else if (c >= 'A' && c <= 'Z') {
                        return KeyEvent.KEYCODE_A + (c - 'A');
                    } else if (c >= '0' && c <= '9') {
                        return KeyEvent.KEYCODE_0 + (c - '0');
                    }
                }
                return -1;
        }
    }
}

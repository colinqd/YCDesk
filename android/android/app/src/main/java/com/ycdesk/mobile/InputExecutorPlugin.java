package com.ycdesk.mobile;

import android.app.Instrumentation;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;

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
        Log.d(TAG, "InputExecutorPlugin loaded");
    }

    @PluginMethod
    public void executeMouseMove(PluginCall call) {
        try {
            float x = (float) (double) call.getDouble("x", 0.0);
            float y = (float) (double) call.getDouble("y", 0.0);
            int screenWidth = call.getInt("screenWidth", 1920);
            int screenHeight = call.getInt("screenHeight", 1080);

            // Convert normalized coordinates to screen coordinates
            int absoluteX = (int) (x * screenWidth);
            int absoluteY = (int) (y * screenHeight);

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

            long downTime = SystemClock.uptimeMillis();
            long eventTime = SystemClock.uptimeMillis();

            int action = MotionEvent.ACTION_DOWN;
            if (button == 1) {
                // Middle button
                action = MotionEvent.ACTION_DOWN;
            } else if (button == 2) {
                // Right button
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

            // Use key events to simulate mouse wheel
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
            int keyCode = getKeyCode(key);

            if (keyCode != -1) {
                long downTime = SystemClock.uptimeMillis();
                long eventTime = SystemClock.uptimeMillis();

                KeyEvent downEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0);
                instrumentation.sendKeySync(downEvent);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Key down executed: key=" + key + ", keyCode=" + keyCode);
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
            int keyCode = getKeyCode(key);

            if (keyCode != -1) {
                long downTime = SystemClock.uptimeMillis();
                long eventTime = SystemClock.uptimeMillis();

                KeyEvent upEvent = new KeyEvent(downTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0);
                instrumentation.sendKeySync(upEvent);

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
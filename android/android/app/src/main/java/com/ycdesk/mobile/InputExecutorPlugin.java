package com.ycdesk.mobile;

import android.app.Activity;
import android.content.Context;
import android.graphics.Point;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "InputExecutor")
public class InputExecutorPlugin extends Plugin {
    private static final String TAG = "InputExecutorPlugin";
    private WindowManager windowManager;
    private int screenWidth;
    private int screenHeight;
    
    private boolean isControlled = false;
    private float lastX = 0;
    private float lastY = 0;
    private long lastDownTime = 0;
    private int lastButtonState = 0;

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        
        Point size = new Point();
        windowManager.getDefaultDisplay().getRealSize(size);
        screenWidth = size.x;
        screenHeight = size.y;
        
        Log.d(TAG, "InputExecutorPlugin loaded, screen size: " + screenWidth + "x" + screenHeight);
    }

    @PluginMethod
    public void setControlledMode(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        isControlled = enabled;
        
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("isControlled", isControlled);
        call.resolve(result);
        
        Log.d(TAG, "Controlled mode set to: " + isControlled);
    }

    @PluginMethod
    public void getScreenSize(PluginCall call) {
        JSObject result = new JSObject();
        result.put("width", screenWidth);
        result.put("height", screenHeight);
        call.resolve(result);
    }

    @PluginMethod
    public void executeInput(PluginCall call) {
        if (!isControlled) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Not in controlled mode");
            call.resolve(result);
            return;
        }

        try {
            String inputType = call.getString("inputType");
            JSObject result = new JSObject();

            switch (inputType) {
                case "mousemove":
                    executeMouseMove(call);
                    break;
                case "mousedown":
                    executeMouseDown(call);
                    break;
                case "mouseup":
                    executeMouseUp(call);
                    break;
                case "wheel":
                    executeWheel(call);
                    break;
                case "keydown":
                    executeKeyDown(call);
                    break;
                case "keyup":
                    executeKeyUp(call);
                    break;
                default:
                    result.put("success", false);
                    result.put("error", "Unknown input type: " + inputType);
                    call.resolve(result);
                    return;
            }

            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Execute input error: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    private void executeMouseMove(PluginCall call) {
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        
        if (x == null || y == null) return;
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        
        injectMotionEvent(MotionEvent.ACTION_HOVER_MOVE, targetX, targetY, lastButtonState);
        Log.d(TAG, "MouseMove: " + targetX + ", " + targetY);
    }

    private void executeMouseDown(PluginCall call) {
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        Integer button = call.getInt("button", 0);
        
        if (x == null || y == null) return;
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        lastDownTime = SystemClock.uptimeMillis();
        
        int buttonState = getButtonState(button);
        lastButtonState = buttonState;
        
        injectMotionEvent(MotionEvent.ACTION_DOWN, targetX, targetY, buttonState);
        Log.d(TAG, "MouseDown: " + targetX + ", " + targetY + ", button: " + button);
    }

    private void executeMouseUp(PluginCall call) {
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        Integer button = call.getInt("button", 0);
        
        if (x == null || y == null) return;
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        
        int buttonState = getButtonState(button);
        
        injectMotionEvent(MotionEvent.ACTION_UP, targetX, targetY, buttonState);
        lastButtonState = 0;
        Log.d(TAG, "MouseUp: " + targetX + ", " + targetY + ", button: " + button);
    }

    private void executeWheel(PluginCall call) {
        Double deltaY = call.getDouble("deltaY", 0.0);
        Double deltaX = call.getDouble("deltaX", 0.0);
        
        float scrollY = (float) (deltaY * 50);
        float scrollX = (float) (deltaX * 50);
        
        injectScrollEvent(lastX, lastY, scrollX, scrollY);
        Log.d(TAG, "Wheel: deltaY=" + deltaY + ", deltaX=" + deltaX);
    }

    private void executeKeyDown(PluginCall call) {
        String code = call.getString("code");
        String key = call.getString("key");
        
        Log.d(TAG, "KeyDown: code=" + code + ", key=" + key);
    }

    private void executeKeyUp(PluginCall call) {
        String code = call.getString("code");
        String key = call.getString("key");
        
        Log.d(TAG, "KeyUp: code=" + code + ", key=" + key);
    }

    private int getButtonState(int button) {
        switch (button) {
            case 0:
                return MotionEvent.BUTTON_PRIMARY;
            case 1:
                return MotionEvent.BUTTON_TERTIARY;
            case 2:
                return MotionEvent.BUTTON_SECONDARY;
            default:
                return MotionEvent.BUTTON_PRIMARY;
        }
    }

    private void injectMotionEvent(int action, float x, float y, int buttonState) {
        long downTime = lastDownTime > 0 ? lastDownTime : SystemClock.uptimeMillis();
        long eventTime = SystemClock.uptimeMillis();
        
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[1];
        properties[0] = new MotionEvent.PointerProperties();
        properties[0].id = 0;
        properties[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[1];
        coords[0] = new MotionEvent.PointerCoords();
        coords[0].x = x;
        coords[0].y = y;
        coords[0].pressure = 1.0f;
        coords[0].size = 1.0f;
        
        MotionEvent event = MotionEvent.obtain(
            downTime,
            eventTime,
            action,
            1,
            properties,
            coords,
            0,
            buttonState,
            1.0f,
            1.0f,
            0,
            0,
            InputDevice.SOURCE_MOUSE,
            0
        );
        
        try {
            Activity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> {
                    View rootView = activity.getWindow().getDecorView().getRootView();
                    boolean handled = rootView.dispatchGenericMotionEvent(event);
                    Log.d(TAG, "Motion event dispatched, handled: " + handled);
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Inject motion event error: " + e.getMessage());
        }
        
        event.recycle();
    }

    private void injectScrollEvent(float x, float y, float scrollX, float scrollY) {
        long downTime = SystemClock.uptimeMillis();
        long eventTime = SystemClock.uptimeMillis();
        
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[1];
        properties[0] = new MotionEvent.PointerProperties();
        properties[0].id = 0;
        properties[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[1];
        coords[0] = new MotionEvent.PointerCoords();
        coords[0].x = x;
        coords[0].y = y;
        coords[0].pressure = 1.0f;
        coords[0].size = 1.0f;
        coords[0].setAxisValue(MotionEvent.AXIS_VSCROLL, -scrollY / 100);
        coords[0].setAxisValue(MotionEvent.AXIS_HSCROLL, scrollX / 100);
        
        MotionEvent event = MotionEvent.obtain(
            downTime,
            eventTime,
            MotionEvent.ACTION_SCROLL,
            1,
            properties,
            coords,
            0,
            0,
            1.0f,
            1.0f,
            0,
            0,
            InputDevice.SOURCE_MOUSE,
            0
        );
        
        try {
            Activity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> {
                    View rootView = activity.getWindow().getDecorView().getRootView();
                    boolean handled = rootView.dispatchGenericMotionEvent(event);
                    Log.d(TAG, "Scroll event dispatched, handled: " + handled);
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Inject scroll event error: " + e.getMessage());
        }
        
        event.recycle();
    }

    public void handleInputCommand(JSONObject inputData) {
        if (!isControlled) {
            Log.d(TAG, "Not in controlled mode, ignoring input");
            return;
        }

        try {
            String inputType = inputData.getString("inputType");
            
            switch (inputType) {
                case "mousemove":
                    handleMouseMove(inputData);
                    break;
                case "mousedown":
                    handleMouseDown(inputData);
                    break;
                case "mouseup":
                    handleMouseUp(inputData);
                    break;
                case "wheel":
                    handleWheel(inputData);
                    break;
                case "keydown":
                    handleKeyDown(inputData);
                    break;
                case "keyup":
                    handleKeyUp(inputData);
                    break;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Handle input command error: " + e.getMessage());
        }
    }

    private void handleMouseMove(JSONObject data) throws JSONException {
        double x = data.optDouble("x", 0);
        double y = data.optDouble("y", 0);
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        
        injectMotionEvent(MotionEvent.ACTION_HOVER_MOVE, targetX, targetY, lastButtonState);
    }

    private void handleMouseDown(JSONObject data) throws JSONException {
        double x = data.optDouble("x", 0);
        double y = data.optDouble("y", 0);
        int button = data.optInt("button", 0);
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        lastDownTime = SystemClock.uptimeMillis();
        lastButtonState = getButtonState(button);
        
        injectMotionEvent(MotionEvent.ACTION_DOWN, targetX, targetY, lastButtonState);
    }

    private void handleMouseUp(JSONObject data) throws JSONException {
        double x = data.optDouble("x", 0);
        double y = data.optDouble("y", 0);
        int button = data.optInt("button", 0);
        
        float targetX = (float) (x * screenWidth);
        float targetY = (float) (y * screenHeight);
        
        lastX = targetX;
        lastY = targetY;
        
        int buttonState = getButtonState(button);
        injectMotionEvent(MotionEvent.ACTION_UP, targetX, targetY, buttonState);
        lastButtonState = 0;
    }

    private void handleWheel(JSONObject data) throws JSONException {
        double deltaY = data.optDouble("deltaY", 0);
        double deltaX = data.optDouble("deltaX", 0);
        
        injectScrollEvent(lastX, lastY, (float)deltaX, (float)deltaY);
    }

    private void handleKeyDown(JSONObject data) throws JSONException {
        String code = data.optString("code", "");
        String key = data.optString("key", "");
        Log.d(TAG, "KeyDown: code=" + code + ", key=" + key);
    }

    private void handleKeyUp(JSONObject data) throws JSONException {
        String code = data.optString("code", "");
        String key = data.optString("key", "");
        Log.d(TAG, "KeyUp: code=" + code + ", key=" + key);
    }
}

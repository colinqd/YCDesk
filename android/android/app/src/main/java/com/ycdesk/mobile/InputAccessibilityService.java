package com.ycdesk.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

public class InputAccessibilityService extends AccessibilityService {
    private static final String TAG = "InputAccessibilityService";
    private static InputAccessibilityService instance;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.d(TAG, "AccessibilityService connected");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
        Log.d(TAG, "AccessibilityService destroyed");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Not needed for input injection
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "AccessibilityService interrupted");
    }

    public static InputAccessibilityService getInstance() {
        return instance;
    }

    public static boolean isAvailable() {
        return instance != null;
    }

    /**
     * Perform a click at the specified screen coordinates.
     */
    public boolean dispatchClick(float x, float y) {
        Path clickPath = new Path();
        clickPath.moveTo(x, y);

        long startTime = 0;
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(clickPath, startTime, 50);
        GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();

        return dispatchGesture(gesture, null, null);
    }

    /**
     * Perform a long click at the specified screen coordinates.
     */
    public boolean dispatchLongClick(float x, float y) {
        Path clickPath = new Path();
        clickPath.moveTo(x, y);

        long startTime = 0;
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(clickPath, startTime, 500);
        GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();

        return dispatchGesture(gesture, null, null);
    }

    /**
     * Perform a swipe gesture from (startX, startY) to (endX, endY).
     */
    public boolean dispatchSwipe(float startX, float startY, float endX, float endY, long duration) {
        Path swipePath = new Path();
        swipePath.moveTo(startX, startY);
        swipePath.lineTo(endX, endY);

        long startTime = 0;
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(swipePath, startTime, duration);
        GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();

        return dispatchGesture(gesture, null, null);
    }

    /**
     * Perform a scroll gesture (vertical swipe).
     * Positive deltaY scrolls down, negative deltaY scrolls up.
     */
    public boolean dispatchScroll(float x, float y, float deltaY) {
        float scrollDistance = deltaY * 50; // Scale delta to pixel distance
        return dispatchSwipe(x, y, x, y - scrollDistance, 300);
    }

    /**
     * Perform a mouse move (hover) gesture.
     * Since dispatchGesture only supports touch gestures, we simulate a quick tap-and-move.
     */
    public boolean dispatchMove(float x, float y) {
        // AccessibilityService dispatchGesture doesn't support hover events directly.
        // We use a very short touch at the target position as a workaround.
        // For actual mouse cursor movement, the floating overlay cursor is used instead.
        Path movePath = new Path();
        movePath.moveTo(x, y);

        long startTime = 0;
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(movePath, startTime, 10);
        GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();

        return dispatchGesture(gesture, null, null);
    }

    /**
     * Perform a drag gesture from (startX, startY) to (endX, endY).
     */
    public boolean dispatchDrag(float startX, float startY, float endX, float endY) {
        return dispatchSwipe(startX, startY, endX, endY, 500);
    }

    /**
     * Go back (global action).
     */
    public boolean goBack() {
        return super.performGlobalAction(GLOBAL_ACTION_BACK);
    }

    /**
     * Go home (global action).
     */
    public boolean goHome() {
        return super.performGlobalAction(GLOBAL_ACTION_HOME);
    }

    /**
     * Open recents (global action).
     */
    public boolean openRecents() {
        return super.performGlobalAction(GLOBAL_ACTION_RECENTS);
    }

    /**
     * Open notifications (global action).
     */
    public boolean openNotifications() {
        return super.performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
    }

    /**
     * Open quick settings (global action).
     */
    public boolean openQuickSettings() {
        return super.performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS);
    }

    /**
     * Lock the screen (global action, requires API 28+).
     */
    public boolean lockScreen() {
        return super.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
    }
}

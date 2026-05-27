package com.ycdesk.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Bundle;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

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

    /**
     * Set text directly on the currently focused input field.
     * Uses AccessibilityNodeInfo.ACTION_SET_TEXT to insert text.
     * Supports all characters including CJK.
     *
     * @param text The text to insert
     * @return true if text was successfully set
     */
    public boolean setTextToFocusedNode(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }

        try {
            // Find the focused node (e.g., an EditText field)
            AccessibilityNodeInfo focusedNode = findFocusedNode();
            if (focusedNode == null) {
                Log.d(TAG, "setTextToFocusedNode: no focused node found, trying root");
                // Try to find any editable node
                AccessibilityNodeInfo root = getRootInActiveWindow();
                if (root != null) {
                    focusedNode = findEditableNode(root);
                    root.recycle();
                }
            }

            if (focusedNode == null) {
                Log.d(TAG, "setTextToFocusedNode: no editable node found");
                return false;
            }

            // Set text using ACTION_SET_TEXT
            Bundle arguments = new Bundle();
            arguments.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text
            );

            boolean result = focusedNode.performAction(
                AccessibilityNodeInfo.ACTION_SET_TEXT,
                arguments
            );

            focusedNode.recycle();

            if (result) {
                Log.d(TAG, "setTextToFocusedNode: text set successfully, length=" + text.length());
            } else {
                Log.d(TAG, "setTextToFocusedNode: ACTION_SET_TEXT returned false");
            }

            return result;
        } catch (Exception e) {
            Log.e(TAG, "setTextToFocusedNode error: " + e.getMessage());
            return false;
        }
    }

    /**
     * Find the currently focused accessibility node.
     */
    private AccessibilityNodeInfo findFocusedNode() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return null;
        }
        try {
            AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (focused == null) {
                focused = root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
            }
            return focused;
        } finally {
            root.recycle();
        }
    }

    /**
     * Recursively find an editable node in the accessibility tree.
     */
    private AccessibilityNodeInfo findEditableNode(AccessibilityNodeInfo node) {
        if (node == null) {
            return null;
        }

        if (node.isEditable() && node.isFocused()) {
            return node;
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo result = findEditableNode(child);
                // Don't recycle child if it's the result we're returning
                if (result == child) {
                    return result;
                }
                if (result != null) {
                    child.recycle();
                    return result;
                }
                child.recycle();
            }
        }

        return null;
    }
}

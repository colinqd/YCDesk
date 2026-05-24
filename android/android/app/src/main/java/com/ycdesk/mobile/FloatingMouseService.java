package com.ycdesk.mobile;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.ycdesk.mobile.R;

public class FloatingMouseService extends Service {
    private static final String TAG = "FloatingMouseService";
    private static final String CHANNEL_ID = "floating_mouse_channel";
    private static final int NOTIFICATION_ID = 1;
    private static final int MAX_CLICK_DISTANCE = 10;
    private static final int LONG_PRESS_TIMEOUT = 500;
    private static final int SCROLL_THRESHOLD = 10;

    private WindowManager windowManager;
    private View floatingView;
    private View minimizedView;
    private View leftButton;
    private View rightButton;
    private View scrollArea;
    private View dragHandle;
    private View closeBtn;
    private View minimizeBtn;
    private TextView scrollIndicator;

    private int screenWidth;
    private int screenHeight;
    private float sensitivity = 1.0f;

    private float touchStartX = 0;
    private float touchStartY = 0;
    private float lastTouchX = 0;
    private float lastTouchY = 0;
    private long touchStartTime = 0;
    private boolean isDragging = false;
    private int currentButton = -1;
    private boolean isScrolling = false;
    private float scrollStartY = 0;
    private float scrollAccumulator = 0;
    private boolean isMinimized = false;

    // 悬浮窗位置
    private int windowX = 0;
    private int windowY = 0;
    private int windowWidth = 300;
    private int windowHeight = 300;

    private Handler handler = new Handler(Looper.getMainLooper());
    private Runnable longPressRunnable;

    private OnMouseEventListener mouseEventListener;

    public interface OnMouseEventListener {
        void onMouseMove(float x, float y);
        void onMouseDown(int button, float x, float y);
        void onMouseUp(int button, float x, float y);
        void onScroll(float delta);
        void onDoubleClick(int button, float x, float y);
        void onDragStart(int button, float x, float y);
        void onDragEnd(int button, float x, float y);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Log.d(TAG, "FloatingMouseService created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "FloatingMouseService started");
        
        // 启动前台服务
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);
        Log.d(TAG, "前台服务已启动");
        
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "悬浮鼠标服务",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("远程控制悬浮鼠标服务");
            channel.setShowBadge(false);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                Log.d(TAG, "通知渠道已创建");
            }
        }
    }

    private Notification createNotification() {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("YCDesk 远程控制")
            .setContentText("悬浮鼠标服务运行中")
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setShowWhen(false);
        
        return builder.build();
    }

    @Override
    public IBinder onBind(android.content.Intent intent) {
        return new LocalBinder();
    }

    public class LocalBinder extends android.os.Binder {
        public FloatingMouseService getService() {
            return FloatingMouseService.this;
        }
    }

    public void setOnMouseEventListener(OnMouseEventListener listener) {
        this.mouseEventListener = listener;
    }

    public void setScreenSize(int width, int height) {
        this.screenWidth = width;
        this.screenHeight = height;
        this.windowX = width / 2;
        this.windowY = height / 2;
    }

    public void setSensitivity(float sensitivity) {
        this.sensitivity = Math.max(0.1f, Math.min(3.0f, sensitivity));
    }

    @SuppressLint("ClickableViewAccessibility")
    public void showFloatingMouse() {
        Log.d(TAG, "showFloatingMouse called, floatingView=" + floatingView);
        
        if (floatingView != null) {
            Log.d(TAG, "悬浮窗已存在，跳过创建");
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) {
            Log.e(TAG, "无法获取WindowManager服务");
            return;
        }
        
        Point size = getRealScreenSize(windowManager);
        screenWidth = size.x;
        screenHeight = size.y;
        windowX = screenWidth / 2;
        windowY = 200;

        Log.d(TAG, "屏幕尺寸: " + screenWidth + "x" + screenHeight);
        Log.d(TAG, "开始创建悬浮窗...");

        try {
            createFloatingView();
            Log.d(TAG, "悬浮窗创建成功");
        } catch (Exception e) {
            Log.e(TAG, "创建悬浮窗失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void hideFloatingMouse() {
        Log.d(TAG, "hideFloatingMouse called");
        if (floatingView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
                floatingView = null;
                Log.d(TAG, "悬浮窗已移除");
            } catch (Exception e) {
                Log.e(TAG, "移除悬浮窗失败: " + e.getMessage());
            }
        }
        if (minimizedView != null && windowManager != null) {
            try {
                windowManager.removeView(minimizedView);
                minimizedView = null;
                Log.d(TAG, "最小化视图已移除");
            } catch (Exception e) {
                Log.e(TAG, "移除最小化视图失败: " + e.getMessage());
            }
        }
        isMinimized = false;
    }

    public boolean isShowing() {
        return floatingView != null || minimizedView != null;
    }

    public int[] getMousePosition() {
        return new int[] { windowX, windowY };
    }

    public int[] getScreenSize() {
        return new int[] { screenWidth, screenHeight };
    }

    @SuppressLint("ClickableViewAccessibility")
    private void createFloatingView() {
        @SuppressWarnings("deprecation")
        int layoutFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        // 主悬浮窗 - 加大尺寸到 300x300
        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            300,
            300,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = screenWidth / 2 - 150;
        params.y = 200;
        
        // 初始化鼠标位置为悬浮窗左上角
        windowX = params.x;
        windowY = params.y;

        Log.d(TAG, "悬浮窗参数: x=" + params.x + ", y=" + params.y + ", width=" + params.width + ", height=" + params.height);

        floatingView = createMouseView();
        
        setupDragHandle(params);
        setupLeftButton();
        setupRightButton();
        setupScrollArea();
        setupCloseButton();
        setupMinimizeButton();

        windowManager.addView(floatingView, params);
        Log.d(TAG, "悬浮窗已添加到WindowManager");
    }

    private View createMouseView() {
        Log.d(TAG, "开始创建悬浮鼠标UI...");
        
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(0x00000000);

        LinearLayout mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setPadding(10, 10, 10, 10);
        
        // 透明背景
        GradientDrawable mainBg = new GradientDrawable();
        mainBg.setColor(0x00000000);
        mainBg.setCornerRadius(25);
        mainBg.setStroke(2, 0x00000000);
        mainLayout.setBackground(mainBg);

        // 主内容区域
        LinearLayout contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        contentLayout.setLayoutParams(contentParams);

        // Scroll area (top) - 灰色
        scrollArea = new View(this);
        GradientDrawable scrollBg = new GradientDrawable();
        scrollBg.setColor(0x80000000); // 50%透明
        scrollBg.setCornerRadius(12);
        scrollArea.setBackground(scrollBg);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 50
        );
        scrollParams.setMargins(5, 5, 5, 5);
        scrollArea.setLayoutParams(scrollParams);
        contentLayout.addView(scrollArea);
        Log.d(TAG, "滚轮区域已创建");

        // Button area (middle) - 加大高度
        LinearLayout buttonLayout = new LinearLayout(this);
        buttonLayout.setOrientation(LinearLayout.HORIZONTAL);
        buttonLayout.setWeightSum(2);
        LinearLayout.LayoutParams buttonLayoutParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 100
        );
        buttonLayoutParams.setMargins(0, 5, 0, 5);
        buttonLayout.setLayoutParams(buttonLayoutParams);

        // Left button - 蓝色
        leftButton = new View(this);
        GradientDrawable leftBg = new GradientDrawable();
        leftBg.setColor(0x60808080); // 更透明
        leftBg.setCornerRadius(12);
        leftButton.setBackground(leftBg);
        LinearLayout.LayoutParams leftParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1);
        leftParams.setMargins(5, 0, 5, 0);
        leftButton.setLayoutParams(leftParams);
        buttonLayout.addView(leftButton);
        Log.d(TAG, "左键区域已创建");

        // Right button - 红色
        rightButton = new View(this);
        GradientDrawable rightBg = new GradientDrawable();
        rightBg.setColor(0x60808080); // 更透明
        rightBg.setCornerRadius(12);
        rightButton.setBackground(rightBg);
        LinearLayout.LayoutParams rightParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1);
        rightParams.setMargins(5, 0, 5, 0);
        rightButton.setLayoutParams(rightParams);
        buttonLayout.addView(rightButton);
        Log.d(TAG, "右键区域已创建");

        contentLayout.addView(buttonLayout);

        // Drag handle (bottom) - 绿色
        dragHandle = new View(this);
        GradientDrawable dragBg = new GradientDrawable();
        dragBg.setColor(0x60808080); // 更透明
        dragBg.setCornerRadius(12);
        dragHandle.setBackground(dragBg);
        LinearLayout.LayoutParams dragParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 80
        );
        dragParams.setMargins(5, 5, 5, 5);
        dragHandle.setLayoutParams(dragParams);
        contentLayout.addView(dragHandle);
        Log.d(TAG, "拖动区域已创建");

        mainLayout.addView(contentLayout);

        // Close button - 右上角
        ImageView closeImageView = new ImageView(this);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(0x80FFFFFF); // 半透明白色
        closeBg.setCornerRadius(15);
        closeImageView.setBackground(closeBg);
        closeImageView.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeImageView.setColorFilter(0xFFE74c3c);
        closeBtn = closeImageView;
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(40, 40);
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.setMargins(0, 5, 5, 0);
        closeBtn.setLayoutParams(closeParams);
        Log.d(TAG, "关闭按钮已创建");

        // Minimize button - 右上角第二个
        ImageView minimizeImageView = new ImageView(this);
        GradientDrawable minBg = new GradientDrawable();
        minBg.setColor(0x80FFFFFF);
        minBg.setCornerRadius(15);
        minimizeImageView.setBackground(minBg);
        minimizeImageView.setImageResource(android.R.drawable.ic_menu_add);
        minimizeImageView.setRotation(45); // 旋转45度变成减号效果
        minimizeImageView.setColorFilter(0xFF667eea);
        minimizeBtn = minimizeImageView;
        FrameLayout.LayoutParams minParams = new FrameLayout.LayoutParams(40, 40);
        minParams.gravity = Gravity.TOP | Gravity.END;
        minParams.setMargins(0, 5, 50, 0);
        minimizeBtn.setLayoutParams(minParams);
        Log.d(TAG, "最小化按钮已创建");

        // Scroll indicator
        scrollIndicator = new TextView(this);
        scrollIndicator.setTextColor(0xFFFFFFFF);
        scrollIndicator.setTextSize(16);
        scrollIndicator.setGravity(Gravity.CENTER);
        scrollIndicator.setText("━");
        scrollIndicator.setShadowLayer(2, 1, 1, 0xFF000000);
        FrameLayout.LayoutParams indicatorParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        indicatorParams.gravity = Gravity.CENTER;
        scrollIndicator.setLayoutParams(indicatorParams);

        container.addView(mainLayout);
        container.addView(scrollIndicator);
        container.addView(closeBtn);
        container.addView(minimizeBtn);

        // 鼠标指针图标 - 位于悬浮窗左上角
        ImageView mousePointer = new ImageView(this);
        mousePointer.setImageResource(R.drawable.cursor_pointer);
        FrameLayout.LayoutParams pointerParams = new FrameLayout.LayoutParams(48, 48);
        pointerParams.gravity = Gravity.TOP | Gravity.START;
        pointerParams.setMargins(-8, -8, 0, 0);
        mousePointer.setLayoutParams(pointerParams);
        container.addView(mousePointer);
        Log.d(TAG, "鼠标指针图标已创建");

        Log.d(TAG, "悬浮鼠标UI创建完成");
        return container;
    }

    private void setupMinimizeButton() {
        minimizeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Log.d(TAG, "最小化按钮点击");
                minimizeFloatingMouse();
            }
        });
    }

    @SuppressLint("ClickableViewAccessibility")
    private void minimizeFloatingMouse() {
        if (floatingView == null || windowManager == null) return;
        
        // 移除主视图
        windowManager.removeView(floatingView);
        floatingView = null;
        isMinimized = true;
        
        // 创建最小化视图
        @SuppressWarnings("deprecation")
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
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = screenWidth - 100;
        params.y = 200;

        minimizedView = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x80667eea);
        bg.setCornerRadius(30);
        minimizedView.setBackground(bg);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.cursor_pointer);
        icon.setRotation(135);
        icon.setColorFilter(0xFFFFFFFF);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(30, 30);
        iconParams.gravity = Gravity.CENTER;
        icon.setLayoutParams(iconParams);
        ((FrameLayout) minimizedView).addView(icon);

        minimizedView.setOnTouchListener(new View.OnTouchListener() {
            private float lastX, lastY;
            
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        lastX = event.getRawX();
                        lastY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_UP:
                        // 单击恢复
                        restoreFloatingMouse();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - lastX;
                        float dy = event.getRawY() - lastY;
                        params.x += (int) dx;
                        params.y += (int) dy;
                        windowManager.updateViewLayout(minimizedView, params);
                        lastX = event.getRawX();
                        lastY = event.getRawY();
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(minimizedView, params);
        Log.d(TAG, "悬浮窗已最小化");
    }

    private void restoreFloatingMouse() {
        if (minimizedView != null && windowManager != null) {
            windowManager.removeView(minimizedView);
            minimizedView = null;
        }
        isMinimized = false;
        showFloatingMouse();
        Log.d(TAG, "悬浮窗已恢复");
    }

    private void setupDragHandle(final WindowManager.LayoutParams params) {
        final float[] lastX = {0};
        final float[] lastY = {0};
        
        dragHandle.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        lastX[0] = event.getRawX();
                        lastY[0] = event.getRawY();
                        Log.d(TAG, "拖动区域按下");
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - lastX[0];
                        float dy = event.getRawY() - lastY[0];
                        params.x += (int) dx;
                        params.y += (int) dy;
                        // 同步更新鼠标位置
                        windowX = params.x;
                        windowY = params.y;
                        windowManager.updateViewLayout(floatingView, params);
                        lastX[0] = event.getRawX();
                        lastY[0] = event.getRawY();
                        return true;

                    case MotionEvent.ACTION_UP:
                        // 同步更新鼠标位置
                        windowX = params.x;
                        windowY = params.y;
                        Log.d(TAG, "拖动区域释放，位置: " + params.x + ", " + params.y);
                        return true;
                }
                return false;
            }
        });
    }

    private void setupLeftButton() {
        leftButton.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                return handleButtonTouch(event, 0);
            }
        });
    }

    private void setupRightButton() {
        rightButton.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                return handleButtonTouch(event, 2);
            }
        });
    }

    private boolean handleButtonTouch(MotionEvent event, final int button) {
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                touchStartX = event.getX();
                touchStartY = event.getY();
                lastTouchX = event.getX();
                lastTouchY = event.getY();
                touchStartTime = System.currentTimeMillis();
                currentButton = button;

                // Visual feedback - 高亮
                if (button == 0) {
                    GradientDrawable leftBg = new GradientDrawable();
                    leftBg.setColor(0xFF4285f4);
                    leftBg.setCornerRadius(12);
                    leftButton.setBackground(leftBg);
                    Log.d(TAG, "左键按下");
                } else {
                    GradientDrawable rightBg = new GradientDrawable();
                    rightBg.setColor(0xFFea4335);
                    rightBg.setCornerRadius(12);
                    rightButton.setBackground(rightBg);
                    Log.d(TAG, "右键按下");
                }

                // Long press detection for drag
                longPressRunnable = new Runnable() {
                    @Override
                    public void run() {
                        isDragging = true;
                        Log.d(TAG, "长按触发拖拽模式");
                        if (mouseEventListener != null) {
                            // 发送像素坐标而不是归一化坐标
                            mouseEventListener.onDragStart(button, windowX, windowY);
                        }
                    }
                };
                handler.postDelayed(longPressRunnable, LONG_PRESS_TIMEOUT);
                return true;

            case MotionEvent.ACTION_MOVE:
                if (isDragging) {
                    float dx = (event.getX() - lastTouchX) * sensitivity;
                    float dy = (event.getY() - lastTouchY) * sensitivity;
                    // 移动悬浮窗位置
                    windowX = Math.max(0, Math.min(screenWidth, windowX + (int)dx));
                    windowY = Math.max(0, Math.min(screenHeight, windowY + (int)dy));
                    if (mouseEventListener != null) {
                        // 发送像素坐标而不是归一化坐标
                        mouseEventListener.onMouseMove(windowX, windowY);
                    }
                }
                lastTouchX = event.getX();
                lastTouchY = event.getY();
                return true;

            case MotionEvent.ACTION_UP:
                handler.removeCallbacks(longPressRunnable);
                
                // Reset visual - 恢复
                if (button == 0) {
                    GradientDrawable leftBg = new GradientDrawable();
                    leftBg.setColor(0x604285f4);
                    leftBg.setCornerRadius(12);
                    leftButton.setBackground(leftBg);
                } else {
                    GradientDrawable rightBg = new GradientDrawable();
                    rightBg.setColor(0x60ea4335);
                    rightBg.setCornerRadius(12);
                    rightButton.setBackground(rightBg);
                }

                long duration = System.currentTimeMillis() - touchStartTime;
                float distance = (float) Math.sqrt(
                    Math.pow(event.getX() - touchStartX, 2) +
                    Math.pow(event.getY() - touchStartY, 2)
                );

                // 发送像素坐标而不是归一化坐标
                int pixelX = windowX;
                int pixelY = windowY;

                if (isDragging) {
                    isDragging = false;
                    Log.d(TAG, "拖拽结束");
                    if (mouseEventListener != null) {
                        mouseEventListener.onDragEnd(button, pixelX, pixelY);
                    }
                } else if (distance < MAX_CLICK_DISTANCE) {
                    if (duration < 200) {
                        Log.d(TAG, "单击 button=" + button);
                        if (mouseEventListener != null) {
                            mouseEventListener.onMouseDown(button, pixelX, pixelY);
                            mouseEventListener.onMouseUp(button, pixelX, pixelY);
                        }
                    } else if (duration < 400) {
                        Log.d(TAG, "双击 button=" + button);
                        if (mouseEventListener != null) {
                            mouseEventListener.onDoubleClick(button, pixelX, pixelY);
                        }
                    }
                }

                currentButton = -1;
                return true;
        }
        return false;
    }

    private void setupScrollArea() {
        scrollArea.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        scrollStartY = event.getY();
                        scrollAccumulator = 0;
                        isScrolling = true;
                        scrollIndicator.setText("━");
                        Log.d(TAG, "滚轮区域按下");
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        if (isScrolling) {
                            float delta = scrollStartY - event.getY();
                            scrollAccumulator += delta;
                            
                            if (Math.abs(scrollAccumulator) > SCROLL_THRESHOLD) {
                                if (mouseEventListener != null) {
                                    mouseEventListener.onScroll(scrollAccumulator);
                                }
                                
                                if (scrollAccumulator > 0) {
                                    scrollIndicator.setText("▲ " + (int)scrollAccumulator);
                                } else {
                                    scrollIndicator.setText("▼ " + (int)Math.abs(scrollAccumulator));
                                }
                                
                                scrollAccumulator = 0;
                            }
                            scrollStartY = event.getY();
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        isScrolling = false;
                        scrollIndicator.setText("━");
                        Log.d(TAG, "滚轮区域释放");
                        return true;
                }
                return false;
            }
        });
    }

    private void setupCloseButton() {
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Log.d(TAG, "关闭按钮点击");
                hideFloatingMouse();
            }
        });
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingView != null && windowManager != null) {
            windowManager.removeView(floatingView);
        }
        if (minimizedView != null && windowManager != null) {
            windowManager.removeView(minimizedView);
        }
        Log.d(TAG, "FloatingMouseService destroyed");
    }

    @SuppressWarnings("deprecation")
    @NonNull
    private Point getRealScreenSize(@NonNull WindowManager wm) {
        Point size = new Point();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            var bounds = wm.getCurrentWindowMetrics().getBounds();
            size.x = bounds.width();
            size.y = bounds.height();
        } else {
            wm.getDefaultDisplay().getRealSize(size);
        }
        return size;
    }
}

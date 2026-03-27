# YCDesk Android 端架构重新设计方案（完整版）

## 目录
1. [问题分析](#问题分析)
2. [完整架构设计](#完整架构设计)
3. [矩阵变换法详解](#矩阵变换法详解)
4. [虚拟鼠标/键盘层次与数据流](#虚拟鼠标键盘层次与数据流)
5. [核心类设计](#核心类设计)
6. [坐标转换数学模型](#坐标转换数学模型)
7. [实现步骤](#实现步骤)
8. [关键代码示例](#关键代码示例)

---

## 问题分析

### 1.1 现有问题
- **坐标计算混乱**：在 `setupTouchEvents()` 中，坐标计算依赖于 `remoteVideo.getBoundingClientRect()`，没有正确结合 `panX`、`panY` 和 `currentScale`
- **缺少统一的坐标系模型**：没有建立完整的转换链
- **层次结构不清晰**：虚拟鼠标/键盘位置不明确，数据流分散
- **缺少 PointerId 跟踪**：没有像 RustDesk 那样使用 `getPointerId()` 跟踪多手指
- **缩放中心点漂移**：缩放时没有保持中心点不变的数学公式

---

## 完整架构设计

### 2.1 系统整体层次结构

```
┌─────────────────────────────────────────────────────────────────────┐
│  System Window Layer (系统窗口层) - WindowManager                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FloatingKeyboardService (悬浮键盘)                            │  │
│  │  - TYPE_APPLICATION_OVERLAY                                     │  │
│  │  - z-order: ABOVE_ALL_APPLICATIONS                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FloatingMouseService (悬浮鼠标)                               │  │
│  │  - TYPE_APPLICATION_OVERLAY                                     │  │
│  │  - z-order: ABOVE_APPLICATIONS                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 数据流方向
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  App Layer (应用层)                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  ControlOverlay (控制按钮层) - z-index: 100                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  GestureHandlerLayer (手势处理层) - z-index: 50             │  │
│  │  - 监听所有 touch event                                        │  │
│  │  - 使用 PointerId 跟踪手指                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  VideoTransformLayer (视频变换层) - z-index: 10             │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  VideoWrapper (视频包装层)                               │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │  VideoElement (视频元素)                           │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流架构图

```
┌───────────────────────────────────────────────────────────────────────┐
│  输入源层                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐                  │
│  │  FloatingMouseService │    │  GestureHandlerLayer  │                  │
│  │  (悬浮鼠标)           │    │  (触摸手势)           │                  │
│  └──────────┬───────────┘    └──────────┬───────────┘                  │
│             │                            │                                │
│             └──────────────┬─────────────┘                                │
│                            ↓                                                │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │  InputDispatcher (输入分发器) - 新增                                │    │
│  │  - 统一接收所有输入事件                                             │    │
│  │  - 输入去重、缓冲、优先级处理                                       │    │
│  └───────────────────────────────┬───────────────────────────────────┘    │
│                                  ↓                                        │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │  MatrixTransformer (矩阵变换器) - 核心！                            │    │
│  │  - 管理完整的变换矩阵链                                             │    │
│  │  - 提供双向坐标转换 API                                             │    │
│  └───────────────────────────────┬───────────────────────────────────┘    │
│                                  ↓                                        │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │  InputProtocol (输入协议层)                                         │    │
│  │  - 封装为标准化输入事件                                             │    │
│  │  - 添加时间戳、序列号                                               │    │
│  └───────────────────────────────┬───────────────────────────────────┘    │
│                                  ↓                                        │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │  TransportLayer (传输层)                                            │    │
│  │  - DataChannel / WebSocket                                         │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                  ↓                                        │
│                        ┌─────────────────┐                              │
│                        │  Remote Server  │                              │
│                        └─────────────────┘                              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 矩阵变换法详解

### 3.1 为什么选择矩阵变换法？

**矩阵变换法的优势：**
1. **数学严谨**：线性代数标准，易于验证和调试
2. **易于组合**：多个变换可以通过矩阵乘法组合
3. **支持扩展**：未来可以轻松添加旋转、镜像、斜切等变换
4. **业界标准**：OpenGL、Canvas、CSS Transform 都是用矩阵
5. **双向可逆**：可以计算逆矩阵实现反向转换

### 3.2 2D 变换矩阵基础

在 2D 空间中，我们使用 3x3 齐次变换矩阵：

```
[ a  b  c ]
[ d  e  f ]
[ 0  0  1 ]
```

其中：
- (a, b, d, e)：负责缩放、旋转、斜切
- (c, f)：负责平移

### 3.3 基本变换矩阵

#### 3.3.1 平移矩阵 (Translation)
```
[ 1  0  tx ]
[ 0  1  ty ]
[ 0  0  1  ]
```

#### 3.3.2 缩放矩阵 (Scaling)
```
[ sx  0   0 ]
[ 0   sy  0 ]
[ 0   0   1 ]
```

#### 3.3.3 旋转矩阵 (Rotation)
```
[ cosθ  -sinθ  0 ]
[ sinθ   cosθ  0 ]
[ 0      0     1 ]
```

### 3.4 组合变换（重点！）

变换顺序很重要！通常顺序是：**缩放 → 旋转 → 平移**

```
M = T * R * S
```

其中：
- S = 缩放矩阵
- R = 旋转矩阵
- T = 平移矩阵

在 YCDesk 中，我们只需要缩放和平移（暂时不需要旋转），所以组合矩阵为：

```
M = T * S

[ 1  0  panX ]   [ scale  0      0 ]   [ scale  0      panX ]
[ 0  1  panY ] * [ 0      scale  0 ] = [ 0      scale  panY ]
[ 0  0  1    ]   [ 0      0      1 ]   [ 0      0      1    ]
```

### 3.5 坐标变换公式

#### 3.5.1 正向变换（视图 → 变换后）
给定点 `P = [x, y, 1]`，变换后：

```
P' = M * P

[x']   [ scale  0      panX ] [x]
[y'] = [ 0      scale  panY ] [y]
[1 ]   [ 0      0      1    ] [1]

x' = x * scale + panX
y' = y * scale + panY
```

等等，这是将**视频坐标**变换到**视图坐标**！

如果我们要将**视图坐标**变换回**视频坐标**，需要使用**逆矩阵**！

#### 3.5.2 逆向变换（视图 → 视频）
首先计算逆矩阵 `M⁻¹`：

```
对于 M = [ scale   0      panX ]
          [ 0      scale   panY ]
          [ 0       0       1   ]

逆矩阵 M⁻¹ = [ 1/scale   0        -panX/scale ]
              [ 0        1/scale   -panY/scale ]
              [ 0         0          1         ]
```

所以，视图坐标 (viewX, viewY) 到视频坐标 (videoX, videoY) 的转换：

```
videoX = (viewX - panX) / scale
videoY = (viewY - panY) / scale
```

---

## 虚拟鼠标/键盘层次与数据流

### 4.1 悬浮窗层次设计

#### 4.1.1 WindowManager LayoutParams 配置

**FloatingMouseService：**
```java
WindowManager.LayoutParams params = new WindowManager.LayoutParams(
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.WRAP_CONTENT,
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        : WindowManager.LayoutParams.TYPE_PHONE,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT
);

// 关键：设置 z-order 在应用之上
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    params.type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
}
```

**FloatingKeyboardService：**
```java
// 键盘应该在鼠标之上（如果需要同时显示）
// 但通常不需要，它们是互斥的
```

### 4.2 完整数据流路径

#### 4.2.1 数据流 1：悬浮鼠标 → 远程屏幕

```
┌─────────────────────────────────────────────────────────────────┐
│  FloatingMouseService (Java层)                                    │
│  - 用户拖动悬浮窗，得到 windowX, windowY (屏幕绝对像素)          │
│  - 通过 LocalBroadcastManager / EventBus 发送到 Web层            │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Web层 Capacitor Plugin (JS层)                                    │
│  - FloatingMousePlugin 接收事件                                   │
│  - 将 (windowX, windowY) 传递给 app.js                            │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  InputDispatcher (输入分发器)                                      │
│  - 判断：这是悬浮鼠标输入                                          │
│  - 需要减去应用窗口的偏移量！                                       │
│  - viewX = windowX - appWindowLeft                                │
│  - viewY = windowY - appWindowTop                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  MatrixTransformer (矩阵变换器)                                    │
│  - 使用逆矩阵进行坐标转换                                          │
│  - videoX = (viewX - panX) / scale                                │
│  - videoY = (viewY - panY) / scale                                │
│  - remoteX = (videoX / videoWidth) * remoteWidth                  │
│  - remoteY = (videoY / videoHeight) * remoteHeight                │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  InputProtocol (输入协议层)                                         │
│  - 封装为 { type: 'mousemove', x: remoteX, y: remoteY }          │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  DataChannel (传输层)                                               │
│  - 发送到远程服务器                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.2.2 数据流 2：触摸手势 → 远程屏幕

```
┌─────────────────────────────────────────────────────────────────┐
│  GestureHandlerLayer (HTML层)                                      │
│  - 监听 touchstart/touchmove/touchend                             │
│  - 使用 touch.identifier (PointerId) 跟踪每个手指                 │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  GestureHandler (手势识别器)                                       │
│  - 判断手势类型：单指拖动/点击 vs 双指缩放                        │
│  - 如果是双指：更新 MatrixTransformer 的矩阵                      │
│  - 如果是单指：发送到 InputDispatcher                              │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  MatrixTransformer (矩阵变换器)                                    │
│  - 同悬浮鼠标路径                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
                  (后续路径相同)
```

### 4.3 关键点：应用窗口偏移计算

**问题**：悬浮鼠标给的是**屏幕绝对坐标**，但我们需要的是**相对于应用 RemoteScreen 的坐标**！

**解决方案**：

```javascript
// 在 app.js 中
let appWindowOffset = { x: 0, y: 0 };

function updateAppWindowOffset() {
    const remoteScreen = document.getElementById('remoteScreen');
    const rect = remoteScreen.getBoundingClientRect();
    
    // rect.left 和 rect.top 就是应用窗口相对于屏幕的偏移
    appWindowOffset.x = rect.left;
    appWindowOffset.y = rect.top;
}

// 在 InputDispatcher 中
function dispatchFloatingMouseInput(windowX, windowY) {
    // 减去应用窗口偏移，得到相对于 RemoteScreen 的坐标
    const viewX = windowX - appWindowOffset.x;
    const viewY = windowY - appWindowOffset.y;
    
    // 然后交给 MatrixTransformer
    const remote = matrixTransformer.viewToRemote(viewX, viewY);
    
    // 发送
    sendInput(remote);
}

// 需要在窗口变化时更新
window.addEventListener('resize', updateAppWindowOffset);
window.addEventListener('orientationchange', updateAppWindowOffset);
```

---

## 核心类设计

### 5.1 MatrixTransformer（矩阵变换器 - 核心）

```javascript
class MatrixTransformer {
    constructor() {
        // 变换矩阵参数
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        
        // 尺寸信息
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.containerWidth = 0;
        this.containerHeight = 0;
        this.remoteScreenWidth = 1920;
        this.remoteScreenHeight = 1080;
        
        // 缓存矩阵，避免重复计算
        this._matrix = null;
        this._inverseMatrix = null;
        this._matrixDirty = true;
    }
    
    // ========== 设置方法 ==========
    
    setVideoSize(width, height) {
        this.videoWidth = width;
        this.videoHeight = height;
        this._matrixDirty = true;
    }
    
    setContainerSize(width, height) {
        this.containerWidth = width;
        this.containerHeight = height;
        this._matrixDirty = true;
    }
    
    setRemoteScreenSize(width, height) {
        this.remoteScreenWidth = width;
        this.remoteScreenHeight = height;
    }
    
    // ========== 矩阵计算 ==========
    
    _updateMatrices() {
        if (!this._matrixDirty) return;
        
        // 计算正向矩阵 (视频 → 视图)
        // M = T * S
        this._matrix = {
            a: this.scale,  // sx
            b: 0,
            c: this.panX,   // tx
            d: 0,
            e: this.scale,  // sy
            f: this.panY    // ty
        };
        
        // 计算逆矩阵 (视图 → 视频)
        // M⁻¹ = S⁻¹ * T⁻¹
        const invScale = 1.0 / this.scale;
        this._inverseMatrix = {
            a: invScale,
            b: 0,
            c: -this.panX * invScale,
            d: 0,
            e: invScale,
            f: -this.panY * invScale
        };
        
        this._matrixDirty = false;
    }
    
    // ========== 坐标转换 API ==========
    
    /**
     * 视图坐标 → 视频坐标
     * @param {number} viewX - 视图 X 坐标
     * @param {number} viewY - 视图 Y 坐标
     * @returns {{x: number, y: number}} 视频坐标
     */
    viewToVideo(viewX, viewY) {
        this._updateMatrices();
        const m = this._inverseMatrix;
        
        // 应用逆矩阵
        // [x'] = [a  b  c] [x]
        // [y']   [d  e  f] [y]
        // [1 ]   [0  0  1] [1]
        return {
            x: m.a * viewX + m.b * viewY + m.c,
            y: m.d * viewX + m.e * viewY + m.f
        };
    }
    
    /**
     * 视频坐标 → 视图坐标
     * @param {number} videoX - 视频 X 坐标
     * @param {number} videoY - 视频 Y 坐标
     * @returns {{x: number, y: number}} 视图坐标
     */
    videoToView(videoX, videoY) {
        this._updateMatrices();
        const m = this._matrix;
        
        return {
            x: m.a * videoX + m.b * videoY + m.c,
            y: m.d * videoX + m.e * videoY + m.f
        };
    }
    
    /**
     * 视频坐标 → 远程屏幕坐标
     * @param {number} videoX - 视频 X 坐标
     * @param {number} videoY - 视频 Y 坐标
     * @returns {{x: number, y: number}} 远程屏幕坐标（像素）
     */
    videoToRemote(videoX, videoY) {
        return {
            x: (videoX / this.videoWidth) * this.remoteScreenWidth,
            y: (videoY / this.videoHeight) * this.remoteScreenHeight
        };
    }
    
    /**
     * 远程屏幕坐标 → 视频坐标
     * @param {number} remoteX - 远程屏幕 X 坐标
     * @param {number} remoteY - 远程屏幕 Y 坐标
     * @returns {{x: number, y: number}} 视频坐标
     */
    remoteToVideo(remoteX, remoteY) {
        return {
            x: (remoteX / this.remoteScreenWidth) * this.videoWidth,
            y: (remoteY / this.remoteScreenHeight) * this.videoHeight
        };
    }
    
    /**
     * 视图坐标 → 远程屏幕坐标（完整转换链）
     * @param {number} viewX - 视图 X 坐标
     * @param {number} viewY - 视图 Y 坐标
     * @returns {{x: number, y: number}} 远程屏幕坐标（像素）
     */
    viewToRemote(viewX, viewY) {
        const video = this.viewToVideo(viewX, viewY);
        return this.videoToRemote(video.x, video.y);
    }
    
    /**
     * 远程屏幕坐标 → 视图坐标（反向）
     * @param {number} remoteX - 远程屏幕 X 坐标
     * @param {number} remoteY - 远程屏幕 Y 坐标
     * @returns {{x: number, y: number}} 视图坐标
     */
    remoteToView(remoteX, remoteY) {
        const video = this.remoteToVideo(remoteX, remoteY);
        return this.videoToView(video.x, video.y);
    }
    
    // ========== 变换操作 ==========
    
    /**
     * 更新缩放（以中心点为基准）
     * @param {number} newScale - 新的缩放值
     * @param {number} centerX - 中心点 X 坐标（视图坐标系）
     * @param {number} centerY - 中心点 Y 坐标（视图坐标系）
     */
    updateScale(newScale, centerX, centerY) {
        const oldScale = this.scale;
        
        // 先将中心点从视图坐标转换到视频坐标
        const centerInVideo = this.viewToVideo(centerX, centerY);
        
        // 更新缩放
        this.scale = Math.max(0.5, Math.min(5.0, newScale));
        
        // 现在，我们希望中心点在视频坐标系中保持不变
        // 所以重新计算 pan，使得：
        // viewX = videoX * newScale + newPanX
        // 其中 videoX 保持不变
        
        this.panX = centerX - centerInVideo.x * this.scale;
        this.panY = centerY - centerInVideo.y * this.scale;
        
        this._matrixDirty = true;
        this.clampPan();
    }
    
    /**
     * 限制 pan 在合理范围内
     */
    clampPan() {
        const scaledWidth = this.containerWidth * this.scale;
        const scaledHeight = this.containerHeight * this.scale;
        
        const maxPanX = 0;
        const minPanX = this.containerWidth - scaledWidth;
        const maxPanY = 0;
        const minPanY = this.containerHeight - scaledHeight;
        
        this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
        this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
        
        this._matrixDirty = true;
    }
    
    /**
     * 应用变换到 DOM 元素
     * @param {HTMLElement} element - 要变换的元素
     */
    applyTransform(element) {
        element.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
        element.style.transformOrigin = '0 0';
    }
    
    /**
     * 重置变换
     */
    reset() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this._matrixDirty = true;
    }
}
```

### 5.2 InputDispatcher（输入分发器）

```javascript
class InputDispatcher {
    constructor(transformer, onInput) {
        this.transformer = transformer;
        this.onInput = onInput;
        
        // 应用窗口偏移（悬浮鼠标用）
        this.appWindowOffset = { x: 0, y: 0 };
        
        // 输入缓冲（用于节流）
        this.lastInputTime = 0;
        this.inputThrottleMs = 8; // ~120Hz
    }
    
    updateAppWindowOffset() {
        const remoteScreen = document.getElementById('remoteScreen');
        if (remoteScreen) {
            const rect = remoteScreen.getBoundingClientRect();
            this.appWindowOffset.x = rect.left;
            this.appWindowOffset.y = rect.top;
        }
    }
    
    /**
     * 分发来自触摸手势的输入
     */
    dispatchTouchInput(viewX, viewY, type, button = 0) {
        const now = Date.now();
        if (now - this.lastInputTime < this.inputThrottleMs && type === 'mousemove') {
            return; // 节流鼠标移动
        }
        this.lastInputTime = now;
        
        const remote = this.transformer.viewToRemote(viewX, viewY);
        
        this.onInput({
            type: type,
            x: remote.x,
            y: remote.y,
            button: button
        });
    }
    
    /**
     * 分发来自悬浮鼠标的输入
     */
    dispatchFloatingMouseInput(windowX, windowY, type, button = 0) {
        // 减去应用窗口偏移
        const viewX = windowX - this.appWindowOffset.x;
        const viewY = windowY - this.appWindowOffset.y;
        
        // 检查是否在有效范围内
        if (viewX < 0 || viewX > this.transformer.containerWidth ||
            viewY < 0 || viewY > this.transformer.containerHeight) {
            return; // 超出范围，忽略
        }
        
        // 复用触摸输入的分发逻辑
        this.dispatchTouchInput(viewX, viewY, type, button);
    }
}
```

---

## 坐标转换数学模型（基于矩阵）

### 6.1 坐标系定义

| 坐标系 | 说明 | 单位 | 变换关系 |
|--------|------|------|----------|
| remoteScreen | 远程屏幕坐标系 | px | 最底层 |
| videoLocal | 视频本地坐标系 | px | = remoteScreen 的同比例映射 |
| videoTransformed | 视频变换后坐标系 | px | = videoLocal 经过 M 变换 |
| view | 视图坐标系 | px | = videoTransformed |

### 6.2 完整转换链

```
远程屏幕坐标 → 视频本地坐标 → 视频变换后坐标 → 视图坐标
    (remote)          (videoLocal)        (view)
        ↓                   ↓                  ↓
    / remoteWidth     * scale + panX
    * videoWidth
```

### 6.3 矩阵公式速查表

| 转换方向 | 公式 |
|---------|------|
| **视图 → 视频** | `videoX = (viewX - panX) / scale` |
| **视频 → 远程** | `remoteX = (videoX / videoWidth) * remoteWidth` |
| **视图 → 远程** | `remoteX = ((viewX - panX) / scale / videoWidth) * remoteWidth` |
| **远程 → 视图** | `viewX = (remoteX / remoteWidth) * videoWidth * scale + panX` |
| **缩放中心点保持** | `newPanX = centerX - videoCenterX * newScale` |

---

## 实现步骤

### 7.1 第一阶段：MatrixTransformer 基础
1. 创建 `MatrixTransformer` 类
2. 实现矩阵计算和缓存
3. 实现所有坐标转换 API
4. 单元测试验证

### 7.2 第二阶段：InputDispatcher 与数据流
1. 创建 `InputDispatcher` 类
2. 实现应用窗口偏移计算
3. 实现输入节流和分发
4. 集成悬浮鼠标事件

### 7.3 第三阶段：GestureHandler 重构
1. 重构 `GestureHandler` 使用 PointerId
2. 集成 `MatrixTransformer`
3. 实现双指缩放（中心点保持）
4. 实现单指拖动/点击

### 7.4 第四阶段：UI 层次更新
1. 修改 HTML 结构
2. 更新 CSS 样式
3. 集成所有组件

### 7.5 第五阶段：悬浮鼠标集成
1. 修改 `FloatingMouseService.java`
2. 传递正确的坐标
3. 测试悬浮鼠标与触摸手势的一致性

### 7.6 第六阶段：测试和优化
1. 各种缩放级别测试
2. 多指手势测试
3. 不同屏幕尺寸测试
4. 性能优化（节流、缓存）

---

## 关键代码示例

### 8.1 集成到 app.js

```javascript
// 全局变量
let matrixTransformer = null;
let inputDispatcher = null;
let gestureHandler = null;

function initRemoteScreen() {
    // 初始化 MatrixTransformer
    matrixTransformer = new MatrixTransformer();
    
    // 获取初始尺寸
    const container = document.getElementById('videoContainer');
    const rect = container.getBoundingClientRect();
    matrixTransformer.setContainerSize(rect.width, rect.height);
    
    // 初始化 InputDispatcher
    inputDispatcher = new InputDispatcher(
        matrixTransformer,
        handleRemoteInput
    );
    inputDispatcher.updateAppWindowOffset();
    
    // 初始化 GestureHandler
    gestureHandler = new GestureHandler(
        matrixTransformer,
        inputDispatcher,
        (input) => inputDispatcher.dispatchTouchInput(input.x, input.y, input.type, input.button)
    );
    
    // 绑定事件
    const gestureLayer = document.getElementById('gestureHandlerLayer');
    gestureLayer.addEventListener('touchstart', (e) => gestureHandler.handleTouchStart(e), { passive: false });
    gestureLayer.addEventListener('touchmove', (e) => gestureHandler.handleTouchMove(e), { passive: false });
    gestureLayer.addEventListener('touchend', (e) => gestureHandler.handleTouchEnd(e), { passive: false });
    gestureLayer.addEventListener('touchcancel', (e) => gestureHandler.handleTouchEnd(e), { passive: false });
    
    // 监听窗口变化
    window.addEventListener('resize', () => {
        const rect = container.getBoundingClientRect();
        matrixTransformer.setContainerSize(rect.width, rect.height);
        inputDispatcher.updateAppWindowOffset();
    });
}

function handleRemoteInput(input) {
    // 将远程屏幕坐标转换为归一化坐标 (0-1)
    const normalizedX = input.x / matrixTransformer.remoteScreenWidth;
    const normalizedY = input.y / matrixTransformer.remoteScreenHeight;
    
    // 发送到远程
    sendControlCommand({
        type: input.type,
        x: normalizedX,
        y: normalizedY,
        button: input.button
    });
}

// 悬浮鼠标事件回调（从 Capacitor Plugin 调用）
function onFloatingMouseEvent(event) {
    if (!inputDispatcher) return;
    
    inputDispatcher.dispatchFloatingMouseInput(
        event.windowX,
        event.windowY,
        event.type,
        event.button
    );
}
```

### 8.2 更新后的 HTML 结构

```html
<div class="remote-screen" id="remoteScreen">
    <div class="stats-overlay" id="statsOverlay">
        <!-- 统计信息 -->
    </div>
    
    <!-- 新增：手势处理层（在视频之上） -->
    <div class="gesture-handler-layer" id="gestureHandlerLayer"></div>
    
    <div class="remote-video-container" id="videoContainer">
        <div class="video-wrapper" id="videoWrapper">
            <video class="remote-video" id="remoteVideo" autoplay playsinline></video>
        </div>
    </div>
    
    <div class="control-overlay" id="controlOverlay">
        <!-- 控制按钮 -->
    </div>
</div>
```

### 8.3 更新后的 CSS 样式

```css
.gesture-handler-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 50; /* 在视频之上，控制按钮之下 */
    touch-action: none; /* 禁用浏览器默认手势 */
}

/* 确保层级正确 */
.stats-overlay {
    z-index: 10;
}

.control-overlay {
    z-index: 100;
}
```

---

## 总结

这个完整方案通过以下方式从根本上解决坐标偏差问题：

### 核心改进点：

1. **矩阵变换法**：
   - 数学严谨，业界标准
   - 支持任意组合变换
   - 易于扩展（未来可加旋转）

2. **完整的数据流架构**：
   - 悬浮鼠标和触摸手势统一入口
   - InputDispatcher 负责分发和去重
   - 正确处理应用窗口偏移

3. **明确的层次结构**：
   - 悬浮窗使用独立 WindowManager（TYPE_APPLICATION_OVERLAY）
   - 手势处理层在视频之上
   - 职责清晰，易于维护

4. **PointerId 跟踪**：
   - 多手指操作不会混淆
   - 像 RustDesk 那样专业

5. **缩放中心点保持**：
   - 正确的数学公式
   - 缩放时坐标不漂移

### 文件位置：
完整文档已保存到：`d:\MyProg\YCDesk\android\ANDROID_ARCHITECTURE_REDESIGN.md`

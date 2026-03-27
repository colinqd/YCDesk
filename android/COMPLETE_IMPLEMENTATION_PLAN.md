# YCDesk Android 端完整实施方案

## 一、概述

本方案提供 YCDesk Android 端远程屏幕显示和交互的完整实现，包括：
- 远程屏幕缩放和拖动
- 单指、双指手势处理
- 鼠标指针模式和触摸模式
- 基于矩阵变换的精确坐标转换
- 悬浮鼠标和虚拟键盘集成

## 二、核心架构

### 2.1 页面层次结构

```
┌─────────────────────────────────────────┐
│  悬浮窗层 (WindowManager)                │
│  ┌─────────────────────────────────┐   │
│  │  FloatingMouseService            │   │
│  │  (悬浮鼠标指针)                   │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  FloatingKeyboardService         │   │
│  │  (悬浮键盘)                       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  应用内页面层 (Activity)                  │
│  ┌─────────────────────────────────┐   │
│  │  控制层 (Control Overlay)        │   │
│  │  - 操作按钮、键盘按钮等           │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  手势层 (Gesture Layer)          │   │
│  │  - 接收触摸事件                  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  视频层 (Video Layer)            │   │
│  │  - video-wrapper (可变换容器)    │   │
│  │    └─ remote-video (视频元素)    │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  统计层 (Stats Overlay)          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 2.2 核心类结构

```
MatrixTransformer (矩阵变换器)
├── 管理 scale/pan 变换
├── view ↔ video ↔ remote 坐标转换
└── 应用 CSS 变换

InputDispatcher (输入分发器)
├── 接收触摸输入
├── 接收悬浮鼠标输入
├── 坐标转换
└── 事件节流

GestureHandler (手势处理器)
├── 单指点击/拖动
├── 双指缩放
├── PointerId 跟踪
└── 手势状态管理
```

## 三、坐标转换系统

### 3.1 转换链

```
视图坐标 (view)
    ↓ [viewToVideo]
视频坐标 (video)
    ↓ [videoToRemote]
远程屏幕坐标 (remote)
```

### 3.2 矩阵变换公式

使用 3x3 齐次变换矩阵：

```
[ x' ]   [ a  b  c ] [ x ]
[ y' ] = [ d  e  f ] [ y ]
[ 1  ]   [ 0  0  1 ] [ 1 ]

其中：
a = scale, b = 0, c = panX
d = 0, e = scale, f = panY
```

逆矩阵用于反向转换：

```
a' = 1/scale, b' = 0, c' = -panX/scale
d' = 0, e' = 1/scale, f' = -panY/scale
```

### 3.3 缩放中心点保持公式

```
// 1. 将缩放中心从视图坐标转换到视频坐标
centerInVideo = viewToVideo(centerX, centerY)

// 2. 更新缩放
scale = newScale

// 3. 计算新的平移量，使中心点保持不变
panX = centerX - centerInVideo.x * scale
panY = centerY - centerInVideo.y * scale
```

## 四、手势处理

### 4.1 单指手势

```
touchstart (单指)
    ├─ isZoomed?
    │   ├─ YES → 开始拖动 (isPanning = true)
    │   └─ NO → 发送 mousedown
    │
touchmove (单指)
    ├─ isPanning?
    │   ├─ YES → 更新 panX/panY
    │   └─ NO → 发送 mousemove
    │
touchend (单指)
    ├─ isPanning?
    │   ├─ YES → 结束拖动
    │   └─ NO → 发送 mouseup + 检测双击
```

### 4.2 双指手势

```
touchstart (双指)
    ├─ 计算初始距离
    ├─ 记录初始缩放
    ├─ 记录中心点
    └─ isPinching = true

touchmove (双指)
    ├─ 计算当前距离
    ├─ 计算缩放比例
    ├─ 调用 updateScale(centerX, centerY)
    └─ 应用变换

touchend (双指)
    └─ isPinching = false
```

### 4.3 PointerId 跟踪

使用 `touch.identifier` 跟踪每个手指：

```javascript
touches = new Map(); // pointerId → {x, y, startTime}

handleTouchStart(event) {
    for (let i = 0; i < event.touches.length; i++) {
        const touch = event.touches[i];
        touches.set(touch.identifier, {
            x: touch.clientX,
            y: touch.clientY,
            startTime: Date.now()
        });
    }
}
```

## 五、鼠标模式

### 5.1 指针模式 (Pointer Mode)

```
启用悬浮鼠标 → FloatingMouseService.show()
    ↓
悬浮窗接收触摸 → 计算悬浮窗内坐标
    ↓
减去应用窗口偏移 → viewX = windowX - appWindowOffset.x
    ↓
坐标转换 → remote = viewToRemote(viewX, viewY)
    ↓
发送到远程屏幕
```

### 5.2 触摸模式 (Touch Mode)

```
禁用悬浮鼠标 → FloatingMouseService.hide()
    ↓
直接在视频层接收触摸
    ↓
坐标转换 → remote = viewToRemote(touchX, touchY)
    ↓
发送到远程屏幕
```

## 六、实施步骤

### 步骤 1：准备文件结构

```
android/
├── src-new/
│   ├── MatrixTransformer.js      # 矩阵变换器
│   ├── InputDispatcher.js        # 输入分发器
│   └── GestureHandler.js         # 手势处理器
├── index.html                     # 页面结构
└── app.js                         # 主逻辑
```

### 步骤 2：集成核心类到 app.js

在 app.js 开头添加：

```javascript
// 引入核心类
class MatrixTransformer { /* ... */ }
class InputDispatcher { /* ... */ }
class GestureHandler { /* ... */ }

// 全局实例
let matrixTransformer = null;
let inputDispatcher = null;
let gestureHandler = null;
```

### 步骤 3：初始化核心实例

在 `setupDataChannel()` 中添加：

```javascript
function setupRemoteScreenInteraction() {
    // 1. 创建矩阵变换器
    matrixTransformer = new MatrixTransformer();
    
    // 2. 设置容器尺寸
    const videoContainer = document.getElementById('videoContainer');
    const rect = videoContainer.getBoundingClientRect();
    matrixTransformer.setContainerSize(rect.width, rect.height);
    
    // 3. 创建输入分发器
    inputDispatcher = new InputDispatcher(
        matrixTransformer,
        (input) => {
            // 发送输入到远程
            sendControlCommand({
                type: input.type,
                x: normalizeCoordinate(input.x),
                y: normalizeCoordinate(input.y),
                button: input.button
            });
        }
    );
    
    // 4. 创建手势处理器
    gestureHandler = new GestureHandler(
        matrixTransformer,
        inputDispatcher,
        null
    );
    
    // 5. 绑定触摸事件
    const videoWrapper = document.getElementById('videoWrapper');
    videoWrapper.addEventListener('touchstart', (e) => {
        gestureHandler.handleTouchStart(e);
    }, { passive: false });
    
    videoWrapper.addEventListener('touchmove', (e) => {
        gestureHandler.handleTouchMove(e);
    }, { passive: false });
    
    videoWrapper.addEventListener('touchend', (e) => {
        gestureHandler.handleTouchEnd(e);
    }, { passive: false });
    
    videoWrapper.addEventListener('touchcancel', (e) => {
        gestureHandler.handleTouchEnd(e);
    }, { passive: false });
    
    log('远程屏幕交互已初始化');
}
```

### 步骤 4：更新视频尺寸回调

在收到屏幕尺寸时更新：

```javascript
if (data.type === 'screen-size') {
    log('收到屏幕尺寸: ' + data.width + 'x' + data.height);
    matrixTransformer.setRemoteScreenSize(data.width, data.height);
}
```

### 步骤 5：视频加载后设置视频尺寸

```javascript
const remoteVideo = document.getElementById('remoteVideo');
remoteVideo.onloadedmetadata = () => {
    matrixTransformer.setVideoSize(
        remoteVideo.videoWidth,
        remoteVideo.videoHeight
    );
};
```

### 步骤 6：集成悬浮鼠标事件

更新悬浮鼠标事件处理：

```javascript
FloatingMouse.addListener('mouseEvent', (event) => {
    if (matrixTransformer && inputDispatcher) {
        inputDispatcher.updateAppWindowOffset();
        inputDispatcher.dispatchFloatingMouseInput(
            event.x,
            event.y,
            event.type,
            event.button
        );
    }
});
```

### 步骤 7：更新鼠标模式切换

```javascript
function selectMouseMode(mode) {
    try {
        mouseModeType = mode;
        isMouseMode = true;
        
        const modal = document.getElementById('mouseModeModal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        if (mode === 'pointer') {
            showToast('指针模式 - 悬浮鼠标');
            showFloatingMouse().catch(e => log('显示悬浮鼠标失败: ' + e.message));
            if (gestureHandler) {
                gestureHandler.setTouchMode(false);
            }
        } else {
            showToast('触屏模式 - 直接触摸');
            hideFloatingMouse().catch(e => log('隐藏悬浮鼠标失败: ' + e.message));
            if (gestureHandler) {
                gestureHandler.setTouchMode(true);
            }
        }
        
        updateMouseModeSelection();
    } catch (e) {
        log('选择鼠标模式失败: ' + e.message);
    }
}
```

### 步骤 8：更新重置缩放功能

```javascript
function resetZoomAndPan() {
    if (matrixTransformer) {
        matrixTransformer.reset();
        const videoWrapper = document.getElementById('videoWrapper');
        matrixTransformer.applyTransform(videoWrapper);
        showToast('已重置缩放和位置');
    }
}
```

### 步骤 9：移除旧的 setupTouchEvents

删除或注释掉原有的 `setupTouchEvents()` 函数，因为我们现在使用新的手势处理器。

### 步骤 10：在显示远程屏幕时初始化

在 `showRemoteScreen()` 中调用：

```javascript
function showRemoteScreen() {
    const remoteScreen = document.getElementById('remoteScreen');
    remoteScreen.classList.add('active');
    
    // 延迟初始化，确保 DOM 已渲染
    setTimeout(() => {
        setupRemoteScreenInteraction();
    }, 100);
}
```

## 七、关键实现细节

### 7.1 边界限制 (Clamping)

```javascript
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
```

### 7.2 输入事件节流

```javascript
dispatchTouchInput(viewX, viewY, type, button = 0) {
    const now = Date.now();
    if (now - this.lastInputTime < this.inputThrottleMs && type === 'mousemove') {
        return;
    }
    this.lastInputTime = now;
    // ... 发送输入
}
```

### 7.3 应用窗口偏移计算

```javascript
updateAppWindowOffset() {
    const remoteScreen = document.getElementById('remoteScreen');
    if (remoteScreen) {
        const rect = remoteScreen.getBoundingClientRect();
        this.appWindowOffset.x = rect.left;
        this.appWindowOffset.y = rect.top;
    }
}
```

## 八、测试清单

### 8.1 手势测试

- [ ] 单指点击 → 远程鼠标点击
- [ ] 单指拖动（未缩放）→ 远程鼠标拖动
- [ ] 单指拖动（已缩放）→ 屏幕平移
- [ ] 双指缩放 → 屏幕缩放，中心点保持不变
- [ ] 双击 → 远程双击
- [ ] 双指快速点击 → 远程右键点击

### 8.2 坐标准确性测试

- [ ] 点击屏幕左上角 → 远程鼠标在左上角
- [ ] 点击屏幕中心 → 远程鼠标在中心
- [ ] 缩放后点击同一位置 → 远程鼠标位置正确
- [ ] 平移后点击同一位置 → 远程鼠标位置正确

### 8.3 鼠标模式测试

- [ ] 指针模式：悬浮鼠标移动 → 远程鼠标同步移动
- [ ] 指针模式：悬浮鼠标点击 → 远程鼠标点击
- [ ] 触摸模式：直接触摸 → 远程鼠标点击
- [ ] 模式切换正常

### 8.4 边界测试

- [ ] 缩放到最小 (0.5x) → 不能再缩小
- [ ] 缩放到最大 (5x) → 不能再放大
- [ ] 平移到左边界 → 不能继续左移
- [ ] 平移到右边界 → 不能继续右移
- [ ] 平移到上边界 → 不能继续上移
- [ ] 平移到下边界 → 不能继续下移

## 九、优化建议

### 9.1 性能优化

1. **矩阵缓存**：只在 scale/pan 变化时重新计算矩阵
2. **事件节流**：mousemove 事件限制在 8ms 一次 (120fps)
3. **requestAnimationFrame**：使用 RAF 应用 CSS 变换

### 9.2 用户体验优化

1. **触觉反馈**：点击时提供振动反馈
2. **视觉反馈**：显示缩放比例指示器
3. **惯性滚动**：平移时添加惯性效果

### 9.3 错误处理

1. **权限检查**：悬浮窗权限未授予时提示用户
2. **降级方案**：悬浮鼠标不可用时自动切换到触摸模式

## 十、文件清单

### 新增/修改文件

1. `android/src-new/MatrixTransformer.js` - 矩阵变换器 ✅
2. `android/src-new/InputDispatcher.js` - 输入分发器 ✅
3. `android/src-new/GestureHandler.js` - 手势处理器 ✅
4. `android/app.js` - 集成核心类
5. `android/COMPLETE_IMPLEMENTATION_PLAN.md` - 本文档 ✅

### 现有文件

1. `android/index.html` - 页面结构
2. `android/android/app/src/main/java/com/ycdesk/mobile/FloatingMouseService.java` - 悬浮鼠标服务
3. `android/android/app/src/main/java/com/ycdesk/mobile/FloatingKeyboardService.java` - 悬浮键盘服务

## 十一、快速开始

### 1. 复制核心类到 app.js

将 `src-new/` 目录下的三个类的内容复制到 `app.js` 开头。

### 2. 添加初始化代码

按照步骤 3-10 添加相应的代码。

### 3. 编译测试

```bash
cd android
npm install
npx cap sync android
npx cap open android
```

在 Android Studio 中编译并运行。

---

**文档版本**: 1.0  
**最后更新**: 2024  
**维护者**: YCDesk Team

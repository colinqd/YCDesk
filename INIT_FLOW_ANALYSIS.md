# 初始化流程和数据流分析

## 一、当前初始化流程

### 1.1 setupRemoteScreenInteraction()

```
setupRemoteScreenInteraction()
    │
    ├─→ 获取 remoteScreen 和 videoContainer 元素
    │
    ├─→ 获取 containerRect = videoContainer.getBoundingClientRect()
    │   │   问题：此时 videoContainer 尺寸是 100% x 100%（全屏）
    │
    ├─→ 创建 MatrixTransformer
    │   │
    │   └─→ constructor()
    │       ├─ scale = 1.0
    │       ├─ panX = 0, panY = 0
    │       ├─ videoWidth = 0, videoHeight = 0
    │       ├─ containerWidth = 0, containerHeight = 0
    │       ├─ remoteScreenWidth = 1920, remoteScreenHeight = 1080
    │       └─ displayX = 0, displayY = 0, displayWidth = 0, displayHeight = 0
    │
    ├─→ matrixTransformer.setContainerSize(containerRect.width, containerRect.height)
    │   │
    │   └─→ containerWidth = width, containerHeight = height
    │       _updateDisplayRect()
    │       │
    │       └─→ 此时 videoWidth = 0, videoHeight = 0
    │           所以 displayWidth = containerWidth, displayHeight = containerHeight
    │           displayX = 0, displayY = 0
    │
    ├─→ 创建 InputDispatcher
    ├─→ 创建 GestureHandler
    ├─→ 绑定触摸事件
    │
    └─→ 设置 remoteVideo.onloadedmetadata 回调
```

### 1.2 视频加载后

```
remoteVideo.onloadedmetadata 触发
    │
    ├─→ matrixTransformer.setVideoSize(videoWidth, videoHeight)
    │   │
    │   └─→ videoWidth = width, videoHeight = height
    │       _updateDisplayRect()
    │       │
    │       └─→ 此时 containerWidth > 0, containerHeight > 0
    │           videoWidth > 0, videoHeight > 0
    │           正确计算 displayWidth, displayHeight, displayX, displayY
    │
    └─→ matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
        │
        └─→ 设置 videoContainer 尺寸和位置
```

### 1.3 收到远程屏幕尺寸后

```
dataChannel.onmessage → 'screen-size'
    │
    └─→ updateScreenSize(width, height, scaleFactor, workArea)
        │
        ├─→ matrixTransformer.setRemoteScreenSize(width, height)
        │   │
        │   └─→ remoteScreenWidth = width, remoteScreenHeight = height
        │       _updateDisplayRect()
        │
        └─→ matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
```

---

## 二、发现的问题

### 🔴 问题1：初始化顺序问题

**问题描述**：
- `setContainerSize()` 在 `onloadedmetadata` 之前调用
- 此时 `videoWidth = 0`, `videoHeight = 0`
- `_updateDisplayRect()` 无法正确计算显示区域

**影响**：
- `displayWidth = containerWidth`（全屏）
- `displayHeight = containerHeight`（全屏）
- `displayX = 0`, `displayY = 0`

### 🔴 问题2：containerWidth/containerHeight 的含义混乱

**问题描述**：
- `containerWidth/containerHeight` 实际上是 `remoteScreen` 的尺寸
- 但 `_updateDisplayRect()` 把它当作视频容器的尺寸来计算

**代码证据**：
```javascript
// setupRemoteScreenInteraction() 中
const containerRect = videoContainer.getBoundingClientRect();
// 此时 videoContainer 是 100% x 100%，所以 containerRect = remoteScreen 尺寸

matrixTransformer.setContainerSize(containerRect.width, containerRect.height);
// 设置的是 remoteScreen 的尺寸，不是视频显示区域的尺寸
```

### 🔴 问题3：_updateDisplayRect() 计算逻辑问题

**问题描述**：
- `_updateDisplayRect()` 计算的是视频在容器中的显示区域
- 但用户期望的是 `videoContainer` 尺寸匹配视频尺寸

**当前逻辑**：
```javascript
_updateDisplayRect() {
    // 计算视频在容器中的显示区域（考虑黑边）
    const containerAspect = this.containerWidth / this.containerHeight;
    const videoAspect = this.videoWidth / this.videoHeight;
    
    if (videoAspect > containerAspect) {
        // 视频更宽，上下有黑边
        this.displayWidth = this.containerWidth;
        this.displayHeight = this.containerWidth / videoAspect;
        this.displayX = 0;
        this.displayY = (this.containerHeight - this.displayHeight) / 2;
    } else {
        // 视频更高，左右有黑边
        this.displayHeight = this.containerHeight;
        this.displayWidth = this.containerHeight * videoAspect;
        this.displayX = (this.containerWidth - this.displayWidth) / 2;
        this.displayY = 0;
    }
}
```

---

## 三、问题根源分析

### 3.1 当前设计意图

```
remoteScreen (全屏)
└── videoContainer (displayWidth x displayHeight, 位于 displayX, displayY)
    └── videoWrapper (100% x 100%)
        └── remoteVideo (100% x 100%)
```

**设计意图**：
- `videoContainer` 尺寸 = 视频显示区域（排除黑边）
- 黑边在 `videoContainer` 外部（`remoteScreen` 背景）

### 3.2 实际问题

**问题**：`applyContainerSize()` 没有被正确调用

**原因**：
1. `onloadedmetadata` 触发时，`displayWidth` 和 `displayHeight` 已经正确计算
2. `applyContainerSize()` 被调用
3. 但 `applyContainerSize()` 的条件是 `this.displayWidth > 0 && this.displayHeight > 0`
4. 这个条件应该满足

**需要检查**：
- `onloadedmetadata` 是否正确触发
- `applyContainerSize()` 是否正确执行
- CSS 是否覆盖了 JS 设置的样式

---

## 四、调试建议

### 4.1 添加调试日志

在以下位置添加日志：

```javascript
// MatrixTransformer.setVideoSize()
setVideoSize(width, height) {
    log('MatrixTransformer: setVideoSize(' + width + ', ' + height + ')');
    this.videoWidth = width;
    this.videoHeight = height;
    this._matrixDirty = true;
    this._updateDisplayRect();
    log('MatrixTransformer: _updateDisplayRect() 后 displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight);
}

// MatrixTransformer._updateDisplayRect()
_updateDisplayRect() {
    log('MatrixTransformer: _updateDisplayRect() - containerWidth=' + this.containerWidth + ', containerHeight=' + this.containerHeight + ', videoWidth=' + this.videoWidth + ', videoHeight=' + this.videoHeight);
    // ...
}

// MatrixTransformer.applyContainerSize()
applyContainerSize(containerElement, wrapperElement) {
    log('MatrixTransformer: applyContainerSize() - displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight);
    if (this.displayWidth > 0 && this.displayHeight > 0) {
        log('MatrixTransformer: 设置 container 尺寸为 ' + this.displayWidth + 'x' + this.displayHeight);
        // ...
    } else {
        log('MatrixTransformer: displayWidth 或 displayHeight 为 0，跳过设置');
    }
}
```

### 4.2 检查 CSS 优先级

确保 CSS 不会覆盖 JS 设置的样式：

```css
/* 确保这些样式可以被 JS 覆盖 */
.remote-video-container {
    /* 不要使用 !important */
    position: absolute;
    /* 初始尺寸，会被 JS 覆盖 */
    width: 100%;
    height: 100%;
}
```

---

## 五、可能的修复方案

### 方案1：确保初始化顺序正确

```javascript
// 确保在视频加载后才应用尺寸
remoteVideo.onloadedmetadata = () => {
    log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
    matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
    
    // 重新获取容器尺寸（可能在视频加载后变化）
    const remoteScreen = document.getElementById('remoteScreen');
    const screenRect = remoteScreen.getBoundingClientRect();
    matrixTransformer.setContainerSize(screenRect.width, screenRect.height);
    
    const videoContainer = document.getElementById('videoContainer');
    const videoWrapper = document.getElementById('videoWrapper');
    if (videoContainer && videoWrapper) {
        matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
    }
};
```

### 方案2：添加延迟确保 DOM 更新

```javascript
remoteVideo.onloadedmetadata = () => {
    log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
    matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
    
    // 延迟一帧确保 DOM 更新
    requestAnimationFrame(() => {
        const videoContainer = document.getElementById('videoContainer');
        const videoWrapper = document.getElementById('videoWrapper');
        if (videoContainer && videoWrapper) {
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
        }
    });
};
```

### 方案3：监听远程屏幕尺寸更新

```javascript
function updateScreenSize(width, height, scaleFactor, workArea) {
    log('更新屏幕尺寸: ' + width + 'x' + height + ', scaleFactor=' + scaleFactor);
    if (matrixTransformer) {
        matrixTransformer.setRemoteScreenSize(width, height);
        if (scaleFactor) {
            matrixTransformer.scaleFactor = scaleFactor;
        }
        if (workArea) {
            matrixTransformer.workArea = workArea;
        }
        
        // 确保应用尺寸
        const videoContainer = document.getElementById('videoContainer');
        const videoWrapper = document.getElementById('videoWrapper');
        if (videoContainer && videoWrapper) {
            // 先设置视频尺寸（如果还没设置）
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && remoteVideo.videoWidth > 0) {
                matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
            }
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
        }
    }
}
```

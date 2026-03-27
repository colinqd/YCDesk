# 数据通道到MatrixTransformer初始化流程

## 一、整体流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              连接建立阶段                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Windows端（被控端）                          Android端（主控端）              │
│                                                                             │
│  1. 启动监听                                  1. 输入IP/端口                  │
│     ↓                                           ↓                           │
│  2. 等待连接                                  2. 发起连接                    │
│     ↓                                           ↓                           │
│  3. 收到连接请求                              3. 收到连接确认                 │
│     ↓                                           ↓                           │
│  4. 创建PeerConnection                        4. 创建PeerConnection          │
│     ↓                                           ↓                           │
│  5. 创建Offer ─────────────────────────────→ 5. 收到Offer                   │
│     ↓                                           ↓                           │
│  6. 收到Answer ←───────────────────────────── 6. 创建Answer                  │
│     ↓                                           ↓                           │
│  7. 交换ICE候选 ←───────────────────────────→ 7. 交换ICE候选                 │
│     ↓                                           ↓                           │
│  8. WebRTC连接建立                            8. WebRTC连接建立              │
│     ↓                                           ↓                           │
│  9. 数据通道打开                              9. 数据通道打开                │
│     ↓                                           ↓                           │
│  10. 发送屏幕尺寸 ─────────────────────────→ 10. 收到屏幕尺寸               │
│     ↓                                           ↓                           │
│  11. 开始视频流                               11. 初始化MatrixTransformer    │
│     ↓                                           ↓                           │
│  12. 视频流传输                               12. 视频播放                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、详细数据流

### 阶段1: TCP连接建立

```
Android端                                    Windows端
    │                                            │
    │  connectDirectClient(host, port)           │
    │ ─────────────────────────────────────────→ │
    │                                            │ startDirectServer(port)
    │                                            │ 监听端口
    │                                            │
    │  连接成功                                   │ 收到连接
    │ ←───────────────────────────────────────── │
    │                                            │
    │  clientId: "abc123"                        │
    │                                            │
```

### 阶段2: WebRTC信令交换

```
Android端                                    Windows端
    │                                            │
    │  type: 'webrtc-offer'                      │
    │  offer: { type, sdp }                      │
    │ ←───────────────────────────────────────── │
    │                                            │
    │  创建Answer                                 │
    │                                            │
    │  type: 'webrtc-answer'                     │
    │  answer: { type, sdp }                     │
    │ ─────────────────────────────────────────→ │
    │                                            │
    │  type: 'ice-candidate'                     │
    │  candidate: {...}                          │
    │ ←─────────────────────────────────────────→│
    │                                            │
```

### 阶段3: 数据通道打开

```
Android端                                    Windows端
    │                                            │
    │  dataChannel.onopen                        │ dataChannel.onopen
    │                                            │
    │                                            │ 获取屏幕尺寸
    │                                            │ window.electronAPI.getScreenSize()
    │                                            │
    │  type: 'screen-size'                       │
    │  width: 1920                               │
    │  height: 1080                              │
    │  scaleFactor: 1.25                         │
    │  workArea: {...}                           │
    │ ←───────────────────────────────────────── │
    │                                            │
    │  updateScreenSize()                        │
    │  ↓                                         │
    │  matrixTransformer.setRemoteScreenSize()   │
    │                                            │
```

### 阶段4: 视频流建立

```
Android端                                    Windows端
    │                                            │
    │  peerConnection.ontrack                    │ 捕获屏幕
    │                                            │
    │  videoElement.srcObject = stream           │
    │                                            │
    │  videoElement.onloadedmetadata             │
    │  ↓                                         │
    │  videoWidth: 1920                          │
    │  videoHeight: 1080                         │
    │                                            │
    │  matrixTransformer.setVideoSize()          │
    │  ↓                                         │
    │  matrixTransformer.applyDisplaySize()      │
    │                                            │
```

---

## 三、MatrixTransformer初始化顺序

```
┌─────────────────────────────────────────────────────────────────┐
│                    MatrixTransformer 初始化                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  步骤1: 创建实例                                                 │
│  ─────────────────                                              │
│  new MatrixTransformer()                                        │
│  │                                                              │
│  ├─ scale = 1.0                                                 │
│  ├─ panX = 0                                                    │
│  ├─ panY = 0                                                    │
│  ├─ videoWidth = 0                                              │
│  ├─ videoHeight = 0                                             │
│  ├─ containerWidth = 0                                          │
│  ├─ containerHeight = 0                                         │
│  ├─ remoteScreenWidth = 1920 (默认值)                            │
│  ├─ remoteScreenHeight = 1080 (默认值)                           │
│  ├─ scaleFactor = 1                                             │
│  └─ workArea = null                                             │
│                                                                 │
│  步骤2: 设置容器尺寸                                             │
│  ─────────────────                                              │
│  setupRemoteScreenInteraction()                                 │
│  │                                                              │
│  ├─ videoContainer.getBoundingClientRect()                      │
│  │                                                              │
│  └─ matrixTransformer.setContainerSize(width, height)           │
│     │                                                           │
│     ├─ containerWidth = width                                   │
│     ├─ containerHeight = height                                 │
│     └─ _updateDisplayRect()                                     │
│                                                                 │
│  步骤3: 设置远程屏幕尺寸                                         │
│  ─────────────────                                              │
│  dataChannel.onmessage → 'screen-size'                          │
│  │                                                              │
│  └─ updateScreenSize(width, height, scaleFactor, workArea)      │
│     │                                                           │
│     ├─ matrixTransformer.setRemoteScreenSize(width, height)     │
│     │  ├─ remoteScreenWidth = width                             │
│     │  └─ remoteScreenHeight = height                           │
│     │                                                           │
│     ├─ matrixTransformer.scaleFactor = scaleFactor              │
│     └─ matrixTransformer.workArea = workArea                    │
│                                                                 │
│  步骤4: 设置视频尺寸                                             │
│  ─────────────────                                              │
│  videoElement.onloadedmetadata                                  │
│  │                                                              │
│  └─ matrixTransformer.setVideoSize(videoWidth, videoHeight)     │
│     │                                                           │
│     ├─ videoWidth = width                                       │
│     ├─ videoHeight = height                                     │
│     └─ _updateDisplayRect()                                     │
│        │                                                        │
│        ├─ 计算宽高比                                             │
│        ├─ 计算displayX, displayY                                │
│        ├─ 计算displayWidth, displayHeight                       │
│        └─ 应用到videoWrapper                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、关键函数调用链

### 4.1 Android端初始化

```
connectToDirectServer(host, port)
    │
    ├─→ window.electronAPI.connectDirectClient()
    │
    ├─→ startControllerConnection()
    │       │
    │       └─→ showRemoteScreen()
    │               │
    │               └─→ setupRemoteScreenInteraction()
    │                       │
    │                       ├─→ new MatrixTransformer()
    │                       │
    │                       ├─→ setContainerSize()
    │                       │
    │                       └─→ new InputDispatcher(matrixTransformer)
    │
    └─→ createPeerConnection()
            │
            ├─→ peerConnection.ondatachannel
            │       │
            │       └─→ dataChannel.onopen
            │
            └─→ dataChannel.onmessage
                    │
                    ├─→ 'screen-size' → updateScreenSize()
                    │
                    └─→ peerConnection.ontrack
                            │
                            └─→ videoElement.onloadedmetadata
                                    │
                                    └─→ setVideoSize()
                                            │
                                            └─→ applyDisplaySize()
```

### 4.2 Windows端初始化

```
startDirectServer(port)
    │
    ├─→ net.createServer()
    │
    └─→ clientSocket.on('connection')
            │
            └─→ handleDirectConnection()
                    │
                    ├─→ createPeerConnection()
                    │       │
                    │       ├─→ createDataChannel('control')
                    │       │
                    │       └─→ dataChannel.onopen
                    │               │
                    │               ├─→ getScreenSize()
                    │               │
                    │               └─→ send({ type: 'screen-size' })
                    │
                    └─→ peerConnection.ontrack
                            │
                            └─→ 发送视频流
```

---

## 五、数据结构

### 5.1 屏幕尺寸消息

```javascript
{
    type: 'screen-size',
    width: 1920,           // 屏幕宽度（像素）
    height: 1080,          // 屏幕高度（像素）
    scaleFactor: 1.25,     // DPI缩放因子
    workArea: {            // 工作区域
        x: 0,
        y: 0,
        width: 1920,
        height: 1040       // 排除任务栏
    }
}
```

### 5.2 MatrixTransformer状态

```javascript
{
    // 用户手势状态
    scale: 1.0,            // 缩放比例
    panX: 0,               // X轴平移
    panY: 0,               // Y轴平移
    
    // 视频尺寸
    videoWidth: 1920,      // 视频宽度
    videoHeight: 1080,     // 视频高度
    
    // 容器尺寸
    containerWidth: 1080,  // 容器宽度
    containerHeight: 1920, // 容器高度
    
    // 远程屏幕尺寸
    remoteScreenWidth: 1920,   // 远程屏幕宽度
    remoteScreenHeight: 1080,  // 远程屏幕高度
    scaleFactor: 1.25,         // DPI缩放因子
    workArea: {...},           // 工作区域
    
    // 计算后的显示区域
    displayX: 0,           // 显示区域X偏移
    displayY: 656.25,      // 显示区域Y偏移
    displayWidth: 1080,    // 显示区域宽度
    displayHeight: 607.5   // 显示区域高度
}
```

---

## 六、时序图

```
时间轴 →

Android端                    Windows端                   MatrixTransformer
    │                            │                              │
    │──── 连接请求 ────────────→│                              │
    │                            │                              │
    │←─── 连接确认 ─────────────│                              │
    │                            │                              │
    │                            │                              │
    │──── WebRTC Offer ────────→│                              │
    │                            │                              │
    │←─── WebRTC Answer ────────│                              │
    │                            │                              │
    │←─── ICE Candidates ──────→│                              │
    │                            │                              │
    │                            │                              │
    │     [数据通道打开]          │                              │
    │                            │                              │
    │                            │── getScreenSize() ──────────→│
    │                            │                              │
    │←─── screen-size ──────────│                              │
    │                            │                              │
    │── updateScreenSize() ─────│────────────────────────────→│
    │                            │                              │
    │                            │     [设置remoteScreenWidth/Height]
    │                            │                              │
    │     [视频流开始]            │                              │
    │                            │                              │
    │── onloadedmetadata ───────│────────────────────────────→│
    │                            │                              │
    │                            │     [设置videoWidth/Height]
    │                            │                              │
    │                            │     [_updateDisplayRect()]
    │                            │                              │
    │                            │     [applyDisplaySize()]
    │                            │                              │
    │     [初始化完成]            │                              │
    │                            │                              │
```

---

## 七、初始化检查点

| 检查点 | 条件 | 结果 |
|--------|------|------|
| 1. 容器尺寸 | `containerWidth > 0 && containerHeight > 0` | 坐标计算基准 |
| 2. 远程屏幕尺寸 | `remoteScreenWidth > 0 && remoteScreenHeight > 0` | 坐标映射目标 |
| 3. 视频尺寸 | `videoWidth > 0 && videoHeight > 0` | 显示区域计算 |
| 4. 显示区域 | `displayWidth > 0 && displayHeight > 0` | 触摸有效区域 |

---

## 八、错误处理

### 8.1 尺寸未初始化

```javascript
// InputDispatcher.dispatchTouchInput() 中的降级处理
if (this.transformer.displayWidth > 0 && this.transformer.displayHeight > 0) {
    // 方案1: 使用精确的显示区域
} else if (this.videoContainerRect && this.videoContainerRect.width > 0) {
    // 方案2: 使用容器尺寸
} else if (this.remoteScreenRect && this.remoteScreenRect.width > 0) {
    // 方案3: 使用remoteScreen尺寸
} else {
    // 方案4: 安全坐标 (0.5, 0.5)
}
```

### 8.2 默认值

```javascript
// MatrixTransformer 默认值
remoteScreenWidth = 1920   // 默认1920
remoteScreenHeight = 1080  // 默认1080
scaleFactor = 1            // 默认1
```

---

## 九、调试日志关键点

### Android端

```
[时间] 收到屏幕尺寸: 1920x1080, scaleFactor=1.25
[时间] 更新屏幕尺寸: 1920x1080, scaleFactor=1.25
[时间] 视频元数据加载: 1920x1080
[时间] 容器尺寸: 1080x1920
```

### Windows端

```
[时间] 数据通道已打开
[时间] 发送屏幕尺寸: 1920x1080
```

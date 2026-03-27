# 打开远程窗口后的程序流程和数据流

## 一、整体流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           打开远程窗口流程                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户操作                                                                    │
│     │                                                                       │
│     ↓                                                                       │
│  点击"连接"按钮                                                              │
│     │                                                                       │
│     ↓                                                                       │
│  showRemoteScreen()                                                         │
│     │                                                                       │
│     ├─→ 隐藏主容器 (#mainContainer)                                          │
│     ├─→ 显示远程屏幕 (#remoteScreen 添加 .active)                            │
│     ├─→ 启动统计监控 (startStatsMonitoring)                                  │
│     │                                                                       │
│     ↓                                                                       │
│  setTimeout(100ms)                                                          │
│     │                                                                       │
│     ↓                                                                       │
│  setupRemoteScreenInteraction()                                             │
│     │                                                                       │
│     ├─→ 创建 MatrixTransformer                                              │
│     ├─→ 设置容器尺寸 (setContainerSize)                                      │
│     ├─→ 创建 InputDispatcher                                                │
│     ├─→ 创建 GestureHandler                                                 │
│     ├─→ 绑定触摸事件到 #remoteScreen                                         │
│     └─→ 设置视频元数据监听 (onloadedmetadata)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、详细程序流程

### 阶段1：显示远程屏幕

```javascript
// 1. 用户点击连接按钮
connectToDirectServer(host, port)
    │
    ↓
// 2. 连接成功后显示远程屏幕
showRemoteScreen()
    │
    ├─→ document.getElementById('mainContainer').style.display = 'none'
    │   // 隐藏登录/选择界面
    │
    ├─→ document.getElementById('remoteScreen').classList.add('active')
    │   // 显示远程屏幕（CSS: display: flex）
    │
    ├─→ startStatsMonitoring()
    │   // 启动统计信息监控（帧率、延迟、码率）
    │
    └─→ setTimeout(() => { setupRemoteScreenInteraction() }, 100)
        // 延迟100ms初始化交互（等待DOM渲染）
```

### 阶段2：初始化交互

```javascript
setupRemoteScreenInteraction()
    │
    ├─→ 获取DOM元素
    │   const remoteScreen = document.getElementById('remoteScreen')
    │   const videoContainer = document.getElementById('videoContainer')
    │
    ├─→ 创建 MatrixTransformer
    │   matrixTransformer = new MatrixTransformer()
    │   matrixTransformer.setContainerSize(containerRect.width, containerRect.height)
    │
    ├─→ 创建 InputDispatcher
    │   inputDispatcher = new InputDispatcher(matrixTransformer)
    │
    ├─→ 创建 GestureHandler
    │   gestureHandler = new GestureHandler(matrixTransformer, inputDispatcher, null)
    │
    ├─→ 绑定触摸事件
    │   remoteScreen.addEventListener('touchstart', ...)
    │   remoteScreen.addEventListener('touchmove', ...)
    │   remoteScreen.addEventListener('touchend', ...)
    │
    └─→ 设置视频元数据监听
        remoteVideo.onloadedmetadata = () => {
            matrixTransformer.setVideoSize(videoWidth, videoHeight)
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
        }
```

---

## 三、数据流

### 3.1 视频数据流

```
Windows端（被控端）                        Android端（主控端）
        │                                        │
        │  捕获屏幕                               │
        │  navigator.mediaDevices.getDisplayMedia()
        │        │                               │
        │        ↓                               │
        │  创建 MediaStream                      │
        │        │                               │
        │        ↓                               │
        │  peerConnection.addTrack(stream)       │
        │        │                               │
        │        │  WebRTC P2P                   │
        │        ├──────────────────────────────→│
        │        │                               │
        │        │                               ↓
        │        │                    peerConnection.ontrack
        │        │                               │
        │        │                               ↓
        │        │                    remoteVideo.srcObject = stream
        │        │                               │
        │        │                               ↓
        │        │                    视频播放
        │        │                               │
        │        │                               ↓
        │        │                    onloadedmetadata 触发
        │        │                               │
        │        │                               ↓
        │        │                    matrixTransformer.setVideoSize()
        │        │                    matrixTransformer.applyContainerSize()
```

### 3.2 输入数据流

```
Android端（主控端）                        Windows端（被控端）
        │                                        │
        │  用户触摸屏幕                           │
        │  touchstart/touchmove/touchend         │
        │        │                               │
        │        ↓                               │
        │  GestureHandler.handleTouchStart()     │
        │        │                               │
        │        ↓                               │
        │  InputDispatcher.dispatchTouchInput()  │
        │        │                               │
        │        ├─→ 坐标转换                     │
        │        │   containerX = clientX - rect.left
        │        │   containerY = clientY - rect.top
        │        │                               │
        │        ├─→ 有效区域检测                 │
        │        │   isValidArea = ...           │
        │        │                               │
        │        ├─→ 远程坐标计算                 │
        │        │   remote = containerToRemote()
        │        │                               │
        │        ├─→ 归一化坐标                   │
        │        │   normalizedX = remote.x / remoteScreenWidth
        │        │   normalizedY = remote.y / remoteScreenHeight
        │        │                               │
        │        ↓                               │
        │  sendControlCommand({                  │
        │      type: 'mousedown',                │
        │      x: normalizedX,                   │
        │      y: normalizedY,                   │
        │      button: 0                         │
        │  })                                    │
        │        │                               │
        │        │  WebRTC DataChannel           │
        │        ├──────────────────────────────→│
        │        │                               │
        │        │                               ↓
        │        │                    dataChannel.onmessage
        │        │                               │
        │        │                               ↓
        │        │                    handleRemoteInput(data)
        │        │                               │
        │        │                               ↓
        │        │                    坐标转换
        │        │                    pixelX = normalizedX * screenWidth
        │        │                    pixelY = normalizedY * screenHeight
        │        │                               │
        │        │                               ↓
        │        │                    执行输入操作
        │        │                    mouse.move(new Point(pixelX, pixelY))
```

### 3.3 控制数据流

```
Android端（主控端）                        Windows端（被控端）
        │                                        │
        │  用户操作控制按钮                       │
        │  例如：点击"键盘"按钮                   │
        │        │                               │
        │        ↓                               │
        │  toggleKeyboard()                      │
        │        │                               │
        │        ↓                               │
        │  显示/隐藏键盘覆盖层                    │
        │        │                               │
        │        ↓                               │
        │  用户按下键盘                          │
        │        │                               │
        │        ↓                               │
        │  handleKeyDown(event)                  │
        │        │                               │
        │        ├─→ 获取按键信息                 │
        │        │   code = event.code           │
        │        │   key = event.key             │
        │        │                               │
        │        ↓                               │
        │  sendControlCommand({                  │
        │      type: 'keydown',                  │
        │      code: 'KeyA',                     │
        │      key: 'a'                          │
        │  })                                    │
        │        │                               │
        │        │  WebRTC DataChannel           │
        │        ├──────────────────────────────→│
        │        │                               │
        │        │                               ↓
        │        │                    handleKeyDown(data)
        │        │                               │
        │        │                               ↓
        │        │                    keyboard.pressKey(Key.A)
```

---

## 四、初始化时序图

```
时间轴 →

用户操作          Android端                    Windows端
    │                 │                            │
    │  点击连接       │                            │
    │ ───────────────→│                            │
    │                 │                            │
    │                 │  connectToDirectServer()   │
    │                 │                            │
    │                 │  showRemoteScreen()        │
    │                 │      │                     │
    │                 │      ├─ 隐藏主容器          │
    │                 │      ├─ 显示远程屏幕        │
    │                 │      └─ 启动统计监控        │
    │                 │                            │
    │                 │  [100ms后]                 │
    │                 │                            │
    │                 │  setupRemoteScreenInteraction()
    │                 │      │                     │
    │                 │      ├─ 创建MatrixTransformer
    │                 │      ├─ 创建InputDispatcher
    │                 │      ├─ 创建GestureHandler
    │                 │      └─ 绑定触摸事件        │
    │                 │                            │
    │                 │  [WebRTC连接建立]          │
    │                 │                            │
    │                 │  peerConnection.ontrack    │
    │                 │      │                     │
    │                 │      └─ 设置视频流          │
    │                 │                            │
    │                 │  dataChannel.onopen        │
    │                 │                            │
    │                 │                    dataChannel.onopen
    │                 │                            │
    │                 │                    getScreenSize()
    │                 │                            │
    │                 │  ←─────────────────────── 发送屏幕尺寸
    │                 │                            │
    │                 │  updateScreenSize()        │
    │                 │      │                     │
    │                 │      └─ 设置远程屏幕尺寸    │
    │                 │                            │
    │                 │  video.onloadedmetadata    │
    │                 │      │                     │
    │                 │      ├─ 设置视频尺寸        │
    │                 │      └─ 应用容器尺寸        │
    │                 │                            │
    │                 │  [初始化完成，可以交互]      │
```

---

## 五、关键函数调用链

### 5.1 显示远程屏幕

```
showRemoteScreen()
    │
    ├─→ document.getElementById('mainContainer').style.display = 'none'
    │
    ├─→ document.getElementById('remoteScreen').classList.add('active')
    │
    ├─→ startStatsMonitoring()
    │   │
    │   └─→ setInterval(() => {
    │           peerConnection.getStats().then(stats => {
    │               // 更新帧率、延迟、码率显示
    │           })
    │       }, 1000)
    │
    └─→ setTimeout(() => { setupRemoteScreenInteraction() }, 100)
```

### 5.2 初始化交互

```
setupRemoteScreenInteraction()
    │
    ├─→ new MatrixTransformer()
    │   │
    │   └─→ constructor()
    │       ├─ scale = 1.0
    │       ├─ panX = 0, panY = 0
    │       ├─ remoteScreenWidth = 1920, remoteScreenHeight = 1080
    │       └─ displayX = 0, displayY = 0, displayWidth = 0, displayHeight = 0
    │
    ├─→ matrixTransformer.setContainerSize(width, height)
    │   │
    │   └─→ containerWidth = width, containerHeight = height
    │       _updateDisplayRect()
    │
    ├─→ new InputDispatcher(matrixTransformer)
    │   │
    │   └─→ constructor(transformer)
    │       ├─ this.transformer = transformer
    │       ├─ lastInputTime = 0
    │       └─ inputThrottleMs = 8
    │
    ├─→ new GestureHandler(matrixTransformer, inputDispatcher, null)
    │   │
    │   └─→ constructor(transformer, inputDispatcher, videoElement)
    │       ├─ this.transformer = transformer
    │       ├─ this.inputDispatcher = inputDispatcher
    │       ├─ touches = new Map()
    │       └─ lastTapTime = 0
    │
    ├─→ remoteScreen.addEventListener('touchstart', ...)
    ├─→ remoteScreen.addEventListener('touchmove', ...)
    └─→ remoteScreen.addEventListener('touchend', ...)
```

### 5.3 触摸事件处理

```
remoteScreen.addEventListener('touchstart', (e) => {
    │
    ├─→ const touch = e.touches[0]
    │
    ├─→ if (isTouchOnUI(touch.clientX, touch.clientY)) return
    │   │
    │   └─→ 检测是否触摸在控制栏、键盘等UI元素上
    │
    └─→ gestureHandler.handleTouchStart(e)
        │
        └─→ handleTouchStart(event)
            │
            ├─→ event.preventDefault()
            │
            ├─→ for (touch of event.touches)
            │   │
            │   ├─→ this.touches.set(pointerId, { x, y, startTime })
            │   │
            │   └─→ if (event.touches.length === 1)
            │       │
            │       └─→ startSingleTouch(touch)
            │           │
            │           └─→ inputDispatcher.dispatchTouchInput(
            │                   touch.clientX, touch.clientY, 'mousedown', 0
            │               )
```

---

## 六、数据结构

### 6.1 输入命令

```javascript
{
    type: 'mousedown',      // 事件类型
    x: 0.5,                 // 归一化X坐标 (0-1)
    y: 0.3,                 // 归一化Y坐标 (0-1)
    button: 0               // 鼠标按钮 (0=左键, 1=中键, 2=右键)
}
```

### 6.2 屏幕尺寸消息

```javascript
{
    type: 'screen-size',
    width: 1920,            // 屏幕宽度
    height: 1080,           // 屏幕高度
    scaleFactor: 1.25,      // DPI缩放因子
    workArea: {             // 工作区域
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
    }
}
```

### 6.3 键盘事件

```javascript
{
    type: 'keydown',        // 或 'keyup'
    code: 'KeyA',           // 按键代码
    key: 'a',               // 按键字符
    ctrlKey: false,         // Ctrl键状态
    shiftKey: false,        // Shift键状态
    altKey: false,          // Alt键状态
    metaKey: false          // Meta键状态
}
```

---

## 七、状态管理

### 7.1 MatrixTransformer 状态

```javascript
{
    // 用户手势状态
    scale: 1.0,             // 当前缩放比例
    panX: 0,                // X轴平移
    panY: 0,                // Y轴平移
    
    // 视频尺寸
    videoWidth: 1920,       // 视频宽度
    videoHeight: 1080,      // 视频高度
    
    // 容器尺寸
    containerWidth: 1080,   // 容器宽度
    containerHeight: 1920,  // 容器高度
    
    // 远程屏幕尺寸
    remoteScreenWidth: 1920,
    remoteScreenHeight: 1080,
    scaleFactor: 1.25,
    workArea: {...},
    
    // 计算后的显示区域
    displayX: 0,            // 显示区域X偏移
    displayY: 410,          // 显示区域Y偏移（黑边）
    displayWidth: 1080,     // 显示区域宽度
    displayHeight: 1100     // 显示区域高度
}
```

### 7.2 InputDispatcher 状态

```javascript
{
    transformer: MatrixTransformer,
    lastInputTime: 1234567890,
    inputThrottleMs: 8,
    currentMode: 'touch',
    isMouseDown: false,
    lastTapTime: 0,
    remoteScreenRect: null,
    videoContainerRect: null
}
```

### 7.3 GestureHandler 状态

```javascript
{
    transformer: MatrixTransformer,
    inputDispatcher: InputDispatcher,
    videoElement: HTMLVideoElement,
    touches: Map(),         // 当前触摸点
    isMouseDown: false,
    lastTapTime: 0,
    isPinching: false,
    activePointerId: null,
    isInTouchMode: true
}
```

---

## 八、调试日志关键点

### Android端

```
[时间] 初始化远程屏幕交互...
[时间] 容器尺寸: 1080x1920
[时间] 远程屏幕交互已初始化 - 事件绑定在 remoteScreen 层
[时间] 收到屏幕尺寸: 1920x1080, scaleFactor=1.25
[时间] 更新屏幕尺寸: 1920x1080, scaleFactor=1.25
[时间] 视频元数据加载: 1920x1080
[时间] GestureHandler: touchstart on remoteScreen
[时间] InputDispatcher: 坐标转换 - clientX=540, clientY=960 → containerX=540, containerY=960
[时间] InputDispatcher: 发送输入 - type=mousedown, remoteX=960, remoteY=540
```

### Windows端

```
[时间] 数据通道已打开
[时间] 发送屏幕尺寸: 1920x1080
[时间] 收到输入: type=mousedown, x=0.5, y=0.5
[时间] 执行鼠标操作: move to (960, 540)
```

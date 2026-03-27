# Android端页面层级结构文档

## 页面层级总览

```
body
├── .container (主容器 - 登录/选择界面)
│   ├── .header (头部)
│   ├── .content (内容区域)
│   │   ├── #rolePage (角色选择页)
│   │   ├── #controllerPage (主控端页)
│   │   └── #controlledPage (被控端页)
│   └── .footer (底部)
│
├── .remote-screen (远程屏幕 - 控制界面)
│   ├── .stats-overlay (统计信息覆盖层)
│   ├── .remote-video-container (视频容器)
│   │   └── .video-wrapper (视频包装器)
│   │       └── .remote-video (视频元素)
│   ├── .control-overlay (控制按钮覆盖层)
│   └── .control-toggle (控制切换按钮)
│
├── .keyboard-overlay (键盘覆盖层)
├── .toast (提示消息)
└── .mouse-mode-modal (鼠标模式选择框)
```

---

## 第一层：主容器层 (container)

### 作用
- 应用启动时的主界面
- 提供角色选择和连接配置功能
- 管理登录/连接流程

### 子元素详解

#### 1. header (头部)
```
.header
├── h1: "YCDesk"
└── p: "远程桌面控制 - Android 版本"
```
**作用**: 显示应用标题和版本信息

#### 2. content (内容区域)
```
.content
├── #rolePage.active (角色选择页)
├── #controllerPage (主控端页)
└── #controlledPage (被控端页)
```

##### 2.1 rolePage (角色选择页)
**作用**: 让用户选择主控端或被控端角色
**元素**:
- 主控端卡片 (onclick="selectRole('controller')")
- 被控端卡片 (onclick="selectRole('controlled')")

##### 2.2 controllerPage (主控端页)
**作用**: 配置并建立远程连接
**子结构**:
```
#controllerPage
├── 返回按钮
├── .section
│   ├── 连接模式选择器
│   │   ├── 直连模式
│   │   └── 信令服务器模式
│   │
│   ├── #controllerDirectMode (直连模式内容)
│   │   ├── 历史连接记录
│   │   ├── IP地址输入框
│   │   ├── 端口输入框
│   │   └── 连接按钮
│   │
│   ├── #controllerSignalingMode (信令模式内容)
│   │   ├── 历史连接记录
│   │   ├── 服务器地址输入框
│   │   ├── 连接/断开按钮
│   │   ├── 设备ID输入框
│   │   └── 连接按钮
│   │
│   └── .log-box (连接日志)
```

##### 2.3 controlledPage (被控端页)
**作用**: 被控端配置（仅演示用）
**子结构**:
```
#controlledPage
├── 返回按钮
├── .section (设备信息)
│   ├── 设备ID显示
│   └── 状态徽章
├── .section (连接模式)
│   ├── 直连模式
│   └── 信令服务器模式
└── .log-box (连接日志)
```

#### 3. footer (底部)
**作用**: 显示版本信息
**内容**: "YCDesk v1.0.0 Android | 仅作为控制端使用"

---

## 第二层：远程屏幕层 (remote-screen)

### 作用
- 显示远程桌面视频流
- 处理触摸/鼠标输入
- 提供控制功能

### 触摸事件绑定
**关键**: 所有触摸事件都绑定在 `#remoteScreen` 上
```javascript
remoteScreen.addEventListener('touchstart', ...)
remoteScreen.addEventListener('touchmove', ...)
remoteScreen.addEventListener('touchend', ...)
```

### 子元素详解

#### 1. stats-overlay (统计信息覆盖层)
```
.stats-overlay
├── 分辨率显示
├── 帧率显示
├── 延迟显示
└── 码率显示
```
**位置**: 绝对定位，左上角 (top: 10px, left: 10px)
**z-index**: 100
**作用**: 实时显示连接质量信息

#### 2. remote-video-container (视频容器)
```
.remote-video-container
└── .video-wrapper
    └── .remote-video (video元素)
```

##### 2.1 video-wrapper (视频包装器)
**作用**: 
- 支持缩放和平移变换
- 通过CSS transform实现
- `touch-action: none` 禁用浏览器默认触摸行为

**变换模式**:
- 默认模式: 100%宽高，居中显示
- float-mode: 90%宽，80%高，圆角阴影
- fullscreen-mode: 100%宽高，无圆角

##### 2.2 remote-video (视频元素)
**作用**: 显示WebRTC视频流
**属性**: `autoplay playsinline`
**样式**: `object-fit: contain`

#### 3. control-overlay (控制按钮覆盖层)
```
.control-overlay
├── 👁️ (隐藏/显示控制按钮)
├── ⌨️ (切换键盘)
├── 🖱️ (切换鼠标模式)
├── ↺ (重置缩放)
├── ⚶ (全屏切换)
└── ✕ (断开连接)
```
**位置**: 固定定位，底部居中 (bottom: 15px)
**z-index**: 1000
**状态**:
- 正常状态: 显示所有按钮
- minimized: 缩小按钮尺寸
- hidden: 隐藏控制栏

#### 4. control-toggle (控制切换按钮)
**作用**: 当控制栏隐藏时，显示此按钮以恢复控制栏
**位置**: 固定定位，右下角 (bottom: 5px, right: 10px)
**z-index**: 999

---

## 第三层：覆盖层 (Overlays)

### 1. keyboard-overlay (键盘覆盖层)
```
.keyboard-overlay
├── 第一行: ESC, F1-F12, DEL
├── 第二行: ` 1-0 - = Backspace
├── 第三行: TAB Q-P [ ] \
├── 第四行: CAPS A-L ; ' Enter
├── 第五行: SHIFT Z-M , . / SHIFT
└── 第六行: CTRL WIN ALT Space ALT 方向键 CTRL
```
**位置**: 固定定位，底部 (bottom: 0)
**z-index**: 10001
**最大高度**: 33.33vh
**激活状态**: 添加 `.active` 类

### 2. toast (提示消息)
**作用**: 显示临时提示信息
**位置**: 固定定位，顶部居中 (top: 15px)
**z-index**: 9999
**显示**: 添加 `.show` 类

### 3. mouse-mode-modal (鼠标模式选择框)
```
.mouse-mode-modal
└── .mouse-mode-dialog
    ├── 标题: "选择鼠标模式"
    └── .mouse-mode-options
        ├── 指针模式选项
        └── 触屏模式选项
```
**位置**: 固定定位，全屏居中
**z-index**: 10002
**显示**: 添加 `.show` 类

---

## 层级关系和z-index分布

```
z-index 层级分布：
10002 - mouse-mode-modal (鼠标模式选择框)
10001 - keyboard-overlay (键盘覆盖层)
1000  - control-overlay (控制按钮)
999   - control-toggle (控制切换按钮)
100   - stats-overlay (统计信息)
```

---

## 触摸事件流向

### 1. 触摸事件捕获流程
```
用户触摸屏幕
    ↓
#remoteScreen 捕获 touchstart/touchmove/touchend
    ↓
isTouchOnUI() 检查是否触摸在UI元素上
    ↓ (不在UI上)
gestureHandler.handleTouchStart/Move/End()
    ↓
inputDispatcher.dispatchTouchInput()
    ↓
sendControlCommand()
    ↓
dataChannel.send() → Windows端
```

### 2. UI元素检测
**检测的UI元素**:
- controlOverlay (控制按钮栏)
- controlToggle (控制切换按钮)
- statsOverlay (统计信息)
- keyboardOverlay (键盘)
- mouseModeModal (鼠标模式选择框)

**作用**: 防止触摸操作时误触UI控件

---

## 坐标系统

### 1. 视口坐标 (clientX, clientY)
- 来自触摸事件的原始坐标
- 相对于浏览器视口

### 2. 容器坐标
```javascript
containerX = clientX - videoContainerRect.left
containerY = clientY - videoContainerRect.top
```

### 3. 归一化坐标 (0-1)
```javascript
normalizedX = containerX / containerRect.width
normalizedY = containerY / containerRect.height
```

### 4. 远程屏幕坐标
```javascript
remoteX = normalizedX * remoteScreenWidth
remoteY = normalizedY * remoteScreenHeight
```

---

## 显示模式

### 1. 角色选择模式
- `.container` 显示
- `.remote-screen` 隐藏

### 2. 远程控制模式
- `.container` 隐藏
- `.remote-screen` 显示并添加 `.active` 类

### 3. 全屏模式
- `.remote-screen` 添加 `.fullscreen-mode` 类
- 隐藏 `.stats-overlay`
- 调整 `.control-overlay` 位置

### 4. 横屏模式
- `.remote-screen` 添加 `.landscape-mode` 类
- 自动全屏显示
- 隐藏统计信息

### 5. 键盘可见模式
- `.remote-screen` 添加 `.keyboard-visible` 类
- 调整控制栏和统计信息位置

---

## 关键CSS特性

### 1. 视频容器
```css
.remote-video-container {
    overflow: hidden;  /* 防止内容溢出 */
    touch-action: none; /* 禁用浏览器默认触摸行为 */
}
```

### 2. 视频包装器
```css
.video-wrapper {
    transform-origin: center center; /* 变换原点居中 */
    touch-action: none; /* 禁用浏览器默认触摸行为 */
    transition: none; /* 禁用过渡动画，提高响应速度 */
}
```

### 3. 视频元素
```css
.remote-video {
    object-fit: contain; /* 保持宽高比 */
}
```

---

## 调试边框说明

当前代码中保留了彩色调试边框：
- **红色边框**: `.remote-screen`
- **绿色边框**: `.remote-video-container`
- **蓝色边框**: `.video-wrapper`
- **紫色边框**: `.stats-overlay`
- **橙色边框**: `.control-overlay`

**用途**: 帮助识别各层元素的位置和大小

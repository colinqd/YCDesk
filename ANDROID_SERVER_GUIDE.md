# YCDesk v2.0 更新说明

## 概述
本次更新包含以下三项主要改进：
1. 实施方案 A（隐藏远程鼠标 + 点击确认反馈）
2. 修复 server-gui 客户端无法连接的问题
3. 为 Android 添加 server-gui 端支持

---

## 1. 实施方案 A

### 修改内容：
- **Windows 端主控端** (`windows/remote.html`):
  - 添加了 `.click-indicator` 样式类，用于点击时的视觉反馈
  - 添加了 `showClickIndicator()` 函数，在点击时显示红色圆圈动画
  - 在 `mousedown` 事件中调用该函数，提供即时反馈

- **Windows 端被控端** (`windows/src/main/input-handler.js`):
  - 添加了 `hideCursor()` 和 `showCursor()` 函数
  - 在连接建立时自动隐藏远程光标
  - 在断开连接时自动显示远程光标
  - 添加了 `cursorHidden` 状态跟踪变量

- **IPC 处理** (`windows/src/main/ipc-handlers.js`):
  - 添加了 `hide-cursor` 和 `show-cursor` IPC 处理
  - 在 `preload.js` 中暴露了相应的 API

- **直连模式** (`windows/src/renderer/js/direct-mode.js`):
  - 在连接建立时调用 `hideCursor()`
  - 在连接断开时调用 `showCursor()`

### 使用效果：
- 主控端：点击时会看到红色圆圈动画提示，确认点击已发送
- 被控端：光标在连接期间自动隐藏，提供更自然的操作体验

---

## 2. 修复 server-gui 客户端无法连接的问题

### 问题分析：
客户端在注册设备时发送的数据格式与服务器期望的格式不匹配：
- **客户端发送**：`socket.emit('register', deviceId)`（字符串）
- **服务器期望**：`socket.emit('register', { deviceId: deviceId })`（对象）

### 修复文件：
1. **Windows 端** (`windows/src/renderer/js/signaling-mode.js`):
   - 第 163 行：将 `socket.emit('register', this.myDeviceId)` 
     改为 `socket.emit('register', { deviceId: this.myDeviceId })`

2. **Android 端** (`android/app.js`):
   - 第 1279 行：同样的修复

---

## 3. 为 Android 添加 server-gui 端代码

### 说明：
由于 Android 环境的特殊性，我们采用以下方案：

### 方案一：使用现有的 server-gui（推荐）
在同一局域网内的 Windows 或 Linux 设备上运行 `server-gui` 程序，Android 设备连接到该服务器。

### 方案二：在 Android 设备上实现简单的信令服务器
如果需要在 Android 设备上直接运行信令服务器，建议：

1. **使用 NanoHTTPD**（轻量级 Java HTTP 服务器）
2. **添加 WebSocket 支持**（使用 Java-WebSocket 库）

#### Android 端修改建议：

**1. 在 `android/android/app/build.gradle` 中添加依赖：**
```gradle
dependencies {
    implementation 'org.nanohttpd:nanohttpd:2.3.1'
    implementation 'org.java-websocket:Java-WebSocket:1.5.3'
}
```

**2. 创建 SignalingServerPlugin.java**（Capacitor 插件）：
```java
package com.ycdesk.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

public class SignalingServerPlugin extends Plugin {
    // 实现信令服务器功能
}
```

**3. 在 MainActivity.java 中注册插件：**
```java
registerPlugin(SignalingServerPlugin.class);
```

### 当前状态：
- ✅ Android 项目版本已更新至 2.0.0
- ✅ 已修复 Android 端的连接注册问题
- ✅ 可以连接到外部运行的 server-gui

---

## 使用说明

### Windows 端开发：
```bash
cd windows
npm install          # 安装依赖
npm run dev          # 开发模式
npm run dev:watch    # 开发模式（自动重启）
npm run build        # 构建
npm run build:watch  # 构建模式（自动构建）
```

### Android 端开发：
```bash
cd android
npm install          # 安装依赖
npm run dev          # Web 开发模式
npm run cap:build    # 构建并同步到 Android
npm run cap:open     # 打开 Android Studio
```

### Server-gui 使用：
```bash
cd server-gui
npm install          # 安装依赖
npm run dev          # 启动 server-gui
```

---

## Git 提交建议

提交信息示例：
```
Windows版本2.0更新:
- 实施方案A: 隐藏远程鼠标 + 点击确认反馈
- 修复server-gui连接问题: 修正设备注册数据格式
- 更新Android端: 修复连接问题，版本升级至2.0.0
```

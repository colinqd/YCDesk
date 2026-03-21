# YCDesk - 远程桌面控制软件

类似 ToDesk 的跨平台远程桌面控制软件，使用 Electron + WebRTC 技术栈开发。

## 项目结构

```
YCDesk/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── index.html           # 主界面
├── remote.html          # 远程控制窗口
├── package.json         # 客户端依赖配置
├── .npmrc              # 国内镜像源配置
├── .gitignore          # Git 忽略文件
├── start-server.bat    # 一键启动服务器
├── start-client.bat    # 一键启动客户端
├── server/             # 信令服务器
│   ├── server.js       # 服务器主文件
│   └── package.json    # 服务器依赖配置
└── README.md           # 项目说明
```

## 当前状态

**项目框架已完成！** ✅

### 已实现功能
- ✅ Electron 主进程框架
- ✅ 精美主界面 UI（设备 ID 显示、连接输入）
- ✅ 远程控制窗口框架
- ✅ 设备 ID 生成
- ✅ 信令服务器（Socket.IO）
- ✅ 屏幕捕获 API 准备

### 开发中功能
- 🔄 WebRTC P2P 连接
- 🔄 屏幕共享传输
- 🔄 鼠标键盘控制

## 安装与运行

### 前置要求
- Node.js v16 或更高版本
- npm（随 Node.js 一起安装）

### 1. 安装依赖

首先安装客户端和服务器的依赖：

```bash
# 安装客户端依赖
npm install

# 安装服务器依赖
cd server
npm install
cd ..
```

**注意**：已配置 `.npmrc` 使用国内镜像源加速下载。

### 2. 启动信令服务器

**方式一：使用批处理文件（Windows）**
```bash
start-server.bat
```

**方式二：手动启动**
```bash
cd server
npm start
```

服务器将在 `http://localhost:3000` 启动。

### 3. 启动客户端

打开新的终端窗口：

**方式一：使用批处理文件（Windows）**
```bash
start-client.bat
```

**方式二：手动启动**
```bash
npm start
```

**调试模式（带开发者工具）：**
```bash
npm run dev
```

## 技术栈

### 客户端
- **Electron** - 跨平台桌面应用框架
- **WebRTC** - 点对点音视频通信（开发中）
- **Socket.IO Client** - 与信令服务器通信

### 服务器
- **Node.js** - 运行时环境
- **Express** - Web 框架
- **Socket.IO** - WebSocket 实时通信

## 开发计划

### 第一阶段 (MVP)
- [x] 项目框架搭建
- [x] UI 界面设计
- [x] 信令服务器基础
- [ ] WebRTC 连接建立
- [ ] 屏幕捕获与共享
- [ ] 鼠标控制

### 第二阶段
- [ ] 键盘控制
- [ ] 文件传输
- [ ] 剪贴板同步
- [ ] 多显示器支持

### 第三阶段
- [ ] P2P 穿透优化
- [ ] 音频传输
- [ ] 远程打印
- [ ] 会话录制

## WebRTC 连接流程

```
主控端                    信令服务器                    被控端
  |                          |                          |
  |---- 连接请求 ----------->|                          |
  |                          |---- 连接通知 ---------->|
  |                          |                          |
  |                          |<--- 连接确认 -----------|
  |<--- 连接结果 -----------|                          |
  |                          |                          |
  |---- Offer ------------->|                          |
  |                          |---- Offer ------------->|
  |                          |                          |
  |                          |<---- Answer ------------|
  |<---- Answer ------------|                          |
  |                          |                          |
  |---- ICE Candidate ----->|                          |
  |                          |---- ICE Candidate ----->|
  |                          |                          |
  |<------------------- P2P 连接建立 ----------------->|
  |                          |                          |
  |<============== 屏幕媒体流 (WebRTC) ==============>|
```

## 常见问题

### Electron 下载慢
已配置 `.npmrc` 使用国内镜像源，如仍有问题可手动设置：
```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

### 端口被占用
修改 `server/server.js` 中的 PORT 常量，或关闭占用 3000 端口的程序。

## 贡献

欢迎提交 Issue 和 Pull Request！

## License

MIT

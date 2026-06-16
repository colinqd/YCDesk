# YCDesk - 远程桌面控制

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/colinqd/YCDesk/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android%20%7C%20Linux-green.svg)](https://github.com/colinqd/YCDesk)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/electron-28%2B-blue.svg)](https://electronjs.org)
[![Release](https://img.shields.io/github/v/release/colinqd/YCDesk?sort=semver)](https://github.com/colinqd/YCDesk/releases)

YCDesk 是一个高性能跨平台远程桌面控制应用，使用 Electron + WebRTC 技术栈开发，支持 Windows、Android 和 Linux 系统。

## ✨ 功能特性

- 🚀 WebRTC P2P 实时视频流传输
- 🖱️ 鼠标和键盘远程控制
- 🔗 信令服务器模式
- 📶 直连模式（无需服务器）
- 📋 剪贴板同步
- 📁 多显示器支持
- 🎮 游戏优化性能优化编码
- 🌐 跨平台（Windows / Android / Linux）
- 🔒 安全的点对点连接

## 📱 支持平台

| 平台 | 状态 | 下载 |
|------|------|------|
| Windows | ✅ 稳定版 | [下载](https://github.com/colinqd/YCDesk/releases) |
| Android | ✅ 稳定版 | [下载](https://github.com/colinqd/YCDesk/releases) |
| Linux | ✅ 稳定版 | [下载](https://github.com/colinqd/YCDesk/releases) |
| 信令服务器 | ✅ 跨平台 | [下载](https://github.com/colinqd/YCDesk/releases) |

## 🚀 快速开始

### 安装使用

#### Windows

1. 从 [Releases](https://github.com/colinqd/YCDesk/releases) 页面下载最新版 YCDesk-Setup.exe 或 YCDesk-Portable.exe
2. 安装或直接运行便携版
3. 在两台设备上同时启动 YCDesk
4. 选择连接模式（直连或信令服务器）
5. 输入目标设备 ID 开始控制

#### Linux

```bash
# Ubuntu/Debian
sudo dpkg -i ycdesk_0.1.0_amd64.deb

# 或运行 AppImage
chmod +x YCDesk-0.1.0.AppImage
./YCDesk-0.1.0.AppImage
```

#### Android

1. 下载 YCDesk.apk
2. 在手机上安装并允许所需权限
3. 启动应用程序

### 开发编译

#### 前置要求

- Node.js 18+
- npm 或 yarn
- Git

#### 克隆仓库

```bash
git clone https://github.com/colinqd/YCDesk.git
cd YCDesk
```

#### 开发环境

##### Windows

```bash
cd windows
npm install
npm run dev
```

##### Linux

```bash
cd linux
npm install
npm start
```

##### Android

```bash
cd android
npm install
npx cap sync
# 使用 Android Studio 打开 android 目录进行构建
```

##### 信令服务器

```bash
cd server
npm install
node server.js
```

## 📖 详细文档

### 项目结构

```
YCDesk/
├── shared/              # 共享代码（所有平台共用）
│   ├── components/
│   ├── core/
│   ├── managers/
│   ├── platform/
│   ├── utils/
│   └── video/
├── windows/             # Windows 客户端
├── android/             # Android 客户端
├── linux/             # Linux 客户端
├── server/             # 信令服务器（跨平台通用）
├── server-gui/       # 信令服务器 GUI 版
├── assets/             # 资源文件
└── README.md
```

### 架构说明

#### 连接模式

**信令服务器模式：**
- 需要部署自己的信令服务器或使用公共服务器
- 通过设备 ID 匹配连接
- 支持内网穿透

**直连模式：**
- 无需服务器
- 适用于局域网
- 直接 IP 地址连接

#### WebRTC 连接流程

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

## 🛠️ 编译构建

### Windows

```bash
cd windows

# 安装依赖
npm install

# 同步共享文件
npm run sync

# 构建便携版
npm run build:portable

# 构建安装版
npm run build
```

### Linux

```bash
cd linux

# 安装依赖
npm install

# 构建所有格式
npm run build

# DEB 包
npm run build:deb

# AppImage
npm run build:appimage
```

### 信令服务器

```bash
cd server-gui
npm install
npm run build:win
```

## 🐛 常见问题

### Electron 下载慢

已配置 `.npmrc` 使用国内镜像源，如仍有问题可手动设置：

```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

### 端口被占用

修改 server/server.js 中的 PORT 常量，或关闭占用 3000 端口的程序。

### GPU 硬件编码问题

若屏幕捕获无画面或编码失败（常见于 NVIDIA 旧版驱动），尝试在开发模式下禁用 GPU 沙箱：

```bash
YCDESK_DISABLE_GPU_SANDBOX=1 npm start
```

打包后的应用始终启用 GPU 沙箱以保障安全。如遇硬件编码问题，建议更新显卡驱动至最新版本。

### 直连模式连接问题

确保两台设备在同一局域网内，检查防火墙设置，确保所需端口开放。

## 📦 技术栈

### 客户端

- **Electron** - 跨平台桌面应用框架
- **WebRTC** - 点对点音视频通信
- **Socket.IO Client** - 与信令服务器通信
- **Node.js** - 运行时环境

### 服务器

- **Express** - Web 框架
- **Socket.IO** - WebSocket 实时通信

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件查看详情

## 💖 致谢

感谢所有为本项目做出贡献的开发者！

---

**YCDesk © 2024 - 让远程连接更简单**

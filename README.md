# YCDesk - 远程桌面控制

YCDesk 是一个跨平台的远程桌面控制应用，支持 Windows、Android 和 Linux。

## 目录结构

```
YCDesk/
├── shared/              # 共享代码（所有平台共用）
│   ├── components/
│   ├── core/
│   ├── managers/
│   ├── platform/
│   ├── utils/
│   └── video/
├── server/              # 信令服务器（跨平台通用）
├── windows/             # Windows 客户端
├── android/             # Android 客户端
├── linux/               # Linux 客户端
├── assets/              # 资源文件
└── README.md
```

## 快速开始

### Windows

```bash
cd windows
npm install
npm start
```

### Linux

```bash
cd linux
npm install
npm start
```

### Android

```bash
cd android
npm install
npx cap sync
# 使用 Android Studio 打开 android/ 目录进行构建
```

### 信令服务器

```bash
cd server
npm install
node server.js
```

## 功能特性

- WebRTC 视频流传输
- 鼠标和键盘远程控制
- 信令服务器模式
- 直连模式
- 跨平台支持

## 许可证

MIT

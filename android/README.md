# YCDesk Android 版本

基于 Capacitor 开发的 Android 版本远程桌面控制应用。

## 技术栈

- **Capacitor**: 跨平台原生应用容器
- **Vite**: 前端构建工具
- **WebRTC**: 点对点音视频通信
- **Socket.IO**: WebSocket实时通信

## 环境要求

- Node.js 18+
- npm 或 yarn
- Android Studio (用于构建APK)
- JDK 17+
- Android SDK API 22+

## 项目结构

```
android/
├── package.json          # 项目依赖配置
├── vite.config.js        # Vite配置
├── capacitor.config.json # Capacitor配置
├── index.html           # 主页面
├── app.js              # 应用逻辑
└── README.md           # 本文件
```

## 安装步骤

### 1. 安装依赖

```bash
cd android
npm install
```

### 2. 初始化 Capacitor

```bash
npm run cap:init
```

按照提示输入：
- App name: `YCDesk`
- Package ID: `com.ycdesk.mobile`

### 3. 添加 Android 平台

```bash
npm run cap:add
```

### 4. 构建 Web 资源

```bash
npm run build
```

### 5. 同步到 Android 项目

```bash
npm run cap:sync
```

### 6. 打开 Android Studio

```bash
npm run cap:open
```

## 开发调试

### 方式一：浏览器开发

```bash
npm run dev
```

访问 http://localhost:5173 进行Web端调试。

### 方式二：Android 模拟器调试

1. 先构建 Web 资源：
```bash
npm run build
```

2. 同步到 Android：
```bash
npm run cap:sync
```

3. 在 Android Studio 中运行到模拟器或真机。

## 配置说明

### 修改应用信息

编辑 `capacitor.config.json`：

```json
{
  "appId": "com.ycdesk.mobile",
  "appName": "YCDesk"
}
```

### 配置权限

Android 权限会自动配置在 `android/app/src/main/AndroidManifest.xml` 中。

### 修改服务器地址

在应用中直接输入信令服务器地址即可，也可以在 `app.js` 中修改默认值。

## 构建 APK

### 调试版本 APK

在 Android Studio 中：
1. Build -> Build Bundle(s) / APK(s) -> Build APK(s)
2. APK 位置：`android/app/build/outputs/apk/debug/`

### 发布版本 APK

1. 在 Android Studio 中配置签名密钥
2. Build -> Generate Signed Bundle / APK
3. 选择 APK
4. 按照向导完成签名和构建

## 功能特性

- ✅ 信令服务器模式连接
- ✅ 设备ID生成和显示
- ✅ WebRTC 视频流接收
- ✅ 连接状态管理
- ✅ Toast 消息提示
- ✅ 网络状态监听
- ✅ 返回键处理
- 🔄 直连模式（开发中）
- 🔄 键盘输入（开发中）
- 🔄 鼠标控制（开发中）

## 注意事项

1. **仅作为控制端**：Android版本仅作为远程控制端使用，不支持屏幕共享（被控端）功能。
2. **网络权限**：确保应用有网络访问权限。
3. **HTTPS要求**：生产环境建议使用HTTPS协议的信令服务器。
4. **WebRTC支持**：确保Android设备和浏览器支持WebRTC。

## 常见问题

### Q: 无法连接到信令服务器？

A: 检查：
1. 服务器地址是否正确
2. 设备网络连接是否正常
3. 服务器是否正在运行
4. 防火墙是否阻止了连接

### Q: WebRTC 连接失败？

A: 检查：
1. STUN/TURN 服务器配置
2. 网络环境是否支持P2P
3. 尝试使用信令服务器模式

### Q: 如何更新应用？

A: 
1. 修改代码
2. `npm run build`
3. `npm run cap:sync`
4. 在 Android Studio 中重新构建

## 相关链接

- [Capacitor 文档](https://capacitorjs.com/docs)
- [WebRTC API](https://developer.mozilla.org/zh-CN/docs/Web/API/WebRTC_API)
- [Socket.IO 文档](https://socket.io/docs/)

## 许可证

MIT License

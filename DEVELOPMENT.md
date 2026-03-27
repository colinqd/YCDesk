# YCDesk 开发文档

## 目录
- [项目架构](#项目架构)
- [开发指南](#开发指南)
- [配置说明](#配置说明)
- [部署指南](#部署指南)

---

## 项目架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        YCDesk 应用                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   主进程 (Main)  │      │  渲染进程 (Renderer) │            │
│  └────────┬─────────┘      └────────┬─────────┘            │
│           │                           │                      │
│           │  IPC Communication        │                      │
│           └───────────┬───────────────┘                      │
│                       │                                      │
│  ┌────────────────────▼──────────────────────┐               │
│  │              共享模块 (Shared)            │               │
│  ├───────────────────────────────────────────┤               │
│  │  - config.js         配置管理              │               │
│  │  - input-protocol.js 输入协议定义          │               │
│  │  - data-channel-manager.js 数据通道管理    │               │
│  └───────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   信令服务器     │
                    │  (Signaling)    │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   WebRTC P2P    │
                    │   (点对点连接)   │
                    └─────────────────┘
```

### 目录结构

```
YCDesk/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.js              # 主进程入口
│   │   ├── logger.js            # 日志系统
│   │   ├── ipc-handlers.js      # IPC 通信处理
│   │   ├── input-handler.js     # 输入事件处理
│   │   ├── direct-server.js     # 直连模式服务器
│   │   ├── window-manager.js    # 窗口管理
│   │   └── auth-manager.js      # 认证管理
│   │
│   ├── renderer/                # 渲染进程（前端）
│   │   ├── css/
│   │   │   └── styles.css       # 样式文件
│   │   └── js/
│   │       ├── app.js           # 主应用入口
│   │       ├── ui-manager.js    # UI 管理器
│   │       ├── history-manager.js # 历史记录管理
│   │       ├── connection-manager.js # 连接管理器
│   │       ├── signaling-mode.js    # 信令模式
│   │       ├── direct-mode.js       # 直连模式
│   │       ├── webrtc-common.js     # WebRTC 公共逻辑
│   │       ├── network-manager.js    # 网络管理
│   │       ├── stats-manager.js      # 统计管理
│   │       └── ui-utils.js          # UI 工具
│   │
│   └── shared/                  # 共享模块
│       ├── config.js            # 配置文件
│       ├── input-protocol.js    # 输入协议
│       └── data-channel-manager.js # 数据通道管理
│
├── server/                      # 信令服务器
│   └── server.js
│
├── android/                     # Android 应用
│
├── index.html                   # 主页面
├── remote.html                  # 远程控制页面
├── package.json                 # 依赖配置
└── README.md                    # 项目说明
```

---

## 开发指南

### 环境要求

- Node.js 16+
- npm 或 yarn
- Windows 10+ (开发环境)

### 安装依赖

```bash
# 安装主项目依赖
npm install

# 安装信令服务器依赖
cd server
npm install
cd ..
```

### 开发模式运行

```bash
# 启动信令服务器
cd server
npm start
cd ..

# 在新终端启动客户端（开发模式）
npm run dev
```

### 生产构建

```bash
# 构建 Windows 安装包
npm run build

# 构建 Windows 便携版
npm run build:portable
```

---

## 配置说明

### 主配置文件 (src/shared/config.js)

#### STUN 服务器配置

```javascript
stunServers: [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
]
```

#### TURN 服务器配置

```javascript
turnServers: [
  {
    urls: 'turn:your-turn-server.com:3478',
    username: 'your-username',
    credential: 'your-password',
    credentialType: 'password'
  }
]
```

#### WebRTC 性能配置

```javascript
webrtc: {
  iceTransportPolicy: 'all',        // 'all' | 'relay'
  bundlePolicy: 'max-bundle',       // 'balanced' | 'max-compat' | 'max-bundle'
  rtcpMuxPolicy: 'require',         // 'negotiate' | 'require'
  videoBitrateMax: 2500,            // kbps
  videoBitrateMin: 300,             // kbps
  audioBitrateMax: 128              // kbps
}
```

#### 屏幕捕获配置

```javascript
screenCapture: {
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 30,
  minFrameRate: 15
}
```

### 日志配置

日志系统配置在 `src/main/logger.js`：

```javascript
{
  logLevel: 'info',        // 'error' | 'warn' | 'info' | 'debug' | 'verbose'
  console: true,           // 启用控制台输出
  file: true,              // 启用文件输出
  maxFileSize: 10 * 1024 * 1024,  // 单个日志文件最大 10MB
  maxFiles: 10             // 保留最近 10 个日志文件
}
```

日志文件位置：
- Windows: `%APPDATA%\YCDesk\logs\ycdesk-YYYY-MM-DD.log`
- macOS: `~/Library/Logs/YCDesk/ycdesk-YYYY-MM-DD.log`
- Linux: `~/.local/share/YCDesk/logs/ycdesk-YYYY-MM-DD.log`

---

## 部署指南

### 信令服务器部署

1. **准备服务器环境**
   - Linux 服务器 (推荐 Ubuntu 20.04+)
   - Node.js 16+
   - 开放端口 3000

2. **安装并启动**
   ```bash
   # 上传 server 目录到服务器
   cd server
   npm install
   npm start
   ```

3. **使用 PM2 管理进程**
   ```bash
   npm install -g pm2
   pm2 start server.js --name ycdesk-signaling
   pm2 save
   pm2 startup
   ```

### TURN 服务器部署

推荐使用 coturn 作为 TURN 服务器：

1. **安装 coturn**
   ```bash
   sudo apt update
   sudo apt install coturn
   ```

2. **配置 coturn**
   编辑 `/etc/turnserver.conf`:
   ```
   listening-port=3478
   relay-threads=4
   min-port=49152
   max-port=65535
   user=your-username:your-password
   realm=your-domain.com
   ```

3. **启动服务**
   ```bash
   sudo systemctl start coturn
   sudo systemctl enable coturn
   ```

4. **开放防火墙端口**
   - TCP/UDP 3478
   - UDP 49152-65535

---

## 模块说明

### 主进程模块

#### logger.js
结构化日志系统，支持：
- 多级别日志 (error, warn, info, debug, verbose)
- 控制台和文件双输出
- 日志文件自动轮转
- 跨平台日志目录

#### ipc-handlers.js
处理渲染进程和主进程之间的 IPC 通信：
- 设备 ID 获取
- 屏幕源获取
- 窗口管理
- 直连模式控制
- 认证管理

#### input-handler.js
处理远程输入事件：
- 鼠标移动、点击、滚轮
- 键盘按键
- 修饰键状态管理

### 渲染进程模块

#### ui-manager.js
UI 状态和交互管理：
- 页面切换
- 状态更新
- 输入验证
- 日志显示

#### history-manager.js
历史连接记录管理：
- 保存连接历史
- 加载历史记录
- 删除历史项
- 历史记录渲染

#### connection-manager.js
连接状态管理：
- 连接状态追踪
- 心跳管理
- 自动重连逻辑

#### signaling-mode.js
信令服务器模式实现：
- Socket.IO 连接管理
- WebRTC 信令交换
- 设备发现和连接

#### direct-mode.js
直连模式实现：
- TCP 服务器/客户端
- WebRTC 信令交换
- 屏幕捕获

---

## 数据流

### 信令模式数据流

```
主控端                    信令服务器                    被控端
  |                          |                          |
  |-- register(deviceId) -->|                          |
  |                          |-- register(deviceId) -->|
  |                          |                          |
  |-- connect-request() ---->|                          |
  |                          |-- incoming-connection ->|
  |                          |                          |
  |                          |<-- connection-response --|
  |<-- connection-result ---|                          |
  |                          |                          |
  |-- offer ---------------->|                          |
  |                          |-- offer --------------->|
  |                          |                          |
  |                          |<-- answer --------------|
  |<-- answer -------------|                          |
  |                          |                          |
  |-- ice-candidate ------->|                          |
  |                          |-- ice-candidate -------->|
  |                          |                          |
  |<============ WebRTC P2P 媒体流 =============>|
```

### 直连模式数据流

```
主控端                        被控端
  |                              |
  |-- TCP连接 ----------------->|
  |                              |
  |-- offer ----------------->|
  |                              |
  |<-- answer -----------------|
  |                              |
  |<============ WebRTC P2P 媒体流 =============>|
```

---

## 常见问题

### Q: 如何添加自定义 TURN 服务器？
A: 编辑 `src/shared/config.js` 中的 `turnServers` 数组，添加你的 TURN 服务器配置。

### Q: 日志文件在哪里？
A: 根据平台不同，日志文件位置见上方"日志配置"部分。

### Q: 如何调整视频质量？
A: 修改 `src/shared/config.js` 中的 `screenCapture` 配置项。

### Q: 如何启用调试日志？
A: 设置环境变量 `NODE_ENV=development` 启动应用，或修改 `src/main/main.js` 中的日志级别。

---

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 许可证

MIT License

# DiffTransport 差异传输模块

## 概述

DiffTransport 是一个为 WebRTC 远程桌面程序设计的画面差异传输模块，能够：
- 仅传输画面变化区域，静止画面零流量
- 带宽降低 70%~90%
- 兼容原生 WebRTC 视频流 + 数据通道
- 无第三方依赖，使用浏览器原生 API

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    DiffTransportManager                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ DiffDetector│  │ DiffEncoder │  │ DiffDecoder │        │
│  │  (差异检测)  │  │  (差异编码)  │  │  (差异解码)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                    WebRTC DataChannel                        │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 发送端（控制端）

```javascript
// 1. 引入模块
const { DiffTransportManager } = require('./diff-transport');

// 2. 创建管理器
const diffManager = new DiffTransportManager({
    mode: 'sender',
    frameRate: 30,
    quality: 0.8,
    blockSize: 16,
    diffThreshold: 15
});

// 3. 初始化发送端
// sourceCanvas: 包含远程桌面画面的 canvas
// sourceVideo: 视频元素（可选）
await diffManager.initSender(sourceCanvas, sourceVideo);

// 4. 设置数据通道
diffManager.setDataChannel(existingDataChannel);

// 5. 开始传输
diffManager.start();

// 6. 发送完整帧（需要时）
diffManager.sendFullFrame();

// 7. 获取统计信息
const stats = diffManager.getStats();
console.log('带宽节省:', stats.skipRatio * 100, '%');
```

### 接收端（被控制端）

```javascript
// 1. 引入模块
const { DiffTransportManager } = require('./diff-transport');

// 2. 创建管理器
const diffManager = new DiffTransportManager({
    mode: 'receiver',
    smoothing: false
});

// 3. 初始化接收端
// targetCanvas: 用于显示远程桌面的 canvas
await diffManager.initReceiver(targetCanvas);

// 4. 设置数据通道
diffManager.setDataChannel(existingDataChannel);

// 5. 监听事件
diffManager.on('frame-received', (data) => {
    console.log('收到帧:', data.frameId, '区域数:', data.regions);
});
```

## 与现有代码集成

### 方式一：独立数据通道

```javascript
// 在现有的 RTCPeerConnection 创建后添加
const pc = new RTCPeerConnection(config);

// 创建专用的差异传输数据通道
const diffChannel = pc.createDataChannel('diff-transport', {
    ordered: true,
    maxRetransmits: 0
});

// 初始化差异传输
const diffManager = new DiffTransportManager({ mode: 'sender' });
await diffManager.initSender(canvas, video);
diffManager.setDataChannel(diffChannel);
diffManager.start();
```

### 方式二：复用现有数据通道

```javascript
// 使用现有的数据通道
const existingChannel = getDataChannel(); // 你的获取方式

const diffManager = new DiffTransportManager({ mode: 'sender' });
await diffManager.initSender(canvas, video);
diffManager.setDataChannel(existingChannel);
diffManager.start();
```

### 方式三：混合模式（推荐）

同时使用 WebRTC 视频流和差异传输：

```javascript
// 1. 保留原有 WebRTC 视频流作为基础
const pc = new RTCPeerConnection(config);
// ... 原有的视频流设置 ...

// 2. 添加差异传输作为增强
const diffChannel = pc.createDataChannel('diff-transport');
const diffManager = new DiffTransportManager({ mode: 'sender' });
await diffManager.initSender(canvas, video);
diffManager.setDataChannel(diffChannel);

// 3. 根据网络状况动态切换
function onNetworkChange(bandwidth) {
    if (bandwidth < 500000) {
        // 低带宽：使用差异传输
        diffManager.start();
    } else {
        // 高带宽：使用原生视频流
        diffManager.stop();
    }
}
```

## 配置选项

```javascript
{
    // 基础配置
    mode: 'sender' | 'receiver',  // 模式
    frameRate: 30,                 // 帧率 (1-60)
    
    // 编码配置
    quality: 0.8,                  // JPEG 质量 (0.1-1.0)
    format: 'jpeg',                // 编码格式 ('jpeg' | 'png' | 'webp')
    
    // 检测配置
    blockSize: 16,                 // 检测块大小 (像素)
    diffThreshold: 15,             // 差异阈值 (0-255)
    minChangedBlocks: 4,           // 最小变化块数
    mergeThreshold: 2,             // 区域合并阈值
    
    // 编码限制
    maxRegionSize: 512 * 512,      // 最大区域像素数
    minRegionSize: 16 * 16,        // 最小区域像素数
    
    // 带宽控制
    minBandwidth: 100000,          // 最小带宽 (bps)
    maxBandwidth: 2000000,         // 最大带宽 (bps)
    adaptiveQuality: true,         // 自适应质量
    
    // 解码配置
    smoothing: false               // 图像平滑
}
```

## API 参考

### DiffTransportManager

#### 方法

| 方法 | 说明 |
|------|------|
| `initSender(canvas, video)` | 初始化发送端 |
| `initReceiver(canvas)` | 初始化接收端 |
| `setDataChannel(channel)` | 设置数据通道 |
| `start()` | 开始传输 |
| `stop()` | 停止传输 |
| `sendFullFrame()` | 发送完整帧 |
| `getStats()` | 获取统计信息 |
| `resetStats()` | 重置统计 |
| `setQuality(q)` | 设置编码质量 |
| `setFrameRate(fps)` | 设置帧率 |
| `setThreshold(t)` | 设置差异阈值 |
| `on(event, cb)` | 监听事件 |
| `off(event, cb)` | 移除监听 |
| `destroy()` | 销毁实例 |

#### 事件

| 事件 | 说明 |
|------|------|
| `initialized` | 初始化完成 |
| `started` | 开始传输 |
| `stopped` | 停止传输 |
| `frame-sent` | 帧已发送 |
| `frame-received` | 帧已接收 |
| `channel-open` | 通道打开 |
| `channel-close` | 通道关闭 |
| `channel-error` | 通道错误 |

### 统计信息

```javascript
{
    framesCaptured: 100,    // 捕获帧数
    framesSent: 45,         // 发送帧数
    framesReceived: 45,     // 接收帧数
    bytesSent: 1024000,     // 发送字节数
    bytesReceived: 1024000, // 接收字节数
    fullFrames: 5,          // 完整帧数
    diffFrames: 40,         // 差异帧数
    skippedFrames: 55,      // 跳过帧数
    skipRatio: 0.55,        // 跳过比例
    
    detector: { ... },      // 检测器统计
    encoder: { ... },       // 编码器统计
    decoder: { ... },       // 解码器统计
    bandwidth: { ... }      // 带宽统计
}
```

## 性能优化建议

1. **调整块大小**：较大的块大小检测更快但精度降低
2. **调整差异阈值**：较高的阈值减少误检但可能漏检
3. **自适应质量**：启用后根据带宽自动调整
4. **帧率控制**：根据场景调整，静态场景可降低帧率

## 文件结构

```
src/renderer/js/diff-transport/
├── index.js              # 入口文件
├── DiffDetector.js       # 差异检测器
├── DiffEncoder.js        # 差异编码器
├── DiffDecoder.js        # 差异解码器
└── DiffTransportManager.js # 传输管理器
```

## 兼容性

- Chrome 80+
- Firefox 75+
- Edge 80+
- Safari 14+

## 注意事项

1. 数据通道消息大小限制为 64KB，大消息会自动分块
2. 首帧始终是完整帧
3. 静止画面时跳过传输，实现零流量
4. 支持与现有 WebRTC 视频流并存

# YCDesk 远程桌面传输优化方案

**文档版本**: v1.0
**更新日期**: 2026-04-17
**适用版本**: YCDesk windows

---

## 1. 概述

### 1.1 优化目标

- 降低远程桌面传输带宽占用
- 提升弱网环境下的画面流畅度
- 支持静态画面低带宽传输

### 1.2 优化方案

| 优化项 | 描述 | 预期效果 |
|--------|------|----------|
| 脏数据检测 | 追踪屏幕变更区域，只传输变化部分 | 带宽降低 50-80% |
| 帧差传输 | 计算相邻帧差异，只传输变化像素 | 静态画面带宽 < 100KB/s |
| 关键帧机制 | 定期发送完整帧防止误差累积 | 避免画面失真 |
| 自适应码率 | 根据网络状况动态调整编码参数 | 流畅度提升 |

---

## 2. 现有架构分析

### 2.1 当前视频传输流程

```
[被控端屏幕]
    ↓
navigator.mediaDevices.getUserMedia({
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sources[0].id,
    maxWidth/maxHeight,
    maxFrameRate: 30
})
    ↓
MediaStreamTrack (原始视频轨道)
    ↓
RTCPeerConnection.addTrack(track, stream)
    ↓
WebRTC 内部编码 (VP8/VP9/H264)
    ↓ SRTP 加密传输
[主控端]
    ↓
解码显示
```

**问题**:
- 每次传输完整视频帧，无差异化传输
- 静态画面时仍在传输大量重复数据
- 无法精确控制编码质量和传输策略

### 2.2 关键文件说明

| 文件 | 位置 | 职责 |
|------|------|------|
| `direct-mode.js` | `src/renderer/js/` | 被控端直连模式管理，创建 PeerConnection |
| `signaling-mode.js` | `src/renderer/js/` | 信令服务器模式管理 |
| `data-channel-manager.js` | `shared/` | WebRTC 数据通道管理，发送控制命令 |
| `remote.html` | 项目根目录 | 主控端远程控制界面 |
| `input-handler.js` | `src/main/` | 主进程输入事件处理 |

### 2.3 核心代码位置

**屏幕捕获点** (被控端):
- [direct-mode.js#L455-520](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L455-520) - `startScreenCapture()` 方法
- [signaling-mode.js#L470-500](file:///d:/MyProg/YCDesk/windows/src/renderer/js/signaling-mode.js#L470-500) - `startScreenCapture()` 方法

**视频轨道添加点**:
- [direct-mode.js#L479-500](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L479-500) - `addTrack()` 和编码参数设置

---

## 3. 优化方案详细设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      被控端 (Controlled)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ Screen Source│───▶│ FrameCapturer   │───▶│ DirtyDetector│ │
│  │ (getUserMedia)│    │ (Canvas Capture)│    │ (脏数据检测)  │ │
│  └──────────────┘    └─────────────────┘    └─────────────┘ │
│                                                      │       │
│                                                      ▼       │
│                                            ┌─────────────────┐│
│                                            │  FrameDiffer    ││
│                                            │  (帧差计算)      ││
│                                            └─────────────────┘│
│                                                      │       │
│                                                      ▼       │
│  ┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐│
│  │ RTCDataChannel│◀──│ FrameCompressor │◀──│  DirtyRegion    ││
│  │ (视频帧传输)   │    │ (LZ4/RLE压缩)   │    │  Encoder        ││
│  └──────────────┘    └─────────────────┘    └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SRTP / UDP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      主控端 (Controller)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ RTCDataChannel│───▶│ FrameDecompressor│───▶│ DirtyRegion ││
│  │ (接收帧数据)  │    │ (LZ4/RLE解压)    │    │  Decoder    ││
│  └──────────────┘    └─────────────────┘    └─────────────┘ │
│                                                      │       │
│                                                      ▼       │
│                                            ┌─────────────────┐│
│                                            │ CanvasRenderer ││
│                                            │ (脏区域合并渲染) ││
│                                            └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

### 3.2 核心模块设计

#### 3.2.1 `FrameCapturer` 类

**职责**: 捕获屏幕帧并转换为可处理格式

**位置**: 新建 `src/renderer/js/frame-capturer.js`

```javascript
class FrameCapturer {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.frameRate = options.frameRate || 30
    this.captureInterval = null
    this.onFrame = null
    this.canvas = null
    this.ctx = null
    this.lastFrameData = null
    this.currentStream = null
    this.videoElement = null
  }

  async startCapture(sourceId, width, height) {
    // 停止现有捕获
    this.stopCapture()

    // 创建 Video 元素用于接收媒体流
    this.videoElement = document.createElement('video')
    this.videoElement.style.cssText = 'position:absolute;top:-9999px;left:-9999px;'

    // 通过 getUserMedia 获取屏幕源
    this.currentStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: width,
          maxHeight: height,
          maxFrameRate: this.frameRate
        }
      }
    })

    this.videoElement.srcObject = this.currentStream
    await this.videoElement.play()

    // 创建离屏 Canvas
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.videoElement.videoWidth || width
    this.canvas.height = this.videoElement.videoHeight || height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })

    // 设置捕获间隔
    this.captureInterval = setInterval(() => {
      this.captureFrame()
    }, 1000 / this.frameRate)

    return {
      width: this.canvas.width,
      height: this.canvas.height
    }
  }

  captureFrame() {
    if (!this.videoElement || !this.ctx) return null

    // 绘制当前帧到 Canvas
    this.ctx.drawImage(this.videoElement, 0, 0)

    // 获取图像数据
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const currentData = imageData.data

    // 保存引用用于下次对比
    this.lastFrameData = new Uint8ClampedArray(currentData)

    if (this.onFrame) {
      this.onFrame({
        imageData: imageData,
        width: this.canvas.width,
        height: this.canvas.height,
        timestamp: Date.now()
      })
    }

    return imageData
  }

  stopCapture() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval)
      this.captureInterval = null
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop())
      this.currentStream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    this.lastFrameData = null
  }

  getResolution() {
    return {
      width: this.canvas?.width || this.width,
      height: this.canvas?.height || this.height
    }
  }
}
```

#### 3.2.2 `DirtyRegionDetector` 类

**职责**: 检测屏幕脏区域，支持多种检测策略

**位置**: 新建 `src/renderer/js/dirty-region-detector.js`

```javascript
class DirtyRegionDetector {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.gridSize = options.gridSize || 64  // 网格大小 (pixels)
    this.threshold = options.threshold || 10  // 差异阈值
    this.dirtyGrids = new Set()
    this.lastCleanGrids = new Map()
    this.enableGridMode = options.enableGridMode !== false
    this.enableInputDriven = options.enableInputDriven !== false
    this.pendingRegions = []
    this.aggregationWindow = options.aggregationWindow || 16  // ms
    this.lastFlushTime = 0
  }

  detectDirtyRegions(currentFrame, previousFrame) {
    if (!previousFrame) {
      // 首帧，返回全帧脏区域
      return [this.createRegion(0, 0, this.width, this.height)]
    }

    const dirtyRegions = []
    const { width, height, data: currentData } = currentFrame
    const previousData = previousFrame.data

    if (this.enableGridMode) {
      // 网格模式检测
      return this.detectGridMode(currentData, previousData, width, height)
    } else {
      // 逐像素检测
      return this.detectPixelMode(currentData, previousData, width, height)
    }
  }

  detectGridMode(currentData, previousData, width, height) {
    const gridWidth = Math.ceil(width / this.gridSize)
    const gridHeight = Math.ceil(height / this.gridSize)
    const dirtyGrids = []

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const gridKey = `${gx},${gy}`

        // 计算网格起始位置
        const startX = gx * this.gridSize
        const startY = gy * this.gridSize
        const endX = Math.min(startX + this.gridSize, width)
        const endY = Math.min(startY + this.gridSize, height)

        // 采样对比 (每隔 4 个像素取一个)
        let diffCount = 0
        let sampleCount = 0

        for (let y = startY; y < endY; y += 4) {
          for (let x = startX; x < endX; x += 4) {
            const idx = (y * width + x) * 4
            const r1 = currentData[idx]
            const g1 = currentData[idx + 1]
            const b1 = currentData[idx + 2]
            const r2 = previousData[idx]
            const g2 = previousData[idx + 1]
            const b2 = previousData[idx + 2]

            if (Math.abs(r1 - r2) > this.threshold ||
                Math.abs(g1 - g2) > this.threshold ||
                Math.abs(b1 - b2) > this.threshold) {
              diffCount++
            }
            sampleCount++
          }
        }

        // 如果差异像素超过 10%，认为该网格脏
        if (diffCount / sampleCount > 0.1) {
          dirtyGrids.push({
            x: startX,
            y: startY,
            width: endX - startX,
            height: endY - startY
          })
        }
      }
    }

    // 合并相邻脏网格为更大区域
    return this.mergeAdjacentRegions(dirtyGrids)
  }

  detectPixelMode(currentData, previousData, width, height) {
    const dirtyPixels = []

    for (let y = 0; y < height; y += 4) {  // 降采样
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4
        const r1 = currentData[idx]
        const g1 = currentData[idx + 1]
        const b1 = currentData[idx + 2]
        const r2 = previousData[idx]
        const g2 = previousData[idx + 1]
        const b2 = previousData[idx + 2]

        if (Math.abs(r1 - r2) > this.threshold ||
            Math.abs(g1 - g2) > this.threshold ||
            Math.abs(b1 - b2) > this.threshold) {
          dirtyPixels.push({ x, y })
        }
      }
    }

    // 将相邻脏像素聚合成矩形区域
    return this.clusterPixelsToRegions(dirtyPixels)
  }

  mergeAdjacentRegions(regions) {
    if (regions.length === 0) return []

    // 按 x, y 排序
    regions.sort((a, b) => a.y - b.y || a.x - b.x)

    const merged = []
    let current = { ...regions[0] }

    for (let i = 1; i < regions.length; i++) {
      const region = regions[i]

      // 检查是否与当前区域相邻或重叠
      if (region.y <= current.y + current.height &&
          region.x <= current.x + current.width + 2) {
        // 合并
        current.x = Math.min(current.x, region.x)
        current.y = Math.min(current.y, region.y)
        current.width = Math.max(current.x + current.width, region.x + region.width) - current.x
        current.height = Math.max(current.y + current.height, region.y + region.height) - current.y
      } else {
        merged.push(current)
        current = { ...region }
      }
    }
    merged.push(current)

    return merged
  }

  clusterPixelsToRegions(pixels) {
    if (pixels.length === 0) return []

    const visited = new Set()
    const regions = []

    for (const pixel of pixels) {
      const key = `${pixel.x},${pixel.y}`
      if (visited.has(key)) continue

      // BFS 聚类
      const cluster = []
      const queue = [pixel]
      const clusterKey = (p) => `${p.x},${p.y}`

      while (queue.length > 0) {
        const p = queue.shift()
        const k = clusterKey(p)
        if (visited.has(k)) continue
        visited.add(k)
        cluster.push(p)

        // 查找相邻像素 (8 邻域)
        for (const np of pixels) {
          const nk = clusterKey(np)
          if (visited.has(nk)) continue
          if (Math.abs(np.x - p.x) <= 4 && Math.abs(np.y - p.y) <= 4) {
            queue.push(np)
          }
        }
      }

      // 计算边界框
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of cluster) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }

      regions.push({
        x: minX,
        y: minY,
        width: maxX - minX + 4,
        height: maxY - minY + 4
      })
    }

    return this.mergeAdjacentRegions(regions)
  }

  createRegion(x, y, width, height) {
    return { x, y, width, height }
  }

  markInputDrivenRegion(x, y, type) {
    let region

    switch (type) {
      case 'mousemove':
        region = { x: x - 20, y: y - 20, width: 40, height: 40 }
        break
      case 'click':
        region = { x: x - 50, y: y - 50, width: 100, height: 100 }
        break
      case 'keydown':
        region = { x: 0, y: 0, width: this.width, height: 100 }
        break
      case 'scroll':
        region = { x: 0, y: 0, width: this.width, height: this.height }
        break
      default:
        region = { x: x - 30, y: y - 30, width: 60, height: 60 }
    }

    this.pendingRegions.push(region)

    // 设置延迟刷新
    const now = Date.now()
    if (now - this.lastFlushTime > this.aggregationWindow) {
      this.lastFlushTime = now
      const regions = this.pendingRegions.splice(0, this.pendingRegions.length)
      return this.mergeAdjacentRegions(regions)
    }

    return null
  }

  getAndClearPendingRegions() {
    const now = Date.now()
    if (now - this.lastFlushTime > this.aggregationWindow && this.pendingRegions.length > 0) {
      this.lastFlushTime = now
      const regions = this.pendingRegions.splice(0, this.pendingRegions.length)
      return this.mergeAdjacentRegions(regions)
    }
    return []
  }
}
```

#### 3.2.3 `FrameDiffer` 类

**职责**: 计算帧差异，提取脏区域像素数据

**位置**: 新建 `src/renderer/js/frame-differ.js`

```javascript
class FrameDiffer {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.previousFrame = null
    this.frameCounter = 0
    this.keyFrameInterval = options.keyFrameInterval || 120  // 每 N 帧强制关键帧
    this.jpegQuality = options.jpegQuality || 0.7
    this.compressionLevel = options.compressionLevel || 5  // LZ4 压缩级别
  }

  computeDiff(currentFrame, dirtyRegions, isKeyFrame = false) {
    const result = {
      frameId: ++this.frameCounter,
      timestamp: currentFrame.timestamp,
      regions: [],
      isKeyFrame: isKeyFrame || this.frameCounter % this.keyFrameInterval === 0,
      width: this.width,
      height: this.height
    }

    const { data: currentData } = currentFrame
    const previousData = this.previousFrame?.data

    if (result.isKeyFrame) {
      // 关键帧：压缩完整图像
      result.regions.push({
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        data: this.compressFrame(currentFrame)
      })
    } else {
      // 差异帧：只编码脏区域
      for (const region of dirtyRegions) {
        const regionData = this.extractRegion(currentData, previousData, region, this.width)
        if (regionData) {
          result.regions.push({
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
            data: regionData
          })
        }
      }
    }

    // 保存当前帧用于下次对比
    this.previousFrame = {
      data: new Uint8ClampedArray(currentData),
      width: this.width,
      height: this.height
    }

    return result
  }

  extractRegion(currentData, previousData, region, frameWidth) {
    const { x, y, width, height } = region
    const pixels = []

    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) {
        const idx = (py * frameWidth + px) * 4
        const r = currentData[idx]
        const g = currentData[idx + 1]
        const b = currentData[idx + 2]

        // 如果有前一帧且像素相同，跳过
        if (previousData) {
          const prevIdx = idx
          const pr = previousData[prevIdx]
          const pg = previousData[prevIdx + 1]
          const pb = previousData[prevIdx + 2]

          if (Math.abs(r - pr) < 5 && Math.abs(g - pg) < 5 && Math.abs(b - pb) < 5) {
            continue
          }
        }

        // 存储 (x, y, r, g, b) - 使用相对坐标省字节
        pixels.push(px - x, py - y, r, g, b)
      }
    }

    if (pixels.length === 0) {
      return null
    }

    // 使用 RLE 压缩
    return this.compressRLE(new Uint8Array(pixels))
  }

  compressRLE(data) {
    if (data.length < 4) {
      return { type: 'raw', data: Array.from(data) }
    }

    const compressed = []
    let i = 0

    while (i < data.length) {
      let runLength = 1
      let runValue = data[i]

      // 检测游程
      while (i + runLength < data.length &&
             data[i + runLength] === runValue &&
             runLength < 127) {
        runLength++
      }

      if (runLength >= 4) {
        // RLE 编码
        compressed.push(0x80 | runLength)  // 高位 1 表示 RLE
        compressed.push(runValue)
      } else {
        // 原始数据
        for (let j = 0; j < runLength; j++) {
          compressed.push(data[i + j])
        }
      }

      i += runLength
    }

    return {
      type: 'rle',
      data: compressed,
      originalSize: data.length
    }
  }

  compressFrame(frame) {
    // 创建临时 Canvas 用于 JPEG 压缩
    const canvas = document.createElement('canvas')
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')

    const imageData = new ImageData(
      new Uint8ClampedArray(frame.data),
      frame.width,
      frame.height
    )
    ctx.putImageData(imageData, 0, 0)

    // 返回 JPEG 格式的 base64 数据
    const dataUrl = canvas.toDataURL('image/jpeg', this.jpegQuality)

    return {
      type: 'jpeg',
      data: dataUrl,
      quality: this.jpegQuality
    }
  }

  reset() {
    this.previousFrame = null
    this.frameCounter = 0
  }
}
```

#### 3.2.4 `VideoFrameTransmitter` 类

**职责**: 整合脏检测、帧差、压缩，通过 DataChannel 传输

**位置**: 新建 `src/renderer/js/video-frame-transmitter.js`

```javascript
class VideoFrameTransmitter {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.dataChannel = null
    this.frameCapturer = null
    this.dirtyDetector = null
    this.frameDiffer = null
    this.previousFrame = null
    this.isRunning = false
    this.lastFrameTime = 0
    this.frameInterval = options.frameInterval || 33  // ~30fps
    this.minFrameInterval = 1000 / 60  // 最小帧间隔 16ms
    this.transmitQueue = []
    this.maxQueueSize = 2
    this.onStatsUpdate = null
    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      keyFramesSent: 0,
      deltaFramesSent: 0,
      avgFrameTime: 0,
      avgDirtyRegions: 0
    }
  }

  initialize(dataChannel, sourceId, width, height) {
    this.dataChannel = dataChannel
    this.frameCapturer = new FrameCapturer({
      width,
      height,
      frameRate: 30
    })
    this.dirtyDetector = new DirtyRegionDetector({
      width,
      height,
      gridSize: 64,
      threshold: 10
    })
    this.frameDiffer = new FrameDiffer({
      width,
      height,
      keyFrameInterval: 120,
      jpegQuality: 0.7
    })

    // 设置帧回调
    this.frameCapturer.onFrame = (frame) => this.handleFrame(frame)

    this.logger.log('[VideoFrameTransmitter] 初始化完成')
  }

  async start(sourceId, width, height) {
    if (this.isRunning) {
      this.logger.warn('[VideoFrameTransmitter] 已经在运行')
      return
    }

    this.logger.log('[VideoFrameTransmitter] 启动屏幕捕获')

    const resolution = await this.frameCapturer.startCapture(sourceId, width, height)
    this.isRunning = true

    // 启动传输循环
    this.scheduleNextFrame()

    return resolution
  }

  stop() {
    this.isRunning = false
    if (this.frameCapturer) {
      this.frameCapturer.stopCapture()
    }
    this.transmitQueue = []
    this.logger.log('[VideoFrameTransmitter] 已停止')
  }

  handleFrame(frame) {
    if (!this.isRunning) return

    const now = Date.now()
    const elapsed = now - this.lastFrameTime

    // 帧率控制
    if (elapsed < this.frameInterval) return

    // 检测脏区域
    const dirtyRegions = this.dirtyDetector.detectDirtyRegions(frame, this.previousFrame)

    // 合并输入事件驱动的脏区域
    const inputRegions = this.dirtyDetector.getAndClearPendingRegions()
    if (inputRegions.length > 0) {
      dirtyRegions.push(...inputRegions)
    }

    if (dirtyRegions.length === 0) {
      // 无变化，跳过
      this.lastFrameTime = now
      return
    }

    // 计算帧差异
    const frameDiff = this.frameDiffer.computeDiff(frame, dirtyRegions)

    // 加入传输队列
    this.transmitQueue.push(frameDiff)
    if (this.transmitQueue.length > this.maxQueueSize) {
      this.transmitQueue.shift()  // 丢弃最旧的帧
    }

    // 保存上一帧
    this.previousFrame = frame

    this.lastFrameTime = now

    // 调度传输
    this.scheduleTransmit()
  }

  scheduleNextFrame() {
    if (!this.isRunning) return

    setTimeout(() => {
      if (this.isRunning) {
        // 触发一次帧捕获
        this.frameCapturer.captureFrame()
        this.scheduleNextFrame()
      }
    }, this.frameInterval)
  }

  scheduleTransmit() {
    if (this.transmitQueue.length === 0) return

    // 异步传输，不阻塞帧捕获
    setTimeout(() => {
      this.transmitNextFrame()
    }, 0)
  }

  transmitNextFrame() {
    if (this.transmitQueue.length === 0) return
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return

    const frameData = this.transmitQueue.shift()

    // 更新统计
    this.updateStats(frameData)

    // 序列化并发送
    const serialized = this.serializeFrame(frameData)

    try {
      this.dataChannel.send(serialized)
      this.logger.log(`[VideoFrameTransmitter] 发送帧 #${frameData.frameId}, ` +
        `区域数: ${frameData.regions.length}, ` +
        `大小: ${serialized.length} bytes, ` +
        `类型: ${frameData.isKeyFrame ? '关键帧' : '差异帧'}`)
    } catch (e) {
      this.logger.error('[VideoFrameTransmitter] 发送帧失败:', e.message)
    }
  }

  serializeFrame(frame) {
    // 使用更紧凑的二进制格式
    const regionCount = frame.regions.length
    const headerSize = 4 + 4 + 4 + 4 + 1 + 4 + 4  // 基本固定头部

    let totalSize = headerSize
    const regionHeaders = []
    const regionDataList = []

    for (const region of frame.regions) {
      let regionDataBytes

      if (region.data.type === 'jpeg') {
        // JPEG 数据需要 base64 解码
        const binary = atob(region.data.data.split(',')[1])
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        regionDataBytes = bytes
      } else if (region.data.type === 'rle') {
        regionDataBytes = new Uint8Array(region.data.data)
      } else {
        regionDataBytes = new Uint8Array(region.data.data)
      }

      // 每个区域头: x(2) + y(2) + w(2) + h(2) + type(1) + datasize(4) = 13 bytes
      regionHeaders.push({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        dataType: region.data.type === 'jpeg' ? 1 : (region.data.type === 'rle' ? 2 : 0),
        dataSize: regionDataBytes.length
      })

      regionDataList.push(regionDataBytes)
      totalSize += 13 + regionDataBytes.length
    }

    // 构建二进制消息
    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)
    const uint8 = new Uint8Array(buffer)

    let offset = 0

    // 写入帧头
    view.setUint32(offset, frame.frameId); offset += 4
    view.setUint32(offset, frame.timestamp); offset += 4
    view.setUint32(offset, frame.width); offset += 4
    view.setUint32(offset, frame.height); offset += 4
    uint8[offset] = frame.isKeyFrame ? 1 : 0; offset += 1
    view.setUint32(offset, regionCount); offset += 4
    view.setUint32(offset, this.stats.framesSent); offset += 4

    // 写入区域头
    for (const header of regionHeaders) {
      view.setUint16(offset, header.x); offset += 2
      view.setUint16(offset, header.y); offset += 2
      view.setUint16(offset, header.width); offset += 2
      view.setUint16(offset, header.height); offset += 2
      uint8[offset] = header.dataType; offset += 1
      view.setUint32(offset, header.dataSize); offset += 4
    }

    // 写入区域数据
    for (const data of regionDataList) {
      uint8.set(data, offset)
      offset += data.length
    }

    return JSON.stringify({
      type: 'video-frame',
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      width: frame.width,
      height: frame.height,
      isKeyFrame: frame.isKeyFrame,
      regionCount: regionCount,
      regions: frame.regions.map(r => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        data: r.data
      }))
    })
  }

  markInputRegion(x, y, type) {
    if (!this.dirtyDetector) return
    this.dirtyDetector.markInputDrivenRegion(x, y, type)
  }

  updateStats(frameData) {
    this.stats.framesSent++
    this.stats.bytesSent += JSON.stringify(frameData).length

    if (frameData.isKeyFrame) {
      this.stats.keyFramesSent++
    } else {
      this.stats.deltaFramesSent++
    }

    this.stats.avgDirtyRegions =
      (this.stats.avgDirtyRegions * (this.stats.framesSent - 1) + frameData.regions.length)
      / this.stats.framesSent

    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats })
    }
  }

  getStats() {
    return { ...this.stats }
  }

  setFrameRate(fps) {
    this.frameInterval = 1000 / fps
    this.logger.log(`[VideoFrameTransmitter] 帧率设置为 ${fps} fps`)
  }

  setQuality(quality) {
    if (this.frameDiffer) {
      this.frameDiffer.jpegQuality = quality
      this.logger.log(`[VideoFrameTransmitter] 图像质量设置为 ${quality}`)
    }
  }

  setKeyFrameInterval(interval) {
    if (this.frameDiffer) {
      this.frameDiffer.keyFrameInterval = interval
      this.logger.log(`[VideoFrameTransmitter] 关键帧间隔设置为 ${interval}`)
    }
  }

  reset() {
    this.stop()
    this.frameDiffer?.reset()
    this.previousFrame = null
    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      keyFramesSent: 0,
      deltaFramesSent: 0,
      avgFrameTime: 0,
      avgDirtyRegions: 0
    }
  }
}
```

#### 3.2.5 `VideoFrameReceiver` 类

**职责**: 接收、解压、重建视频帧并渲染到 Canvas

**位置**: 新建 `src/renderer/js/video-frame-receiver.js`

```javascript
class VideoFrameReceiver {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.canvas = options.canvas
    this.ctx = null
    this.lastFrame = null
    this.lastKeyFrame = null
    this.currentFrameId = 0
    this.pendingFrames = new Map()
    this.maxPendingFrames = 30
    this.onFrameRendered = null
    this.onStatsUpdate = null
    this.stats = {
      framesReceived: 0,
      keyFramesReceived: 0,
      deltaFramesReceived: 0,
      bytesReceived: 0,
      framesDecoded: 0,
      avgDecodeTime: 0
    }
  }

  initialize(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })
    this.logger.log('[VideoFrameReceiver] 初始化完成')
  }

  handleMessage(data) {
    if (data.type !== 'video-frame') return

    const startTime = performance.now()

    try {
      this.processFrame(data)
      this.stats.framesDecoded++

      const decodeTime = performance.now() - startTime
      this.stats.avgDecodeTime =
        (this.stats.avgDecodeTime * (this.stats.framesDecoded - 1) + decodeTime)
        / this.stats.framesDecoded

      if (this.onFrameRendered) {
        this.onFrameRendered({
          width: data.width,
          height: data.height,
          frameId: data.frameId,
          isKeyFrame: data.isKeyFrame
        })
      }
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] 处理帧失败:', e.message)
    }

    this.updateStats(data)
  }

  processFrame(frameData) {
    this.currentFrameId = frameData.frameId
    this.stats.framesReceived++

    if (frameData.isKeyFrame) {
      this.decodeKeyFrame(frameData)
      this.lastKeyFrame = frameData
    } else {
      this.decodeDeltaFrame(frameData)
    }

    this.lastFrame = frameData
  }

  decodeKeyFrame(frameData) {
    this.stats.keyFramesReceived++

    if (!this.ctx) return

    // 清空画布
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // 解码每个区域
    for (const region of frameData.regions) {
      this.renderRegion(region)
    }
  }

  decodeDeltaFrame(frameData) {
    this.stats.deltaFramesReceived++

    // 基于最后一帧和当前差异帧重建
    for (const region of frameData.regions) {
      this.renderRegion(region)
    }
  }

  renderRegion(region) {
    if (!this.ctx) return

    const { x, y, width, height, data } = region

    try {
      if (data.type === 'jpeg' || data.type === 'image/jpeg') {
        // 解码 JPEG
        const img = new Image()
        img.src = data.data
        img.onload = () => {
          this.ctx.drawImage(img, x, y, width, height)
        }
      } else if (data.type === 'rle') {
        // 解码 RLE
        const decompressed = this.decompressRLE(data.data, width, height)
        const imageData = new ImageData(
          new Uint8ClampedArray(decompressed),
          width,
          height
        )

        // 创建临时 canvas 解码
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.putImageData(imageData, 0, 0)

        this.ctx.drawImage(tempCanvas, x, y)
      } else {
        // 原始 RGB 数据
        const imageData = new ImageData(
          new Uint8ClampedArray(data.data),
          width,
          height
        )

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.putImageData(imageData, 0, 0)

        this.ctx.drawImage(tempCanvas, x, y)
      }
    } catch (e) {
      this.logger.error(`[VideoFrameReceiver] 渲染区域失败 (${x},${y}):`, e.message)
    }
  }

  decompressRLE(compressed, width, height) {
    const result = []
    let i = 0

    while (i < compressed.length) {
      const byte = compressed[i]

      if (byte & 0x80) {
        // RLE 编码
        const runLength = byte & 0x7F
        i++
        const value = compressed[i]
        i++
        for (let j = 0; j < runLength; j++) {
          result.push(value)
        }
      } else {
        // 原始数据
        const count = byte
        i++
        for (let j = 0; j < count && i < compressed.length; j++) {
          result.push(compressed[i])
          i++
        }
      }
    }

    return result
  }

  updateStats(frameData) {
    this.stats.bytesReceived += JSON.stringify(frameData).length

    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats })
    }
  }

  getStats() {
    return { ...this.stats }
  }

  setCanvasSize(width, height) {
    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  clear() {
    if (this.ctx) {
      this.ctx.fillStyle = '#000'
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.lastFrame = null
    this.lastKeyFrame = null
    this.currentFrameId = 0
    this.pendingFrames.clear()
  }

  reset() {
    this.clear()
    this.stats = {
      framesReceived: 0,
      keyFramesReceived: 0,
      deltaFramesReceived: 0,
      bytesReceived: 0,
      framesDecoded: 0,
      avgDecodeTime: 0
    }
  }
}
```

---

## 4. 集成方案

### 4.1 被控端集成

**修改文件**: `src/renderer/js/direct-mode.js`

#### 4.1.1 添加新属性

```javascript
class DirectModeManager {
  constructor(options = {}) {
    // ... 现有属性 ...

    // 新增：视频帧传输器
    this.videoFrameTransmitter = null
    // 新增：是否启用优化模式
    this.useOptimizedTransfer = options.useOptimizedTransfer !== false
    // 新增：优化传输数据通道标签
    this.OPTIMIZED_VIDEO_CHANNEL = 'optimized-video'
  }
}
```

#### 4.1.2 修改 `createPeerConnection` 方法

在 `createPeerConnection` 方法中（约 [direct-mode.js#L179](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L179)），创建额外的视频传输通道：

```javascript
async createPeerConnection(clientId) {
  this.directPeerConnection = new RTCPeerConnection({ iceServers: [] })

  // 创建控制数据通道 (现有)
  this.dataChannelManager = new DataChannelManager({
    logger: { log: this.logFn.bind(this), error: console.error }
  })

  // ... 现有设置代码保持不变 ...

  // === 新增：创建优化的视频传输数据通道 ===
  if (this.useOptimizedTransfer) {
    // 创建一个有序的 UDP 风格数据通道用于视频帧传输
    const videoChannel = this.directPeerConnection.createDataChannel(this.OPTIMIZED_VIDEO_CHANNEL, {
      ordered: false,  // 允许丢帧以保持实时性
      maxRetransmits: 0  // 不重传
    })

    videoChannel.onopen = () => {
      this.logFn('优化视频通道已打开')
    }

    videoChannel.onclose = () => {
      this.logFn('优化视频通道已关闭')
    }

    videoChannel.onerror = (error) => {
      this.logFn('优化视频通道错误: ' + error.message)
    }

    // 初始化视频帧发射器
    this.videoFrameTransmitter = new VideoFrameTransmitter({
      logger: { log: this.logFn.bind(this), error: console.error }
    })

    // 设置统计回调
    this.videoFrameTransmitter.onStatsUpdate = (stats) => {
      this.logFn(`[传输统计] 帧:${stats.framesSent} 关键帧:${stats.keyFramesSent} ` +
        `差异帧:${stats.deltaFramesSent} 平均脏区域:${stats.avgDirtyRegions.toFixed(1)}`)
    }

    this.logFn('优化视频传输模式已初始化')
  }
  // === 新增结束 ===
}
```

#### 4.1.3 修改 `startScreenCapture` 方法

修改 [direct-mode.js#L455-520](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L455-520) 的 `startScreenCapture` 方法：

```javascript
async startScreenCapture(targetWidth, targetHeight) {
  try {
    this.stopScreenCapture()

    const sources = await window.electronAPI.getSources()
    this.logFn('可用屏幕源: ' + sources.length + ' 个')

    if (sources.length > 0) {
      const maxWidth = targetWidth || 1920
      const maxHeight = targetHeight || 1080

      // === 判断使用哪种传输模式 ===
      if (this.useOptimizedTransfer && this.videoFrameTransmitter) {
        // 优化模式：使用 DataChannel 传输
        const videoChannel = this.directPeerConnection.getDataChannels().get(this.OPTIMIZED_VIDEO_CHANNEL)

        if (videoChannel && videoChannel.readyState === 'open') {
          this.videoFrameTransmitter.initialize(videoChannel, sources[0].id, maxWidth, maxHeight)
          const resolution = await this.videoFrameTransmitter.start(sources[0].id, maxWidth, maxHeight)
          this.logFn('优化屏幕捕获成功，分辨率: ' + resolution.width + 'x' + resolution.height)
          return resolution
        } else {
          this.logFn('优化视频通道未就绪，回退到标准模式')
        }
      }

      // 标准模式（回退）：使用原生 WebRTC 视频轨道
      this.currentStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
            maxFrameRate: this.config.screenCapture?.maxFrameRate || 30
          }
        }
      })

      const tracks = this.currentStream.getVideoTracks()
      this.logFn('获取到 ' + tracks.length + ' 个媒体轨道')

      tracks.forEach(track => {
        const sender = this.directPeerConnection.addTrack(track, this.currentStream)
        this.logFn('已添加媒体轨道: ' + track.kind + ', label: ' + track.label)

        try {
          const parameters = sender.getParameters()
          if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}]
          }
          // 优化编码参数
          parameters.encodings[0].maxBitrate = 2000000  // 降低到 2Mbps
          parameters.encodings[0].maxFramerate = 20   // 降低到 20fps
          sender.setParameters(parameters)
          this.logFn('已设置视频编码参数: maxBitrate=2Mbps, maxFramerate=20')
        } catch (e) {
          this.logFn('设置视频编码参数失败: ' + e.message)
        }
      })

      const settings = tracks[0].getSettings()
      const actualResolution = {
        width: settings.width || maxWidth,
        height: settings.height || maxHeight
      }

      this.logFn('屏幕捕获成功，分辨率: ' + actualResolution.width + 'x' + actualResolution.height)
      return actualResolution
    } else {
      this.logFn('没有找到可用的屏幕源')
      return { width: 1920, height: 1080 }
    }
  } catch (error) {
    this.logFn('屏幕捕获失败: ' + error.message)
    console.error('屏幕捕获详细错误:', error)
    return { width: 1920, height: 1080 }
  }
}
```

#### 4.1.4 修改 `stopScreenCapture` 方法

修改 [direct-mode.js#L519-537](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L519-537)：

```javascript
stopScreenCapture() {
  // 停止优化传输器
  if (this.videoFrameTransmitter) {
    this.videoFrameTransmitter.stop()
  }

  // 停止原生流
  if (this.currentStream) {
    this.currentStream.getTracks().forEach(track => {
      track.stop()
    })
    this.currentStream = null
  }

  if (this.directPeerConnection) {
    const senders = this.directPeerConnection.getSenders()
    senders.forEach(sender => {
      if (sender.track) {
        try { this.directPeerConnection.removeTrack(sender) } catch (e) {}
      }
    })
  }
}
```

#### 4.1.5 在 `reset` 方法中清理

修改 [direct-mode.js#L581-612](file:///d:/MyProg/YCDesk/windows/src/renderer/js/direct-mode.js#L581-612)：

```javascript
reset() {
  // ... 现有代码 ...

  // 停止并清理视频帧传输器
  if (this.videoFrameTransmitter) {
    this.videoFrameTransmitter.reset()
    this.videoFrameTransmitter = null
  }

  // ... 其余现有代码 ...
}
```

#### 4.1.6 添加输入事件驱动的脏区域标记

在 `createPeerConnection` 中设置输入事件监听：

```javascript
// 在 createPeerConnection 方法中，this.dataChannelManager 设置后添加：

this.directPeerConnection.ondatachannel = (event) => {
  const channel = event.channel
  this.logFn('收到数据通道: ' + channel.label)

  if (channel.label === 'control') {
    this.dataChannelManager.setDataChannel(channel)
  } else if (channel.label === this.OPTIMIZED_VIDEO_CHANNEL) {
    // 优化视频通道由 VideoFrameTransmitter 处理
    this.logFn('收到优化视频通道')
  } else if (channel.label === 'input') {
    // ... 现有代码 ...
  } else if (channel.label.startsWith('aux-')) {
    // ... 现有代码 ...
  }
}

// 监听本地输入事件，标记脏区域
this.setupInputEventListeners()
```

新增方法：

```javascript
setupInputEventListeners() {
  // 通过 IPC 监听主进程的输入事件
  window.electronAPI.on('remote-input', (data) => {
    if (this.videoFrameTransmitter && data.x !== undefined && data.y !== undefined) {
      // 标记输入点周围为脏区域
      const inputType = data.type || data.inputType || 'unknown'
      this.videoFrameTransmitter.markInputRegion(data.x, data.y, inputType)
    }
  })
}
```

---

### 4.2 主控端集成

**修改文件**: `remote.html` 和相关 JS 文件

#### 4.2.1 修改 remote.html 添加 Canvas

在 [remote.html#L95-100](file:///d:/MyProg/YCDesk/windows/remote.html#L95-100) 附近，将 `#videoWrapper` 修改为支持 Canvas 渲染：

```html
<!-- 原有 video 元素保留用于回退 -->
<video id="screenVideo" style="display: none;"></video>

<!-- 新增：用于优化模式渲染的 Canvas -->
<canvas id="optimizedCanvas" style="display: block; width: 100%; height: 100%; object-fit: contain;"></canvas>
```

#### 4.2.2 创建 `remote-video-handler.js`

**位置**: 新建 `src/renderer/js/remote-video-handler.js`

```javascript
class RemoteVideoHandler {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.dataChannel = null
    this.frameReceiver = null
    this.videoElement = null
    this.canvas = null
    this.isOptimizedMode = false
    this.peerConnection = null
    this.useOptimizedTransfer = options.useOptimizedTransfer !== false
    this.OPTIMIZED_VIDEO_CHANNEL = 'optimized-video'
  }

  initialize(videoElement, canvas, peerConnection) {
    this.videoElement = videoElement
    this.canvas = canvas
    this.peerConnection = peerConnection

    // 初始化帧接收器
    this.frameReceiver = new VideoFrameReceiver({
      logger: { log: this.logger.log.bind(this), error: console.error },
      canvas: canvas
    })
    this.frameReceiver.initialize(canvas)

    // 设置统计回调
    this.frameReceiver.onStatsUpdate = (stats) => {
      this.logger.log(`[接收统计] 帧:${stats.framesReceived} 关键帧:${stats.keyFramesReceived} ` +
        `差异帧:${stats.deltaFramesReceived} 平均解码时间:${stats.avgDecodeTime.toFixed(1)}ms`)
    }

    // 设置渲染回调
    this.frameReceiver.onFrameRendered = (info) => {
      this.logger.log(`[渲染] 帧 #${info.frameId} ${info.width}x${info.height} ${info.isKeyFrame ? '关键帧' : '差异帧'}`)
    }

    this.logger.log('[RemoteVideoHandler] 初始化完成')
  }

  setupDataChannel(channel) {
    this.dataChannel = channel

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'video-frame') {
          this.frameReceiver.handleMessage(data)
        } else if (data.type === 'video-control') {
          this.handleVideoControl(data)
        }
      } catch (e) {
        this.logger.error('[RemoteVideoHandler] 解析消息失败:', e.message)
      }
    }

    channel.onopen = () => {
      this.logger.log('[RemoteVideoHandler] 数据通道已打开')
      this.isOptimizedMode = true
      this.switchToOptimizedMode()
    }

    channel.onclose = () => {
      this.logger.log('[RemoteVideoHandler] 数据通道已关闭')
      this.isOptimizedMode = false
      this.switchToStandardMode()
    }
  }

  handleVideoControl(data) {
    if (data.action === 'stats') {
      this.logger.log('[RemoteVideoHandler] 收到传输统计:', data.stats)
    }
  }

  switchToOptimizedMode() {
    if (this.videoElement) {
      this.videoElement.style.display = 'none'
    }
    if (this.canvas) {
      this.canvas.style.display = 'block'
    }
    this.logger.log('[RemoteVideoHandler] 切换到优化渲染模式')
  }

  switchToStandardMode() {
    if (this.videoElement) {
      this.videoElement.style.display = 'block'
    }
    if (this.canvas) {
      this.canvas.style.display = 'none'
    }
    this.logger.log('[RemoteVideoHandler] 切换到标准渲染模式')
  }

  handleTrack(event) {
    const track = event.track

    if (track.kind === 'video') {
      this.logger.log('[RemoteVideoHandler] 收到视频轨道')

      if (!this.isOptimizedMode) {
        // 标准模式：直接绑定到 video 元素
        this.videoElement.srcObject = this.peerConnection.getRemoteStreams()[0]
        this.videoElement.style.display = 'block'
        this.canvas.style.display = 'none'
      }
    }
  }

  setResolution(width, height) {
    if (this.frameReceiver) {
      this.frameReceiver.setCanvasSize(width, height)
    }
    this.logger.log(`[RemoteVideoHandler] 分辨率设置为 ${width}x${height}`)
  }

  clear() {
    if (this.frameReceiver) {
      this.frameReceiver.clear()
    }
  }

  reset() {
    this.clear()
    this.dataChannel = null
    this.isOptimizedMode = false
    if (this.frameReceiver) {
      this.frameReceiver.reset()
    }
  }
}
```

#### 4.2.3 修改 `remote.js` 或相关初始化代码

在远程窗口的 JS 初始化代码中（约 [remote.html 相关JS](file:///d:/MyProg/YCDesk/windows/remote.html) 200行后），添加：

```javascript
// 获取 DOM 元素
const screenVideo = document.getElementById('screenVideo')
const optimizedCanvas = document.getElementById('optimizedCanvas')

// 创建视频处理器
const videoHandler = new RemoteVideoHandler({
  logger: { log: logMessage, error: console.error },
  useOptimizedTransfer: true
})

// 初始化
videoHandler.initialize(screenVideo, optimizedCanvas, peerConnection)

// 在创建 DataChannel 时设置
// peerConnection.ondatachannel = (event) => {
//   if (event.channel.label === 'optimized-video') {
//     videoHandler.setupDataChannel(event.channel)
//   }
// }

// 处理视频轨道
// peerConnection.ontrack = (event) => {
//   videoHandler.handleTrack(event)
// }
```

---

### 4.3 信令模式兼容

**修改文件**: `src/renderer/js/signaling-mode.js`

同样的修改需要应用到 `signaling-mode.js` 的对应方法中：
- `createPeerConnection` ([signaling-mode.js#L229](file:///d:/MyProg/YCDesk/windows/src/renderer/js/signaling-mode.js#L229))
- `startScreenCapture` ([signaling-mode.js#L470](file:///d:/MyProg/YCDesk/windows/src/renderer/js/signaling-mode.js#L470))
- `reset` ([signaling-mode.js#L501](file:///d:/MyProg/YCDesk/windows/src/renderer/js/signaling-mode.js#L501))

集成方式与 `direct-mode.js` 完全相同，可复用相同的类。

---

## 5. 新增文件清单

| 文件 | 位置 | 说明 |
|------|------|------|
| `frame-capturer.js` | `src/renderer/js/` | 屏幕帧捕获器 |
| `dirty-region-detector.js` | `src/renderer/js/` | 脏区域检测器 |
| `frame-differ.js` | `src/renderer/js/` | 帧差计算器 |
| `video-frame-transmitter.js` | `src/renderer/js/` | 视频帧发送器 (被控端) |
| `video-frame-receiver.js` | `src/renderer/js/` | 视频帧接收器 (主控端) |
| `remote-video-handler.js` | `src/renderer/js/` | 主控端视频处理整合 |

---

## 6. 配置参数

### 6.1 被控端配置

在 `direct-mode.js` 或配置文件中：

```javascript
const OPTIMIZATION_CONFIG = {
  // 是否启用优化传输
  enabled: true,

  // 帧捕获配置
  capture: {
    defaultWidth: 1920,
    defaultHeight: 1080,
    maxFrameRate: 30
  },

  // 脏区域检测配置
  dirtyDetection: {
    // 网格大小 (像素)，越小精度越高但开销越大
    gridSize: 64,
    // 像素差异阈值 (0-255)
    threshold: 10,
    // 是否启用网格检测
    enableGridMode: true,
    // 是否启用输入事件驱动检测
    enableInputDriven: true,
    // 脏区域聚合窗口 (ms)
    aggregationWindow: 16
  },

  // 帧差配置
  frameDiff: {
    // 关键帧间隔 (帧数)
    keyFrameInterval: 120,
    // JPEG 压缩质量 (0-1)
    jpegQuality: 0.7,
    // LZ4 压缩级别 (0-10)
    compressionLevel: 5
  },

  // 传输配置
  transmit: {
    // 发送帧率 (fps)
    frameRate: 30,
    // 最大队列长度
    maxQueueSize: 2,
    // 最小帧间隔 (ms)
    minFrameInterval: 16
  }
}
```

### 6.2 主控端配置

```javascript
const RECEIVER_CONFIG = {
  // 最大待处理帧数
  maxPendingFrames: 30,
  // Canvas 是否启用抗锯齿
  antialias: false
}
```

---

## 7. 回退机制

### 7.1 自动回退触发条件

| 条件 | 回退动作 |
|------|----------|
| 优化视频通道未打开 | 使用标准 addTrack 模式 |
| DataChannel 发送失败 | 切换到标准 WebRTC 视频轨道 |
| 连续 N 帧解码失败 | 发送关键帧刷新 |
| 网络断开后重连 | 重新初始化优化传输 |

### 7.2 回退实现

```javascript
// 在 VideoFrameTransmitter 中
async ensureStandardModeFallback() {
  if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
    this.logger.warn('[VideoFrameTransmitter] 优化通道不可用，回退到标准模式')

    // 通知外部切换到标准模式
    if (this.onFallbackToStandard) {
      this.onFallbackToStandard()
    }

    // 停止当前捕获
    this.stop()

    // 外部代码应调用标准的 startScreenCapture
    return false
  }
  return true
}
```

---

## 8. 测试建议

### 8.1 单元测试

| 测试项 | 验证点 |
|--------|--------|
| `FrameCapturer` | 首帧捕获、持续捕获、停止捕获 |
| `DirtyRegionDetector` | 网格检测准确性、输入事件触发 |
| `FrameDiffer` | 关键帧生成、差异帧生成、RLE 压缩率 |
| `VideoFrameTransmitter` | 帧率控制、队列管理、统计准确性 |
| `VideoFrameReceiver` | 关键帧解码、差异帧重建、脏区域合并 |

### 8.2 集成测试

| 场景 | 预期结果 |
|------|----------|
| 鼠标快速移动 | 脏区域跟随鼠标，静态背景不传输 |
| 播放视频 | 每隔 120 帧关键帧，差异帧跟随内容变化 |
| 静态待机 | 无数据传输或极低帧率 |
| 网络延迟 200ms | 帧队列平滑播放，无明显卡顿 |
| 切换窗口 | 全帧刷新，无残影 |

### 8.3 性能基准

| 指标 | 目标值 |
|------|--------|
| 帧捕获延迟 | < 5ms |
| 脏检测 CPU 占用 | < 10% 单核 |
| 压缩/解压延迟 | < 10ms |
| 端到端延迟 | < 100ms |
| 静态带宽 | < 100KB/s |
| 动态带宽 | 1-3 Mbps |

---

## 9. 风险与注意事项

### 9.1 已知风险

1. **Canvas 性能**: 大分辨率下 `getImageData` 可能成为瓶颈
   - 缓解: 使用网格检测降采样

2. **RLE 压缩效果**: 对于复杂画面压缩比较低
   - 缓解: 对于高变化区域使用 JPEG 压缩

3. **内存占用**: 帧缓冲和待处理队列占用内存
   - 缓解: 限制队列长度，定期清理

### 9.2 浏览器兼容性

- 需要支持 `RTCPeerConnection.addTrack` (Chrome 56+, Firefox 44+)
- 需要支持 `DataChannel` (所有现代浏览器)
- 需要支持 `OffscreenCanvas` 可选优化

### 9.3 未来优化方向

1. 使用 `OffscreenCanvas` + WebWorker 进行帧处理
2. 使用 WebAssembly 加速图像处理 (如 LZ4, Zstd)
3. 考虑使用 WebGPU 进行 GPU 加速脏检测
4. 实现基于内容自适应编码 (CAE)

---

## 10. 附录

### 10.1 术语表

| 术语 | 说明 |
|------|------|
| 脏区域 (Dirty Region) | 屏幕中发生变化的区域 |
| 关键帧 (Key Frame) | 完整编码的帧，包含全部图像数据 |
| 差异帧 (Delta Frame) | 只包含与上一帧差异的帧 |
| 帧差 (Frame Diff) | 相邻帧之间的像素差异 |

### 10.2 参考资料

- WebRTC Data Channel API: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

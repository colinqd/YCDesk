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
    this.frameInterval = options.frameInterval || 33
    this.minFrameInterval = 1000 / 60
    this.transmitQueue = []
    this.maxQueueSize = 2
    this.onStatsUpdate = null
    this.onFallbackToStandard = null

    // 自适应参数
    this.adaptiveEnabled = options.adaptiveEnabled !== false
    this.currentLatency = 0
    this.currentFrameRate = options.frameRate || 30
    this.currentQuality = options.jpegQuality || 0.7
    this.minFrameRate = 5
    this.maxFrameRate = 30
    this.minQuality = 0.4
    this.maxQuality = 0.85
    this.lastAdaptationTime = 0
    this.adaptationInterval = 2000
    this.dirtyRatioHistory = []
    this.maxDirtyHistory = 10

    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      keyFramesSent: 0,
      deltaFramesSent: 0,
      avgFrameTime: 0,
      avgDirtyRegions: 0
    }

    // 空闲检测：连续无变化帧时降低捕获频率
    this._idleFrameCount = 0
    this._maxIdleFrames = 30  // 连续30帧无变化后进入空闲模式
    this._idleFrameInterval = 200  // 空闲模式捕获间隔 (5fps)
    this._normalFrameInterval = this.frameInterval

    // 带宽估算
    this.currentBandwidth = 0  // kbps
    this.peerConnection = null
    this.bandwidthEstimator = null
  }

  initialize(dataChannel, width, height) {
    this.dataChannel = dataChannel
    // 设置 binaryType 以支持 ArrayBuffer 传输
    if (dataChannel && dataChannel.binaryType !== 'arraybuffer') {
      dataChannel.binaryType = 'arraybuffer'
    }

    this.frameCapturer = new FrameCapturer({
      width: width,
      height: height,
      frameRate: this.currentFrameRate
    })
    this.dirtyDetector = new DirtyRegionDetector({
      width: width,
      height: height,
      gridSize: 64,
      threshold: 10
    })
    this.frameDiffer = new FrameDiffer({
      width: width,
      height: height,
      keyFrameInterval: 120,
      jpegQuality: this.currentQuality
    })

    this.frameCapturer.onFrame = (frame) => this.handleFrame(frame)

    this.logger.log('[VideoFrameTransmitter] 初始化完成 (二进制协议, 自适应: ' + this.adaptiveEnabled + ')')
  }

  async start(sourceId, width, height) {
    if (this.isRunning) {
      this.logger.warn('[VideoFrameTransmitter] 已经在运行')
      return
    }

    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.logger.warn('[VideoFrameTransmitter] 优化通道不可用，回退到标准模式')
      if (this.onFallbackToStandard) {
        this.onFallbackToStandard()
      }
      return null
    }

    this.logger.log('[VideoFrameTransmitter] 启动屏幕捕获')

    this.frameCapturer.width = width
    this.frameCapturer.height = height
    this.dirtyDetector.width = width
    this.dirtyDetector.height = height
    this.frameDiffer.width = width
    this.frameDiffer.height = height

    const resolution = await this.frameCapturer.startCapture(sourceId, width, height)
    this.isRunning = true

    this.scheduleNextFrame()

    return resolution
  }

  stop() {
    this.isRunning = false
    this.stopBandwidthEstimation()
    if (this.frameCapturer) {
      this.frameCapturer.stopCapture()
    }
    this.transmitQueue = []
    this.logger.log('[VideoFrameTransmitter] 已停止')
  }

  async handleFrame(frame) {
    if (!this.isRunning) return

    const now = Date.now()
    const elapsed = now - this.lastFrameTime

    if (elapsed < this.frameInterval) return

    const dirtyRegions = this.dirtyDetector.detectDirtyRegions(frame, this.previousFrame)

    const inputRegions = this.dirtyDetector.getAndClearPendingRegions()
    if (inputRegions.length > 0) {
      dirtyRegions.push(...inputRegions)
    }

    // 记录脏区域比例用于自适应
    if (this.adaptiveEnabled) {
      const totalPixels = frame.width * frame.height
      let dirtyPixels = 0
      for (const r of dirtyRegions) {
        dirtyPixels += r.width * r.height
      }
      this.dirtyRatioHistory.push(dirtyPixels / totalPixels)
      if (this.dirtyRatioHistory.length > this.maxDirtyHistory) {
        this.dirtyRatioHistory.shift()
      }

      // 空闲检测：无脏区域时累加计数器
      if (dirtyRegions.length === 0) {
        this._idleFrameCount++
      } else {
        this._idleFrameCount = 0
      }
    }

    const frameDiff = await this.frameDiffer.computeDiff(frame, dirtyRegions)

    this.transmitQueue.push(frameDiff)
    if (this.transmitQueue.length > this.maxQueueSize) {
      this.transmitQueue.shift()
    }

    this.previousFrame = frame
    this.lastFrameTime = now

    this.scheduleTransmit()
  }

  scheduleNextFrame() {
    if (!this.isRunning) return

    setTimeout(() => {
      if (this.isRunning) {
        // 自适应：根据延迟和变化量调整帧率
        this.adaptParameters()
        // 手动触发捕获，不再依赖 setInterval
        this.frameCapturer.captureFrame()
        this.scheduleNextFrame()
      }
    }, this.frameInterval)
  }

  scheduleTransmit() {
    if (this.transmitQueue.length === 0) return

    setTimeout(() => {
      this.transmitNextFrame()
    }, 0)
  }

  transmitNextFrame() {
    if (this.transmitQueue.length === 0) return
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.logger.warn('[VideoFrameTransmitter] 数据通道不可用，丢弃帧')
      this.transmitQueue.shift()
      return
    }

    const frameData = this.transmitQueue.shift()

    this.updateStats(frameData)

    // 二进制序列化
    const binaryData = this.serializeFrameBinary(frameData)

    try {
      this.dataChannel.send(binaryData)
    } catch (e) {
      this.logger.error('[VideoFrameTransmitter] 发送帧失败: ' + e.message)
    }
  }

  // ========== 二进制帧序列化协议 ==========
  // 帧头: [type:1B][frameId:4B][flags:1B][width:2B][height:2B][regionCount:2B] = 12 bytes
  // 区域: [x:2B][y:2B][w:2B][h:2B][dataType:1B][dataLen:4B][data:N]
  // 数据类型: 0=JPEG(base64), 1=RLE, 2=raw
  // flags: bit0=isKeyFrame

  serializeFrameBinary(frame) {
    const regionCount = frame.regions.length

    // 预估总大小
    let estimatedSize = 12 // 帧头
    for (const region of frame.regions) {
      estimatedSize += 11 // 区域头
      if (region.data.type === 'jpeg') {
        estimatedSize += region.data.data.length
      } else if (region.data.type === 'rle') {
        estimatedSize += region.data.data.length
      } else {
        estimatedSize += (region.data.data ? region.data.data.length : 0)
      }
    }

    const buf = new ArrayBuffer(estimatedSize)
    const view = new DataView(buf)
    let offset = 0

    // 帧头
    view.setUint8(offset, 0x01) // type: 视频帧
    offset += 1
    view.setUint32(offset, frame.frameId, true) // frameId (LE)
    offset += 4
    let flags = 0
    if (frame.isKeyFrame) flags |= 0x01
    view.setUint8(offset, flags)
    offset += 1
    view.setUint16(offset, frame.width, true)
    offset += 2
    view.setUint16(offset, frame.height, true)
    offset += 2
    view.setUint16(offset, regionCount, true)
    offset += 2

    // 写入区域
    for (const region of frame.regions) {
      view.setUint16(offset, region.x, true)
      offset += 2
      view.setUint16(offset, region.y, true)
      offset += 2
      view.setUint16(offset, region.width, true)
      offset += 2
      view.setUint16(offset, region.height, true)
      offset += 2

      const data = region.data
      let dataType, dataBytes

      if (data.type === 'jpeg') {
        dataType = 0
        // 直接使用原始 JPEG 二进制（ArrayBuffer），无 Base64 开销
        if (data.data instanceof ArrayBuffer) {
          dataBytes = new Uint8Array(data.data)
        } else if (typeof data.data === 'string') {
          // 向后兼容：旧格式 data URL 字符串
          dataBytes = this.stringToUTF8(data.data)
        } else {
          dataBytes = new Uint8Array(data.data)
        }
      } else if (data.type === 'rle') {
        dataType = 1
        dataBytes = new Uint8Array(data.data)
      } else {
        dataType = 2
        if (data.data instanceof Uint8Array || data.data instanceof Uint8ClampedArray) {
          dataBytes = new Uint8Array(data.data)
        } else if (Array.isArray(data.data)) {
          dataBytes = new Uint8Array(data.data)
        } else {
          dataBytes = new Uint8Array(0)
        }
      }

      view.setUint8(offset, dataType)
      offset += 1
      view.setUint32(offset, dataBytes.length, true)
      offset += 4

      // 写入数据到 ArrayBuffer
      const dataArr = new Uint8Array(buf, offset, dataBytes.length)
      dataArr.set(dataBytes)
      offset += dataBytes.length
    }

    // 如有估算偏差，截取实际大小
    if (offset < estimatedSize) {
      return buf.slice(0, offset)
    }
    return buf
  }

  stringToUTF8(str) {
    const encoder = new TextEncoder()
    return encoder.encode(str)
  }

  markInputRegion(x, y, type) {
    if (!this.dirtyDetector) return
    this.dirtyDetector.markInputDrivenRegion(x, y, type)
  }

  // ========== 自适应参数调整 ==========

  adaptParameters() {
    if (!this.adaptiveEnabled) return

    const now = Date.now()
    if (now - this.lastAdaptationTime < this.adaptationInterval) return
    this.lastAdaptationTime = now

    // 计算平均脏区域比例
    const avgDirty = this.dirtyRatioHistory.length > 0
      ? this.dirtyRatioHistory.reduce((a, b) => a + b, 0) / this.dirtyRatioHistory.length
      : 0.5

    // 空闲检测：长时间无变化时降低捕获频率
    if (this._idleFrameCount > this._maxIdleFrames) {
      if (this.frameInterval !== this._idleFrameInterval) {
        this.frameInterval = this._idleFrameInterval
        this.logger.log('[VideoFrameTransmitter] 进入空闲模式，捕获间隔: ' + this.frameInterval + 'ms')
      }
      return  // 空闲模式下跳过其他自适应
    } else {
      this.frameInterval = this._normalFrameInterval
    }

    // 自适应帧率
    let targetFps = this.currentFrameRate
    const bw = this.currentBandwidth  // kbps

    if (bw > 0 && bw < 500) {
      // 带宽极低：优先流畅
      targetFps = Math.max(this.minFrameRate, 10)
    } else if (bw > 0 && bw < 1500) {
      // 带宽中等
      targetFps = Math.max(this.minFrameRate, 15)
    } else if (this.currentLatency > 200) {
      targetFps = Math.max(this.minFrameRate, this.currentFrameRate - 5)
    } else if (this.currentLatency < 50 && avgDirty > 0.3) {
      targetFps = Math.min(this.maxFrameRate, this.currentFrameRate + 5)
    } else if (avgDirty < 0.05) {
      targetFps = Math.max(this.minFrameRate, 10)
    } else {
      targetFps = Math.max(this.minFrameRate, Math.min(this.maxFrameRate, 20))
    }

    if (targetFps !== this.currentFrameRate) {
      this.currentFrameRate = targetFps
      this.frameInterval = Math.round(1000 / this.currentFrameRate)
      this._normalFrameInterval = this.frameInterval
      this.logger.log('[VideoFrameTransmitter] 自适应帧率: ' + this.currentFrameRate + ' fps (延迟: ' + this.currentLatency + 'ms, 带宽: ' + bw + 'kbps, 脏区域: ' + (avgDirty * 100).toFixed(1) + '%)')
    }

    // 自适应 JPEG 质量
    let targetQuality = this.currentQuality
    if (bw > 0 && bw < 500) {
      targetQuality = this.minQuality
    } else if (bw > 0 && bw < 1500) {
      targetQuality = 0.55
    } else if (this.currentLatency > 300) {
      targetQuality = this.minQuality
    } else if (this.currentLatency > 150) {
      targetQuality = 0.55
    } else if (this.currentLatency < 30) {
      targetQuality = this.maxQuality
    } else if (this.currentLatency < 80) {
      targetQuality = 0.75
    } else {
      targetQuality = 0.65
    }

    if (targetQuality !== this.currentQuality) {
      this.currentQuality = targetQuality
      this.setQuality(this.currentQuality)
    }
  }

  setLatency(ms) {
    this.currentLatency = ms
  }

  setPeerConnection(pc) {
    this.peerConnection = pc
    if (pc && typeof BandwidthEstimator !== 'undefined') {
      if (!this.bandwidthEstimator) {
        this.bandwidthEstimator = new BandwidthEstimator({
          logger: this.logger
        })
        this.bandwidthEstimator.onEstimate = (kbps) => {
          this.setBandwidth(kbps)
        }
      }
      this.bandwidthEstimator.start(pc)
    }
  }

  stopBandwidthEstimation() {
    if (this.bandwidthEstimator) {
      this.bandwidthEstimator.stop()
    }
  }

  setBandwidth(kbps) {
    this.currentBandwidth = kbps
  }

  updateStats(frameData) {
    this.stats.framesSent++
    if (frameData.isKeyFrame) {
      this.stats.keyFramesSent++
    } else {
      this.stats.deltaFramesSent++
    }

    this.stats.avgDirtyRegions =
      (this.stats.avgDirtyRegions * (this.stats.framesSent - 1) + frameData.regions.length)
      / this.stats.framesSent

    if (this.onStatsUpdate) {
      this.onStatsUpdate(Object.assign({}, this.stats))
    }
  }

  getStats() {
    return Object.assign({}, this.stats)
  }

  setFrameRate(fps) {
    this.currentFrameRate = Math.max(this.minFrameRate, Math.min(this.maxFrameRate, fps))
    this.frameInterval = Math.round(1000 / this.currentFrameRate)
    this.logger.log('[VideoFrameTransmitter] 帧率设置为 ' + this.currentFrameRate + ' fps')
  }

  setQuality(quality) {
    if (this.frameDiffer) {
      this.frameDiffer.jpegQuality = quality
      this.logger.log('[VideoFrameTransmitter] 图像质量设置为 ' + quality)
    }
  }

  setKeyFrameInterval(interval) {
    if (this.frameDiffer) {
      this.frameDiffer.keyFrameInterval = interval
      this.logger.log('[VideoFrameTransmitter] 关键帧间隔设置为 ' + interval)
    }
  }

  reset() {
    this.stop()
    if (this.frameDiffer) {
      this.frameDiffer.reset()
    }
    this.previousFrame = null
    this.dirtyRatioHistory = []
    this.currentLatency = 0
    this.currentBandwidth = 0
    this._idleFrameCount = 0
    this.frameInterval = this._normalFrameInterval
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
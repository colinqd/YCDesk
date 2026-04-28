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
    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      keyFramesSent: 0,
      deltaFramesSent: 0,
      avgFrameTime: 0,
      avgDirtyRegions: 0
    }
  }

  initialize(dataChannel, width, height) {
    this.dataChannel = dataChannel
    this.frameCapturer = new FrameCapturer({
      width: width,
      height: height,
      frameRate: 30
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
      jpegQuality: 0.7
    })

    this.frameCapturer.onFrame = (frame) => this.handleFrame(frame)

    this.logger.log('[VideoFrameTransmitter] 初始化完成')
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

    if (elapsed < this.frameInterval) return

    const dirtyRegions = this.dirtyDetector.detectDirtyRegions(frame, this.previousFrame)

    const inputRegions = this.dirtyDetector.getAndClearPendingRegions()
    if (inputRegions.length > 0) {
      dirtyRegions.push(...inputRegions)
    }

    if (dirtyRegions.length === 0) {
      this.lastFrameTime = now
      return
    }

    const frameDiff = this.frameDiffer.computeDiff(frame, dirtyRegions)

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

    const serialized = this.serializeFrame(frameData)

    try {
      this.dataChannel.send(serialized)
      this.logger.log('[VideoFrameTransmitter] 发送帧 #' + frameData.frameId +
        ', 区域数: ' + frameData.regions.length +
        ', 大小: ' + serialized.length + ' bytes' +
        ', 类型: ' + (frameData.isKeyFrame ? '关键帧' : '差异帧'))
    } catch (e) {
      this.logger.error('[VideoFrameTransmitter] 发送帧失败: ' + e.message)
    }
  }

  serializeFrame(frame) {
    return JSON.stringify({
      type: 'video-frame',
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      width: frame.width,
      height: frame.height,
      isKeyFrame: frame.isKeyFrame,
      regionCount: frame.regions.length,
      regions: frame.regions.map(function(r) {
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          data: r.data
        }
      })
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
      this.onStatsUpdate(Object.assign({}, this.stats))
    }
  }

  getStats() {
    return Object.assign({}, this.stats)
  }

  setFrameRate(fps) {
    this.frameInterval = 1000 / fps
    this.logger.log('[VideoFrameTransmitter] 帧率设置为 ' + fps + ' fps')
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

class PerformanceMonitor {
  constructor(options = {}) {
    this.metrics = {
      fps: 0, latency: 0, avgLatency: 0, bandwidth: 0,
      packetLoss: 0, frameDrops: 0, encoderTime: 0, decoderTime: 0,
      totalFramesReceived: 0, totalFramesDecoded: 0,
      totalBytesReceived: 0, connectionUptime: 0
    }
    this._frameTimestamps = []
    this._latencySamples = []
    this._maxSamples = options.maxSamples || 120
    this._connectionStartTime = null
    this._onReport = options.onReport || null
    this._reportInterval = options.reportInterval || 2000
    this._reportTimer = null
  }

  start() {
    this._connectionStartTime = Date.now()
    this._startReportTimer()
  }

  stop() {
    if (this._reportTimer) { clearInterval(this._reportTimer); this._reportTimer = null }
    this._connectionStartTime = null
  }

  recordFrame() {
    const now = performance.now()
    this._frameTimestamps.push(now)
    this.metrics.totalFramesReceived++
    const oneSecondAgo = now - 1000
    while (this._frameTimestamps.length > 0 && this._frameTimestamps[0] < oneSecondAgo) {
      this._frameTimestamps.shift()
    }
    this.metrics.fps = this._frameTimestamps.length
    if (this._frameTimestamps.length > this._maxSamples) {
      this._frameTimestamps = this._frameTimestamps.slice(-this._maxSamples)
    }
  }

  recordLatency(ms) {
    if (typeof ms !== 'number' || ms < 0) return
    this._latencySamples.push(ms)
    if (this._latencySamples.length > this._maxSamples) {
      this._latencySamples = this._latencySamples.slice(-this._maxSamples)
    }
    this.metrics.latency = ms
    if (this._latencySamples.length > 0) {
      this.metrics.avgLatency = Math.round(this._latencySamples.reduce((a, b) => a + b, 0) / this._latencySamples.length)
    }
  }

  recordBandwidth(bytesPerSecond) { this.metrics.bandwidth = Math.round(bytesPerSecond / 1024) }
  recordPacketLoss(ratio) { this.metrics.packetLoss = ratio }
  recordFrameDrop() { this.metrics.frameDrops++ }
  recordEncodeTime(ms) { this.metrics.encoderTime = ms }
  recordDecodeTime(ms) { this.metrics.decoderTime = ms }
  recordBytesReceived(bytes) { this.metrics.totalBytesReceived += bytes }
  recordFrameDecoded() { this.metrics.totalFramesDecoded++ }

  updateUptime() {
    if (this._connectionStartTime) {
      this.metrics.connectionUptime = Math.round((Date.now() - this._connectionStartTime) / 1000)
    }
  }

  getReport() { this.updateUptime(); return { ...this.metrics } }

  _startReportTimer() {
    if (this._reportTimer) clearInterval(this._reportTimer)
    this._reportTimer = setInterval(() => {
      this.updateUptime()
      if (this._onReport) this._onReport(this.getReport())
    }, this._reportInterval)
  }

  reset() {
    this.metrics = {
      fps: 0, latency: 0, avgLatency: 0, bandwidth: 0,
      packetLoss: 0, frameDrops: 0, encoderTime: 0, decoderTime: 0,
      totalFramesReceived: 0, totalFramesDecoded: 0,
      totalBytesReceived: 0, connectionUptime: 0
    }
    this._frameTimestamps = []
    this._latencySamples = []
    this.stop()
  }
}

module.exports = { PerformanceMonitor }
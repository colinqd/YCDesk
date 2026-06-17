class BandwidthEstimator {
  constructor(options = {}) {
    this.peerConnection = null
    this.logger = options.logger || console
    this.interval = options.interval || 2000  // 估算间隔 ms
    this._timer = null
    this._running = false
    this.onEstimate = null  // callback(kbps)

    this.currentBandwidth = 0  // kbps
    this.smoothedBandwidth = 0  // 平滑后的带宽
    this.smoothingFactor = 0.3  // 平滑系数
    this.minBandwidth = 100
    this.maxBandwidth = 10000
    this.samples = []
    this.maxSamples = 10
  }

  start(peerConnection) {
    this.peerConnection = peerConnection
    this._running = true
    this._estimate()
  }

  stop() {
    this._running = false
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this.peerConnection = null
  }

  async _estimate() {
    if (!this._running || !this.peerConnection) return

    try {
      const stats = await this.peerConnection.getStats()
      let bandwidth = this._extractBandwidth(stats)
      bandwidth = Math.max(this.minBandwidth, Math.min(this.maxBandwidth, bandwidth))

      if (bandwidth > 0) {
        this.samples.push(bandwidth)
        if (this.samples.length > this.maxSamples) {
          this.samples.shift()
        }

        // 平滑处理
        if (this.smoothedBandwidth === 0) {
          this.smoothedBandwidth = bandwidth
        } else {
          this.smoothedBandwidth = this.smoothedBandwidth * (1 - this.smoothingFactor)
            + bandwidth * this.smoothingFactor
        }

        this.currentBandwidth = Math.round(this.smoothedBandwidth)

        if (this.onEstimate) {
          this.onEstimate(this.currentBandwidth)
        }
      }
    } catch (e) {
      // getStats 可能在某些状态下失败，静默忽略
    }

    this._timer = setTimeout(() => this._estimate(), this.interval)
  }

  _extractBandwidth(stats) {
    // 从 candidate-pair 中提取 availableOutgoingBitrate
    let bandwidth = 0

    stats.forEach(function(report) {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (report.availableOutgoingBitrate) {
          bandwidth = Math.max(bandwidth, report.availableOutgoingBitrate)
        }
      }
    })

    // 如果 candidate-pair 没有带宽信息，尝试从 remote-inbound-rtp 估算
    if (bandwidth === 0) {
      let totalBitrate = 0
      let count = 0
      stats.forEach(function(report) {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
          if (report.bitrate || report.receivedBitrate) {
            totalBitrate += (report.bitrate || report.receivedBitrate || 0)
            count++
          }
        }
      })
      if (count > 0) {
        bandwidth = totalBitrate / count
      }
    }

    // 转换为 kbps
    if (bandwidth > 1000000) {
      // 已经是 bps 单位，转为 kbps
      bandwidth = Math.round(bandwidth / 1000)
    } else if (bandwidth > 10000) {
      // 也可能是 bps
      bandwidth = Math.round(bandwidth / 1000)
    }

    return bandwidth
  }

  getBandwidth() {
    return this.currentBandwidth
  }

  reset() {
    this.stop()
    this.currentBandwidth = 0
    this.smoothedBandwidth = 0
    this.samples = []
  }
}
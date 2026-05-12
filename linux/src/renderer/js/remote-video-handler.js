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

    this.frameReceiver = new VideoFrameReceiver({
      logger: { log: this.logger.log.bind(this), error: console.error },
      canvas: canvas
    })
    this.frameReceiver.initialize(canvas)

    this.frameReceiver.onStatsUpdate = function(stats) {
      this.logger.log('[接收统计] 帧:' + stats.framesReceived +
        ' 关键帧:' + stats.keyFramesReceived +
        ' 差异帧:' + stats.deltaFramesReceived +
        ' 平均解码时间:' + stats.avgDecodeTime.toFixed(1) + 'ms')
    }.bind(this)

    this.frameReceiver.onFrameRendered = function(info) {
      this.logger.log('[渲染] 帧 #' + info.frameId + ' ' +
        info.width + 'x' + info.height + ' ' +
        (info.isKeyFrame ? '关键帧' : '差异帧'))
    }.bind(this)

    this.logger.log('[RemoteVideoHandler] 初始化完成')
  }

  setupDataChannel(channel) {
    this.dataChannel = channel

    channel.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data)

        if (data.type === 'video-frame') {
          this.frameReceiver.handleMessage(data)
        } else if (data.type === 'video-control') {
          this.handleVideoControl(data)
        }
      } catch (e) {
        this.logger.error('[RemoteVideoHandler] 解析消息失败: ' + e.message)
      }
    }.bind(this)

    channel.onopen = function() {
      this.logger.log('[RemoteVideoHandler] 数据通道已打开')
      this.isOptimizedMode = true
      this.switchToOptimizedMode()
    }.bind(this)

    channel.onclose = function() {
      this.logger.log('[RemoteVideoHandler] 数据通道已关闭')
      this.isOptimizedMode = false
      this.switchToStandardMode()
    }.bind(this)
  }

  handleVideoControl(data) {
    if (data.action === 'stats') {
      this.logger.log('[RemoteVideoHandler] 收到传输统计: ' + JSON.stringify(data.stats))
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
    var track = event.track

    if (track.kind === 'video') {
      this.logger.log('[RemoteVideoHandler] 收到视频轨道')

      if (!this.isOptimizedMode) {
        var streams = this.peerConnection.getReceivers()
        var remoteStream = new MediaStream()
        this.peerConnection.getReceivers().forEach(function(receiver) {
          if (receiver.track) {
            remoteStream.addTrack(receiver.track)
          }
        })
        this.videoElement.srcObject = remoteStream
        this.videoElement.style.display = 'block'
        this.canvas.style.display = 'none'
      }
    }
  }

  setResolution(width, height) {
    if (this.frameReceiver) {
      this.frameReceiver.setCanvasSize(width, height)
    }
    this.logger.log('[RemoteVideoHandler] 分辨率设置为 ' + width + 'x' + height)
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

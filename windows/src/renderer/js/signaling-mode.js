class SignalingModeManager {
  constructor(options = {}) {
    this.signalingClient = new SignalingClient({
      log: options.log || console.log,
      maxReconnectAttempts: 5,
      reconnectDelay: 2000,
      onRegistered: (data) => {},
      onIncomingConnection: (data) => {
        this.incomingFromDeviceId = data.fromDeviceId
        this.currentSessionId = data.sessionId
        this.isController = false
        if (typeof this.onIncomingConnection === 'function') {
          this.onIncomingConnection(data.fromDeviceId)
        }
      },
      onConnectionResult: (data) => {
        if (data.accepted) {
          this.currentSessionId = data.sessionId
          this.incomingFromDeviceId = data.toDeviceId
          this.startControllerConnection()
        } else {
          alert('对方拒绝了连接请求')
        }
      },
      onConnectionFailed: (data) => {
        alert('连接失败: ' + (data.reason === 'device-offline' ? '目标设备不在线' : data.reason))
      },
      onOffer: (data) => {
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          this.logFn('[自连接] 收到自己的offer回环，转发给被控端')
          this.handleOffer(data)
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-offer', data)
        } else {
          this.handleOffer(data)
        }
      },
      onAnswer: (data) => {
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          this.logFn('[自连接] 收到自己的answer回环，转发给远程窗口')
          window.electronAPI.sendToRemoteWindow('signaling-answer', data)
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-answer', data)
        } else if (this.peerConnection) {
          this.handleAnswer(data.answer)
        }
      },
      onIceCandidate: (data) => {
        var candidateKey = ''
        if (data.candidate && data.candidate.candidate) {
          candidateKey = data.candidate.candidate
        }
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          if (this.remoteWindowIceCandidateKeys.has(candidateKey)) {
            this.remoteWindowIceCandidateKeys.delete(candidateKey)
            this.logFn('[自连接] 收到远程窗口ICE候选回环，添加到被控端')
            if (this.peerConnection) {
              this.handleIceCandidate(data.candidate)
            }
          } else {
            this.logFn('[自连接] 收到被控端ICE候选回环，转发给远程窗口')
            window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
          }
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
        } else if (this.peerConnection) {
          this.handleIceCandidate(data.candidate)
        }
      },
      onConnected: () => {
        if (this.uiManager) {
          const mode = this.signalingClient.getNegotiatedMode()
          const label = mode === 'websocket' ? '已连接 (WebSocket)' : '已连接 (Socket.IO)'
          this.uiManager.updateServerStatus(label, 'connected')
        }
      },
      onDisconnected: () => {
        if (this.uiManager) {
          this.uiManager.updateServerStatus('已断开', 'disconnected')
        }
        if (typeof this.onDisconnectedCallback === 'function') {
          this.onDisconnectedCallback()
        }
        window.electronAPI.sendToRemoteWindow('signaling-disconnected', { reason: 'connection closed' })
      },
      onError: () => {
        if (this.uiManager) {
          this.uiManager.updateServerStatus('连接失败', 'error')
        }
      }
    })

    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.myDeviceId = ''
    this.logFn = options.log || console.log
    this.uiManager = options.uiManager
    this.config = options.config || {}
    this.onConnected = options.onConnected || null
    this.onDisconnectedCallback = options.onDisconnected || null
    this.onIncomingConnection = options.onIncomingConnection || null
    
    this.peerConnection = null
    this.dataChannelManager = null
    this.inputChannel = null
    this.inputChannelReady = false
    this.auxiliaryChannels = new Map()
    this.pendingIceCandidates = []
    this.pendingStartSignal = null
    this.serverUrl = ''
    this.role = ''
    this.selfConnection = false
    this.remoteWindowIceCandidateKeys = new Set()
    this.videoFrameTransmitter = null
    this.useOptimizedTransfer = options.useOptimizedTransfer !== false
    this.OPTIMIZED_VIDEO_CHANNEL = 'optimized-video'
    this.optimizedVideoChannel = null
    this.currentStream = null
    
    this._setupRemoteWindowListeners()
  }

  setDeviceId(deviceId) {
    this.myDeviceId = deviceId
    this.signalingClient.setDeviceId(deviceId)
  }

  setConnectionMode(mode) {
    this.signalingClient.setConnectionMode(mode)
  }

  async connect(serverUrl, role) {
    this.serverUrl = serverUrl
    this.role = role
    this.isController = (role === 'controller')

    let normalizedUrl = serverUrl.trim()
    this.logFn('原始地址: ' + serverUrl)
    
    if (window.CONFIG && window.CONFIG.normalizeServerUrl) {
      normalizedUrl = window.CONFIG.normalizeServerUrl(normalizedUrl)
      this.logFn('normalize后: ' + normalizedUrl)
    }
    
    if (this.uiManager) {
      this.uiManager.updateServerStatus('连接中...', 'connecting')
    }

    this.signalingClient.connect(normalizedUrl)
  }

  disconnect() {
    this.signalingClient.disconnect()
    if (this.uiManager) {
      this.uiManager.updateServerStatus('已断开', 'disconnected')
    }
  }

  connectDevice(targetDeviceId) {
    if (!targetDeviceId) {
      alert('请输入设备 ID')
      return false
    }
    if (targetDeviceId.length < 6 || targetDeviceId.length > 16) {
      alert('设备 ID 格式不正确（需要 6-16 位字符）')
      return false
    }
    if (!this.signalingClient.isConnected()) {
      alert('未连接到信令服务器，请先连接服务器')
      return false
    }

    this.incomingFromDeviceId = targetDeviceId
    this.selfConnection = (targetDeviceId === this.myDeviceId)
    this.signalingClient.send('connect-request', {
      fromDeviceId: this.myDeviceId,
      toDeviceId: targetDeviceId
    })

    alert('连接请求已发送，请等待对方确认...')
    return true
  }

  acceptConnection() {
    if (!this.signalingClient.isConnected()) return
    this.signalingClient.send('connection-response', {
      sessionId: this.currentSessionId,
      accepted: true,
      fromDeviceId: this.incomingFromDeviceId,
      toDeviceId: this.myDeviceId
    })
    
    this.logFn('已接受连接，作为被控端在主窗口建立WebRTC连接')
    this.selfConnection = (this.incomingFromDeviceId === this.myDeviceId)
    this.isController = false
    this.startControlledConnection()
  }

  rejectConnection() {
    if (!this.signalingClient.isConnected()) return
    this.signalingClient.send('connection-response', {
      sessionId: this.currentSessionId,
      accepted: false,
      fromDeviceId: this.incomingFromDeviceId,
      toDeviceId: this.myDeviceId
    })
  }

  async startControllerConnection() {
    this.logFn('作为主控端建立连接，打开远程窗口')
    this.isController = true
    window.electronAPI.openRemoteWindow()
    
    this.pendingStartSignal = {
      mode: 'controller',
      role: 'controller',
      sessionId: this.currentSessionId,
      targetDeviceId: this.incomingFromDeviceId,
      deviceId: this.myDeviceId
    }
    this.logFn('保存启动信号，等待远程窗口准备就绪: ' + JSON.stringify(this.pendingStartSignal))
  }

  async startControlledConnection() {
    this.logFn('作为被控端建立连接，在主窗口创建PeerConnection')
    this.isController = false
    await this.createPeerConnection()
    
    // 添加锁屏状态监听，发送给主控端
    if (window.electronAPI) {
      window.electronAPI.on('unlock-state-changed', (data) => {
        console.log('[SignalingModeManager] 收到IPC锁屏状态变更: ' + JSON.stringify(data))
        this.logFn('收到本地锁屏状态变更: ' + JSON.stringify(data))
        if (this.dataChannelManager) {
          console.log('[SignalingModeManager] 正在通过数据通道发送...')
          this.dataChannelManager.send({
            type: 'unlock-state-changed',
            ...data
          })
          console.log('[SignalingModeManager] 数据通道 send() 调用完成')
        } else {
          console.log('[SignalingModeManager] dataChannelManager 不存在，跳过')
        }
      })
    }
    
    this.logFn('被控端 PeerConnection 已创建，等待接收Offer...')
  }

  _setupRemoteWindowListeners() {
    window.electronAPI.on('send-signaling-offer', (data) => {
      this.logFn('从远程窗口收到 offer，发送到信令服务器')
      this.signalingClient.send('offer', {
        sessionId: data.sessionId || this.currentSessionId,
        offer: data.offer,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })

    window.electronAPI.on('send-signaling-answer', (data) => {
      this.logFn('从远程窗口收到 answer，发送到信令服务器')
      this.signalingClient.send('answer', {
        sessionId: data.sessionId || this.currentSessionId,
        answer: data.answer,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })

    window.electronAPI.on('send-signaling-ice-candidate', (data) => {
      this.logFn('从远程窗口收到 ICE candidate，发送到信令服务器')
      if (data.candidate && data.candidate.candidate) {
        this.remoteWindowIceCandidateKeys.add(data.candidate.candidate)
      }
      this.signalingClient.send('ice-candidate', {
        sessionId: data.sessionId || this.currentSessionId,
        candidate: data.candidate,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })
  }

  async createPeerConnection() {
    this.logFn('[信令模式] 创建 PeerConnection')
    this.peerConnection = new RTCPeerConnection(this.config.getIceConfig ? this.config.getIceConfig() : { iceServers: [] })
    
    this.dataChannelManager = new DataChannelManager({
      logger: { log: this.logFn.bind(this), error: console.error }
    })

    this.dataChannelManager.setOnOpen(() => {
      this.logFn('[信令模式] 数据通道已打开')
    })

    this.dataChannelManager.setOnMessage((data) => {
      if (data.type === 'input' || data.inputType) {
        this.logFn('[信令模式] 收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y)
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'screen-size') {
        this.logFn('[信令模式] 收到屏幕尺寸: ' + data.width + 'x' + data.height)
      } else if (data.type === 'resolution-request') {
        this.logFn('[信令模式] 收到分辨率请求: ' + data.width + 'x' + data.height)
        const screenW = this.config.screenCapture?.maxWidth || 1920
        const screenH = this.config.screenCapture?.maxHeight || 1080
        this.dataChannelManager.send({
          type: 'resolution-response',
          width: screenW,
          height: screenH
        })
      } else if (data.type === 'resolution-change') {
        this.logFn('[信令模式] 收到分辨率变更请求: ' + data.width + 'x' + data.height)
      } else if (data.type === 'video-refresh-request') {
        this.logFn('[信令模式] 收到视频刷新请求，重新初始化屏幕捕获...')
        this.refreshVideoStream()
      }
    })

    this.dataChannelManager.setOnClose(() => {
      this.logFn('[信令模式] 数据通道已关闭')
    })

    this.dataChannelManager.setOnError((error) => {
      console.error('[信令模式] 数据通道错误:', error)
    })

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.logFn('[信令模式] 发送ICE候选')
        this.signalingClient.send('ice-candidate', {
          sessionId: this.currentSessionId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          },
          toDeviceId: this.incomingFromDeviceId
        })
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      this.logFn('[信令模式] ICE连接状态: ' + this.peerConnection.iceConnectionState)
    }

    this.peerConnection.onconnectionstatechange = () => {
      this.logFn('[信令模式] 连接状态: ' + this.peerConnection.connectionState)
      if (this.peerConnection.connectionState === 'connected') {
        this.logFn('[信令模式] WebRTC连接已建立')
      } else if (this.peerConnection.connectionState === 'failed') {
        this.logFn('[信令模式] WebRTC连接失败')
      }
    }

    this.peerConnection.ondatachannel = (event) => {
      const label = event.channel.label
      this.logFn('[信令模式] 收到数据通道: ' + label)
      
      if (label === 'control') {
        this.dataChannelManager.setDataChannel(event.channel)
      } else if (label === 'input') {
        this.inputChannel = event.channel
        this.inputChannelReady = true
        this.logFn('[信令模式] 输入数据通道已就绪')
        let inputMsgCount = 0
        this.inputChannel.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data)
            inputMsgCount++
            if (inputMsgCount === 1) {
              this.logFn('[信令模式] 收到第一条输入消息: type=' + data.type + ', inputType=' + data.inputType)
            }
            if (data.type === 'input' || data.inputType) {
              window.electronAPI.send('remote-input', data)
            }
          } catch (e) {
            this.logFn('[信令模式] 输入通道消息解析失败: ' + e.message)
          }
        }
        this.inputChannel.onclose = () => {
          this.inputChannelReady = false
          this.logFn('[信令模式] 输入数据通道已关闭, 共接收 ' + inputMsgCount + ' 条消息')
        }
        this.inputChannel.onerror = (error) => {
          this.inputChannelReady = false
          this.logFn('[信令模式] 输入数据通道错误: ' + error)
        }
      } else if (label.startsWith('aux-')) {
        const channelName = label.replace('aux-', '')
        this.auxiliaryChannels.set(channelName, event.channel)
        this.logFn('[信令模式] 辅助通道 ' + channelName + ' 已打开')
      } else if (label === this.OPTIMIZED_VIDEO_CHANNEL) {
        this.logFn('[信令模式] 收到优化视频通道')
        this.optimizedVideoChannel = event.channel
      }
    }
    
    this.peerConnection.ontrack = (event) => {
      this.logFn('[信令模式] 收到远程媒体流，track数量: ' + event.tracks.length)
    }

    if (this.useOptimizedTransfer) {
      this.videoFrameTransmitter = new VideoFrameTransmitter({
        logger: { log: this.logFn.bind(this), error: console.error }
      })

      this.videoFrameTransmitter.onStatsUpdate = (stats) => {
        this.logFn('[信令模式][传输统计] 帧:' + stats.framesSent +
          ' 关键帧:' + stats.keyFramesSent +
          ' 差异帧:' + stats.deltaFramesSent +
          ' 平均脏区域:' + stats.avgDirtyRegions.toFixed(1))
      }

      this.videoFrameTransmitter.onFallbackToStandard = () => {
        this.logFn('[信令模式] 优化传输回退到标准模式')
      }

      this.logFn('[信令模式] 优化视频传输模式已初始化')
    }

    this.setupInputEventListeners()
  }

  async handleOffer(data) {
    if (!data.offer) {
      this.logFn('[信令模式] 错误: offer为空')
      return
    }

    this.logFn('[信令模式] 收到offer')

    try {
      if (!this.peerConnection) {
        await this.createPeerConnection()
      } else {
        this.logFn('[信令模式] 复用已有PeerConnection')
      }
      
      this.logFn('[信令模式] 设置远程描述...')
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
      this.logFn('[信令模式] 远程描述设置成功')

      await this.addPendingIceCandidates()

      this.logFn('[信令模式] 开始捕获屏幕...')
      await this.startScreenCapture()

      this.logFn('[信令模式] 创建answer...')
      const answer = await this.peerConnection.createAnswer()
      await this.peerConnection.setLocalDescription(answer)
      this.logFn('[信令模式] 本地描述设置成功')

      this.signalingClient.send('answer', {
        sessionId: data.sessionId || this.currentSessionId,
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        toDeviceId: data.fromDeviceId || this.incomingFromDeviceId
      })

      this.logFn('[信令模式] 已发送answer')
    } catch (error) {
      this.logFn('[信令模式] 处理offer失败: ' + error.message)
      console.error('[信令模式] 处理offer详细错误:', error)
    }
  }

  async handleAnswer(answer) {
    if (!answer) {
      this.logFn('[信令模式] 错误: answer为空')
      return
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      this.logFn('[信令模式] answer设置成功')
      await this.addPendingIceCandidates()
    } catch (error) {
      this.logFn('[信令模式] 设置answer失败: ' + error.message)
    }
  }

  async handleIceCandidate(candidate) {
    if (!candidate) return

    try {
      if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) return

      if (!this.peerConnection || !this.peerConnection.remoteDescription) {
        const MAX_ICE_CANDIDATES = 50
        if (this.pendingIceCandidates.length >= MAX_ICE_CANDIDATES) {
          this.pendingIceCandidates.shift()
        }
        this.logFn('[信令模式] 缓存 ICE 候选（远程描述未设置）')
        this.pendingIceCandidates.push(candidate)
        return
      }

      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      this.logFn('[信令模式] ICE候选添加成功')
    } catch (error) {
      this.logFn('[信令模式] 添加ICE候选失败: ' + error.message)
    }
  }

  async addPendingIceCandidates() {
    this.logFn('[信令模式] 添加缓存的ICE候选: ' + this.pendingIceCandidates.length + ' 个')
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        this.logFn('[信令模式] 添加缓存ICE候选失败: ' + error.message)
      }
    }
    this.pendingIceCandidates = []
  }

  async startScreenCapture() {
    try {
      const sources = await window.electronAPI.getSources()
      this.logFn('[信令模式] 可用屏幕源: ' + sources.length + ' 个')

      if (sources.length > 0) {
        var maxWidth = this.config.screenCapture?.maxWidth || 1920
        var maxHeight = this.config.screenCapture?.maxHeight || 1080

        if (this.useOptimizedTransfer && this.videoFrameTransmitter && this.optimizedVideoChannel && this.optimizedVideoChannel.readyState === 'open') {
          this.logFn('[信令模式] 使用优化传输模式捕获屏幕')
          this.videoFrameTransmitter.initialize(this.optimizedVideoChannel, maxWidth, maxHeight)
          var resolution = await this.videoFrameTransmitter.start(sources[0].id, maxWidth, maxHeight)
          if (resolution) {
            this.logFn('[信令模式] 优化屏幕捕获成功，分辨率: ' + resolution.width + 'x' + resolution.height)
            return
          }
          this.logFn('[信令模式] 优化传输启动失败，回退到标准模式')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id,
              maxWidth: maxWidth,
              maxHeight: maxHeight,
              maxFrameRate: this.config.screenCapture?.maxFrameRate || 30,
              minFrameRate: this.config.screenCapture?.minFrameRate || 15
            }
          }
        })

        const tracks = stream.getTracks()
        this.logFn('[信令模式] 获取到 ' + tracks.length + ' 个媒体轨道')

        tracks.forEach(track => {
          var sender = this.peerConnection.addTrack(track, stream)
          this.logFn('[信令模式] 已添加媒体轨道: ' + track.kind + ', label: ' + track.label)

          try {
            var parameters = sender.getParameters()
            if (!parameters.encodings || parameters.encodings.length === 0) {
              parameters.encodings = [{}]
            }
            parameters.encodings[0].maxBitrate = 2000000
            parameters.encodings[0].maxFramerate = 20
            sender.setParameters(parameters)
            this.logFn('[信令模式] 已设置视频编码参数: maxBitrate=2Mbps, maxFramerate=20')
          } catch (e) {
            this.logFn('[信令模式] 设置视频编码参数失败: ' + e.message)
          }
        })

        this.logFn('[信令模式] 屏幕捕获成功，分辨率: ' + 
          stream.getVideoTracks()[0].getSettings().width + 'x' + 
          stream.getVideoTracks()[0].getSettings().height)
        this.currentStream = stream
      } else {
        this.logFn('[信令模式] 没有找到可用的屏幕源')
      }
    } catch (error) {
      this.logFn('[信令模式] 屏幕捕获失败: ' + error.message)
      console.error('[信令模式] 屏幕捕获详细错误:', error)
    }
  }

  stopScreenCapture() {
    if (this.videoFrameTransmitter) {
      this.videoFrameTransmitter.stop()
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => {
        track.stop()
      })
      this.currentStream = null
    }

    if (this.peerConnection) {
      const senders = this.peerConnection.getSenders()
      senders.forEach(sender => {
        if (sender.track) {
          try { this.peerConnection.removeTrack(sender) } catch (e) {}
        }
      })
    }
  }

  async refreshVideoStream() {
    this.logFn('[信令模式] 开始刷新视频流...')
    try {
      this.stopScreenCapture()

      const sources = await window.electronAPI.getSources()
      if (sources.length === 0) {
        this.logFn('[信令模式] 未找到屏幕源，刷新失败')
        return
      }

      const maxWidth = this.config.screenCapture?.maxWidth || 1920
      const maxHeight = this.config.screenCapture?.maxHeight || 1080

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
      tracks.forEach(track => {
        const sender = this.peerConnection.addTrack(track, this.currentStream)
        try {
          const parameters = sender.getParameters()
          if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}]
          }
          parameters.encodings[0].maxBitrate = 2000000
          parameters.encodings[0].maxFramerate = 20
          sender.setParameters(parameters)
        } catch (e) {}
      })

      this.logFn('[信令模式] 视频流已刷新，发起重新协商...')
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)

      this.signalingClient.send('offer', {
        sessionId: this.currentSessionId,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        toDeviceId: this.incomingFromDeviceId
      })

      this.logFn('[信令模式] 重新协商 offer 已发送')
    } catch (error) {
      this.logFn('[信令模式] 刷新视频流失败: ' + error.message)
    }
  }

  setupInputEventListeners() {
    window.electronAPI.on('remote-input', (data) => {
      if (this.videoFrameTransmitter && data.x !== undefined && data.y !== undefined) {
        var inputType = data.type || data.inputType || 'unknown'
        this.videoFrameTransmitter.markInputRegion(data.x, data.y, inputType)
      }
    })
  }

  reset() {
    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.pendingIceCandidates = []

    this.stopScreenCapture()

    if (this.videoFrameTransmitter) {
      this.videoFrameTransmitter.reset()
      this.videoFrameTransmitter = null
    }

    if (this.dataChannelManager) {
      try {
        this.dataChannelManager.close()
      } catch (e) {
        this.logFn('[信令模式] 关闭数据通道管理器时出错:', e)
      }
      this.dataChannelManager = null
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close()
      } catch (e) {
        this.logFn('[信令模式] 关闭 PeerConnection 时出错:', e)
      }
      this.peerConnection = null
    }
    
    this.logFn('信令模式管理器已重置')
  }
}

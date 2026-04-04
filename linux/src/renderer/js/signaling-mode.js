class SignalingModeManager {
  constructor(options = {}) {
    this.socket = null
    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.myDeviceId = ''
    this.logFn = options.log || console.log
    this.uiManager = options.uiManager
    this.config = options.config || {}
    this.onConnected = options.onConnected || null
    this.onDisconnected = options.onDisconnected || null
    this.onIncomingConnection = options.onIncomingConnection || null
    
    this.peerConnection = null
    this.dataChannelManager = null
    this.pendingIceCandidates = []
    this.pendingStartSignal = null
  }

  setDeviceId(deviceId) {
    this.myDeviceId = deviceId
  }

  async connect(serverUrl, role) {
    this.logFn('正在连接信令服务器: ' + serverUrl)
    if (this.uiManager) {
      this.uiManager.updateServerStatus('连接中...', 'connecting')
    }

    try {
      if (this.socket) {
        this.socket.disconnect()
      }

      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.config.maxReconnectAttempts || 10,
        reconnectionDelay: this.config.reconnectDelay || 1000,
        timeout: 10000
      })

      this._setupSocketListeners(role)
    } catch (error) {
      this.logFn('✗ 连接初始化错误: ' + error.message)
      if (this.uiManager) {
        this.uiManager.updateServerStatus('连接失败', 'error')
      }
      throw error
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.logFn('已手动断开服务器连接')
      if (this.uiManager) {
        this.uiManager.updateServerStatus('已断开', 'disconnected')
      }
    } else {
      this.logFn('未连接到服务器')
    }
  }

  connectDevice(targetDeviceId) {
    if (!targetDeviceId) {
      alert('请输入设备 ID')
      return false
    }
    if (targetDeviceId.length !== 9) {
      alert('设备 ID 格式不正确（需要 9 位字符）')
      return false
    }
    if (targetDeviceId === this.myDeviceId) {
      alert('不能连接自己')
      return false
    }
    if (!this.socket || !this.socket.connected) {
      alert('未连接到信令服务器，请先连接服务器')
      return false
    }

    this.incomingFromDeviceId = targetDeviceId
    this.socket.emit('connect-request', {
      fromDeviceId: this.myDeviceId,
      toDeviceId: targetDeviceId
    })

    alert('连接请求已发送，请等待对方确认...')
    return true
  }

  acceptConnection() {
    if (!this.socket) return
    this.socket.emit('connection-response', {
      sessionId: this.currentSessionId,
      accepted: true,
      fromDeviceId: this.incomingFromDeviceId,
      toDeviceId: this.myDeviceId
    })
    
    this.logFn('已接受连接，作为被控端在主窗口建立WebRTC连接')
    this.isController = false
    
    // 被控端直接在主窗口处理WebRTC连接，不打开远程窗口
    this.startControlledConnection()
  }

  rejectConnection() {
    if (!this.socket) return
    this.socket.emit('connection-response', {
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
    
    // 保存启动信号，等待远程窗口准备好
    this.pendingStartSignal = {
      mode: 'controller',
      sessionId: this.currentSessionId,
      targetDeviceId: this.incomingFromDeviceId
    }
    this.logFn('保存启动信号，等待远程窗口准备就绪: ' + JSON.stringify(this.pendingStartSignal))
  }

  async startControlledConnection() {
    this.logFn('作为被控端建立连接，等待接收Offer...')
    this.isController = false
    // 被控端会等待来自主控端的Offer，无需立即创建PeerConnection
    this.logFn('已准备好接收WebRTC Offer')
  }

  _setupSocketListeners(role) {
    this.socket.on('connect', () => {
      this.logFn('✓ 已连接到信令服务器，Socket ID: ' + this.socket.id)
      this.logFn('正在注册设备 ID: ' + this.myDeviceId)
      this.socket.emit('register', this.myDeviceId)
      if (this.uiManager) {
        this.uiManager.updateServerStatus('已连接', 'connected')
      }
    })

    this.socket.on('disconnect', (reason) => {
      this.logFn('与信令服务器断开连接，原因: ' + reason)
      if (this.uiManager) {
        this.uiManager.updateServerStatus('已断开', 'disconnected')
      }
      if (typeof this.onDisconnected === 'function') {
        this.onDisconnected()
      }
      
      window.electronAPI.sendToRemoteWindow('signaling-disconnected', { reason })
    })

    this.socket.on('connect_error', (error) => {
      this.logFn('✗ 连接错误: ' + (error.message || error))
      if (this.uiManager) {
        this.uiManager.updateServerStatus('连接失败', 'error')
      }
    })

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.logFn('正在尝试重连... (第 ' + attemptNumber + ' 次)')
    })

    this.socket.on('reconnect_failed', () => {
      this.logFn('✗ 重连失败，请检查服务器地址和网络连接')
      if (this.uiManager) {
        this.uiManager.updateServerStatus('重连失败', 'error')
      }
    })

    this.socket.on('incoming-connection', (data) => {
      this.logFn('收到连接请求: ' + JSON.stringify(data))
      this.incomingFromDeviceId = data.fromDeviceId
      this.currentSessionId = data.sessionId
      this.isController = false
      
      if (typeof this.onIncomingConnection === 'function') {
        this.onIncomingConnection(data.fromDeviceId)
      }
    })

    this.socket.on('connection-result', async (data) => {
      this.logFn('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        this.currentSessionId = data.sessionId
        this.incomingFromDeviceId = data.toDeviceId
        await this.startControllerConnection()
      } else {
        alert('对方拒绝了连接请求')
      }
    })

    this.socket.on('offer', async (data) => {
      this.logFn('收到 offer')
      if (this.isController) {
        this.logFn('作为主控端，转发到远程窗口')
        window.electronAPI.sendToRemoteWindow('signaling-offer', data)
      } else {
        this.logFn('作为被控端，直接处理offer')
        await this.handleOffer(data)
      }
    })

    this.socket.on('answer', async (data) => {
      this.logFn('收到 answer')
      if (this.isController) {
        this.logFn('作为主控端，转发到远程窗口')
        window.electronAPI.sendToRemoteWindow('signaling-answer', data)
      } else if (this.peerConnection) {
        this.logFn('作为被控端，直接处理answer')
        await this.handleAnswer(data.answer)
      }
    })

    this.socket.on('ice-candidate', async (data) => {
      this.logFn('收到 ICE candidate')
      if (this.isController) {
        this.logFn('作为主控端，转发到远程窗口')
        window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
      } else {
        this.logFn('作为被控端，直接处理ICE candidate')
        await this.handleIceCandidate(data.candidate)
      }
    })

    window.electronAPI.on('send-signaling-offer', (data) => {
      this.logFn('从远程窗口收到 offer，发送到信令服务器')
      if (this.socket) {
        this.socket.emit('offer', {
          sessionId: data.sessionId || this.currentSessionId,
          offer: data.offer,
          toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
        })
      }
    })

    window.electronAPI.on('send-signaling-answer', (data) => {
      this.logFn('从远程窗口收到 answer，发送到信令服务器')
      if (this.socket) {
        this.socket.emit('answer', {
          sessionId: data.sessionId || this.currentSessionId,
          answer: data.answer,
          toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
        })
      }
    })

    window.electronAPI.on('send-signaling-ice-candidate', (data) => {
      this.logFn('从远程窗口收到 ICE candidate，发送到信令服务器')
      if (this.socket) {
        this.socket.emit('ice-candidate', {
          sessionId: data.sessionId || this.currentSessionId,
          candidate: data.candidate,
          toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
        })
      }
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
      if (data.type === 'input') {
        this.logFn('[信令模式] 收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y)
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'screen-size') {
        this.logFn('[信令模式] 收到屏幕尺寸: ' + data.width + 'x' + data.height)
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
        const candidateData = {
          sessionId: this.currentSessionId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          },
          toDeviceId: this.incomingFromDeviceId
        }
        if (this.socket) {
          this.socket.emit('ice-candidate', candidateData)
        }
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
      this.logFn('[信令模式] 收到数据通道')
      this.dataChannelManager.setDataChannel(event.channel)
    }
    
    this.peerConnection.ontrack = (event) => {
      this.logFn('[信令模式] 收到远程媒体流，track数量: ' + event.tracks.length)
    }
  }

  async handleOffer(data) {
    if (!data.offer) {
      this.logFn('[信令模式] 错误: offer为空')
      return
    }

    this.logFn('[信令模式] 收到offer')

    try {
      await this.createPeerConnection()
      
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

      if (this.socket) {
        this.socket.emit('answer', {
          sessionId: data.sessionId || this.currentSessionId,
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
          toDeviceId: data.fromDeviceId || this.incomingFromDeviceId
        })
      }

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
    if (!candidate) {
      return
    }

    try {
      if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) {
        return
      }

      if (!this.peerConnection || !this.peerConnection.remoteDescription) {
        const MAX_ICE_CANDIDATES = 50
        if (this.pendingIceCandidates.length >= MAX_ICE_CANDIDATES) {
          this.logFn('[信令模式] ICE 候选缓存已满，丢弃最早的候选')
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
        this.logFn('[信令模式] 选择第一个屏幕源: ' + sources[0].name + ', ID: ' + sources[0].id)
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id
            },
            optional: [
              { maxWidth: this.config.screenCapture?.maxWidth || 1920 },
              { maxHeight: this.config.screenCapture?.maxHeight || 1080 },
              { maxFrameRate: this.config.screenCapture?.maxFrameRate || 30 },
              { minFrameRate: this.config.screenCapture?.minFrameRate || 15 }
            ]
          }
        })

        const tracks = stream.getTracks()
        this.logFn('[信令模式] 获取到 ' + tracks.length + ' 个媒体轨道')

        tracks.forEach(track => {
          this.peerConnection.addTrack(track, stream)
          this.logFn('[信令模式] 已添加媒体轨道: ' + track.kind + ', label: ' + track.label)
        })

        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          this.logFn('[信令模式] 屏幕捕获成功，分辨率: ' + (settings.width || '?') + 'x' + (settings.height || '?'))
        }
      } else {
        this.logFn('[信令模式] 没有找到可用的屏幕源')
      }
    } catch (error) {
      this.logFn('[信令模式] 屏幕捕获失败: ' + error.message)
      console.error('[信令模式] 屏幕捕获详细错误:', error)
    }
  }

  reset() {
    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.pendingIceCandidates = []

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

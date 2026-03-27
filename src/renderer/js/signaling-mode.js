class SignalingModeManager {
  constructor(options = {}) {
    this.socket = null
    this.peerConnection = null
    this.dataChannel = null
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
    this.logFn('作为主控端建立连接')
    this.isController = true
    await this._createPeerConnection()
    await this._createOffer()
  }

  async startControlledConnection() {
    this.logFn('作为被控端建立连接')
    this.isController = false
    await this._createPeerConnection()
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
        await this.startControllerConnection()
      } else {
        alert('对方拒绝了连接请求')
      }
    })

    this.socket.on('offer', async (data) => {
      this.logFn('收到 offer')
      await this._handleOffer(data)
    })

    this.socket.on('answer', async (data) => {
      this.logFn('收到 answer')
      await this._handleAnswer(data)
    })

    this.socket.on('ice-candidate', async (data) => {
      this.logFn('收到 ICE candidate')
      await this._handleIceCandidate(data)
    })
  }

  _getIceConfig() {
    if (typeof getIceConfig === 'function') {
      return getIceConfig()
    }
    return {
      iceServers: (this.config.stunServers || []).map(url => ({ urls: url }))
    }
  }

  async _createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this._getIceConfig())

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('ice-candidate', {
          sessionId: this.currentSessionId,
          candidate: event.candidate,
          toDeviceId: this.incomingFromDeviceId
        })
      }
    }

    this.peerConnection.ontrack = (event) => {
      this.logFn('收到远程媒体流')
      const stream = event.streams[0]
      window.remoteStream = stream
      window.electronAPI.openRemoteWindow()

      setTimeout(() => {
        window.electronAPI.sendToRemoteWindow('remote-stream', { hasStream: true })
      }, 500)
    }

    this.peerConnection.onconnectionstatechange = () => {
      this.logFn('连接状态: ' + this.peerConnection.connectionState)
    }

    this.peerConnection.ondatachannel = (event) => {
      this.logFn('收到数据通道')
      this.dataChannel = event.channel
      this._setupDataChannel()
    }

    if (this.isController) {
      this.logFn('创建数据通道（主控端）')
      this.dataChannel = this.peerConnection.createDataChannel('control')
      this._setupDataChannel()
    }
  }

  _setupDataChannel() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = () => {
      this.logFn('数据通道已打开')
    }

    this.dataChannel.onmessage = (event) => {
      this.logFn('收到数据通道消息:', event.data)
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'input') {
          window.electronAPI.send('remote-input', data)
        }
      } catch (e) {
        console.error('解析数据失败:', e)
      }
    }

    this.dataChannel.onclose = () => {
      this.logFn('数据通道已关闭')
    }

    this.dataChannel.onerror = (error) => {
      console.error('数据通道错误:', error)
    }
  }

  async _createOffer() {
    try {
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)

      if (this.socket) {
        this.socket.emit('offer', {
          sessionId: this.currentSessionId,
          offer: offer,
          toDeviceId: this.incomingFromDeviceId
        })
      }
    } catch (error) {
      this.logFn('创建 offer 失败: ' + error.message)
    }
  }

  async _handleOffer(data) {
    this.incomingFromDeviceId = data.fromDeviceId || this.incomingFromDeviceId
    this.currentSessionId = data.sessionId

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))

    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    if (this.socket) {
      this.socket.emit('answer', {
        sessionId: this.currentSessionId,
        answer: answer,
        toDeviceId: this.incomingFromDeviceId
      })
    }
  }

  async _handleAnswer(data) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
  }

  async _handleIceCandidate(data) {
    if (data.candidate && this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
    }
  }

  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data))
      return true
    }
    return false
  }

  reset() {
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
    this.dataChannel = null
    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
  }
}

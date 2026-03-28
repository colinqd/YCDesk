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
    
    this.logFn('已接受连接，打开远程窗口（被控端）')
    window.electronAPI.openRemoteWindow()
    
    setTimeout(() => {
      window.electronAPI.sendToRemoteWindow('signaling-mode-start', {
        mode: 'controlled',
        sessionId: this.currentSessionId,
        targetDeviceId: this.incomingFromDeviceId
      })
    }, 500)
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
    
    setTimeout(() => {
      window.electronAPI.sendToRemoteWindow('signaling-mode-start', {
        mode: 'controller',
        sessionId: this.currentSessionId,
        targetDeviceId: this.incomingFromDeviceId
      })
    }, 500)
  }

  async startControlledConnection() {
    this.logFn('作为被控端建立连接')
    this.isController = false
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
        await this.startControllerConnection()
      } else {
        alert('对方拒绝了连接请求')
      }
    })

    this.socket.on('offer', async (data) => {
      this.logFn('收到 offer，转发到远程窗口')
      window.electronAPI.sendToRemoteWindow('signaling-offer', data)
    })

    this.socket.on('answer', async (data) => {
      this.logFn('收到 answer，转发到远程窗口')
      window.electronAPI.sendToRemoteWindow('signaling-answer', data)
    })

    this.socket.on('ice-candidate', async (data) => {
      this.logFn('收到 ICE candidate，转发到远程窗口')
      window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
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

  reset() {
    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    
    this.logFn('信令模式管理器已重置')
  }
}

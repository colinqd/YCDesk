class SignalingClient {
  constructor(options = {}) {
    this.socket = null
    this.connectionMode = 'websocket'
    this.myDeviceId = ''
    this.logFn = options.log || console.log
    this.onRegistered = options.onRegistered || null
    this.onIncomingConnection = options.onIncomingConnection || null
    this.onConnectionResult = options.onConnectionResult || null
    this.onConnectionFailed = options.onConnectionFailed || null
    this.onOffer = options.onOffer || null
    this.onAnswer = options.onAnswer || null
    this.onIceCandidate = options.onIceCandidate || null
    this.onConnected = options.onConnected || null
    this.onDisconnected = options.onDisconnected || null
    this.onError = options.onError || null

    this.heartbeatTimer = null
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.reconnectDelay = options.reconnectDelay || 1000
  }

  setDeviceId(deviceId) {
    this.myDeviceId = deviceId
  }

  setConnectionMode(mode) {
    this.connectionMode = mode
    this.logFn('连接方式已切换: ' + (mode === 'websocket' ? '原始 WebSocket' : 'Socket.IO'))
  }

  buildWsUrl(serverUrl) {
    let url = serverUrl.trim()
    url = url.replace(/^https:\/\//i, 'wss://')
    url = url.replace(/^http:\/\//i, 'ws://')
    if (!url.match(/^wss?:\/\//i)) {
      url = 'ws://' + url
    }
    return url
  }

  buildHttpUrl(serverUrl) {
    let url = serverUrl.trim()
    url = url.replace(/^wss:\/\//i, 'https://')
    url = url.replace(/^ws:\/\//i, 'http://')
    if (!url.match(/^https?:\/\//i)) {
      url = 'http://' + url
    }
    return url
  }

  connect(serverUrl) {
    if (this.connectionMode === 'websocket') {
      this._connectWebSocket(serverUrl)
    } else {
      this._connectSocketIO(serverUrl)
    }
  }

  _connectWebSocket(serverUrl) {
    const wsUrl = this.buildWsUrl(serverUrl)
    this.logFn('连接信令服务器: ' + wsUrl)

    try {
      if (this.socket) {
        this.socket.close()
      }

      this.socket = new WebSocket(wsUrl)

      this.socket.onopen = () => {
        this.logFn('✓ 已连接到信令服务器')
        this.logFn('正在注册设备 ID: ' + this.myDeviceId)
        this.send('register', { deviceId: this.myDeviceId })
        this._startHeartbeat()
        if (typeof this.onConnected === 'function') this.onConnected()
      }

      this.socket.onclose = (event) => {
        this.logFn('与信令服务器断开连接, code: ' + event.code)
        this._stopHeartbeat()
        if (typeof this.onDisconnected === 'function') this.onDisconnected('close', event.code)
      }

      this.socket.onerror = (error) => {
        this.logFn('✗ 连接错误')
        if (typeof this.onError === 'function') this.onError(error)
      }

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this._handleMessage(data)
        } catch (e) {
          this.logFn('解析消息失败: ' + e.message)
        }
      }
    } catch (error) {
      this.logFn('✗ 连接初始化错误: ' + error.message)
      if (typeof this.onError === 'function') this.onError(error)
    }
  }

  _connectSocketIO(serverUrl) {
    const httpUrl = this.buildHttpUrl(serverUrl)
    this.logFn('连接信令服务器 [Socket.IO]: ' + httpUrl)

    try {
      if (this.socket) {
        this.socket.disconnect()
      }

      this.socket = io(httpUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        timeout: 10000
      })

      this.socket.on('connect', () => {
        this.logFn('✓ 已连接到信令服务器，Socket ID: ' + this.socket.id)
        this.logFn('正在注册设备 ID: ' + this.myDeviceId)
        this.socket.emit('register', { deviceId: this.myDeviceId })
        if (typeof this.onConnected === 'function') this.onConnected()
      })

      this.socket.on('disconnect', (reason) => {
        this.logFn('与信令服务器断开连接，原因: ' + reason)
        if (typeof this.onDisconnected === 'function') this.onDisconnected('socketio', reason)
      })

      this.socket.on('connect_error', (error) => {
        this.logFn('✗ 连接错误: ' + (error.message || error))
        if (typeof this.onError === 'function') this.onError(error)
      })

      this.socket.on('registered', (data) => {
        this._handleMessage({ type: 'registered', ...data })
      })

      this.socket.on('incoming-connection', (data) => {
        this._handleMessage({ type: 'incoming-connection', ...data })
      })

      this.socket.on('connection-result', (data) => {
        this._handleMessage({ type: 'connection-result', ...data })
      })

      this.socket.on('connection-failed', (data) => {
        this._handleMessage({ type: 'connection-failed', ...data })
      })

      this.socket.on('offer', (data) => {
        this._handleMessage({ type: 'offer', ...data })
      })

      this.socket.on('answer', (data) => {
        this._handleMessage({ type: 'answer', ...data })
      })

      this.socket.on('ice-candidate', (data) => {
        this._handleMessage({ type: 'ice-candidate', ...data })
      })
    } catch (error) {
      this.logFn('✗ 连接初始化错误: ' + error.message)
      if (typeof this.onError === 'function') this.onError(error)
    }
  }

  _startHeartbeat() {
    if (this.connectionMode === 'socketio') return
    this._stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() })
      }
    }, 25000)
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  _handleMessage(data) {
    const type = data.type

    switch (type) {
      case 'registered':
        this.logFn('设备注册成功: ' + data.deviceId)
        if (typeof this.onRegistered === 'function') this.onRegistered(data)
        break

      case 'incoming-connection':
        this.logFn('收到连接请求: ' + JSON.stringify(data))
        if (typeof this.onIncomingConnection === 'function') this.onIncomingConnection(data)
        break

      case 'connection-result':
        this.logFn('连接结果: ' + JSON.stringify(data))
        if (typeof this.onConnectionResult === 'function') this.onConnectionResult(data)
        break

      case 'connection-failed':
        this.logFn('连接失败: ' + (data.reason || '未知原因'))
        if (typeof this.onConnectionFailed === 'function') this.onConnectionFailed(data)
        break

      case 'offer':
        this.logFn('收到 offer')
        if (typeof this.onOffer === 'function') this.onOffer(data)
        break

      case 'answer':
        this.logFn('收到 answer')
        if (typeof this.onAnswer === 'function') this.onAnswer(data)
        break

      case 'ice-candidate':
        this.logFn('收到 ICE candidate')
        if (typeof this.onIceCandidate === 'function') this.onIceCandidate(data)
        break

      case 'pong':
        break
    }
  }

  send(type, data) {
    if (this.connectionMode === 'websocket') {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const message = data ? { type: type, ...data } : { type: type }
        this.socket.send(JSON.stringify(message))
      }
    } else {
      if (this.socket && this.socket.connected) {
        this.socket.emit(type, data)
      }
    }
  }

  isConnected() {
    if (this.connectionMode === 'websocket') {
      return this.socket && this.socket.readyState === WebSocket.OPEN
    } else {
      return this.socket && this.socket.connected
    }
  }

  disconnect() {
    this._stopHeartbeat()
    if (this.socket) {
      if (this.connectionMode === 'websocket') {
        this.socket.close()
      } else {
        this.socket.disconnect()
      }
      this.socket = null
      this.logFn('已断开服务器连接')
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignalingClient
}

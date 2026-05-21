class SignalingClient {
  constructor(options = {}) {
    this.socket = null
    this.connectionMode = 'auto'
    this.negotiatedMode = null
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
    this.onReconnecting = options.onReconnecting || null
    this.onError = options.onError || null

    this.config = options.config || {}

    this.heartbeatTimer = null
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.reconnectDelay = options.reconnectDelay || 1000
    this.autoReconnect = options.autoReconnect !== undefined ? options.autoReconnect : true

    this._autoSettled = false
    this._autoTimer = null
    this._autoServerUrl = ''
    this._registerTimer = null

    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._manualDisconnect = false
    this._reconnectServerUrl = ''
  }

  setDeviceId(deviceId) {
    this.myDeviceId = deviceId
  }

  setConnectionMode(mode) {
    this.connectionMode = mode
    this.negotiatedMode = null
    if (mode === 'auto') {
      this.logFn('连接方式已切换: 自动检测')
    } else if (mode === 'websocket') {
      this.logFn('连接方式已切换: 原始 WebSocket')
    } else {
      this.logFn('连接方式已切换: Socket.IO')
    }
  }

  getNegotiatedMode() {
    return this.negotiatedMode || this.connectionMode
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
    if (this.connectionMode === 'auto') {
      this._connectAuto(serverUrl)
    } else if (this.connectionMode === 'websocket') {
      this._connectWebSocket(serverUrl)
    } else {
      this._connectSocketIO(serverUrl)
    }
  }

  _connectAuto(serverUrl) {
    this.logFn('自动检测服务器协议...')
    this._autoSettled = false
    this._autoServerUrl = serverUrl

    this._autoTimer = setTimeout(() => {
      if (!this._autoSettled) {
        this._autoSettled = true
        this._cleanupSocketIO()
        this.logFn('Socket.IO 超时，切换到原始 WebSocket')
        this.connectionMode = 'websocket'
        this.negotiatedMode = 'websocket'
        this._connectWebSocket(serverUrl)
      }
    }, 2500)

    this.connectionMode = 'socketio'
    this._connectSocketIO(serverUrl)
  }

  _cleanupSocketIO() {
    if (this.socket && typeof this.socket.disconnect === 'function') {
      try {
        this.socket.removeAllListeners()
        this.socket.disconnect()
      } catch (e) { this.logFn && this.logFn('清理 Socket.IO 连接时出错: ' + (e.message || e), 'debug') }
    }
    this.socket = null
  }

  _connectWebSocket(serverUrl) {
    const wsUrl = this.buildWsUrl(serverUrl)
    this._reconnectServerUrl = serverUrl
    this.logFn('连接信令服务器 [WebSocket]: ' + wsUrl)

    try {
      if (this.socket) {
        try { this.socket.close() } catch (e) { this.logFn && this.logFn('关闭 WebSocket 时出错: ' + (e.message || e), 'debug') }
      }

      this.socket = new WebSocket(wsUrl)

      this.socket.onopen = () => {
        this.logFn('✓ 已连接到信令服务器')
        this._reconnectAttempts = 0
        this.logFn('正在注册设备 ID: ' + this.myDeviceId)
        this.send('register', { deviceId: this.myDeviceId })
        this._startHeartbeat()
        this._startRegisterTimeout()
        if (typeof this.onConnected === 'function') this.onConnected()
      }

      this.socket.onclose = (event) => {
        this.logFn('与信令服务器断开连接, code: ' + event.code)
        this._stopHeartbeat()
        this._cancelReconnect()

        if (typeof this.onDisconnected === 'function') this.onDisconnected('close', event.code)

        if (!this._manualDisconnect && this.autoReconnect) {
          this._scheduleReconnect()
        }
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

      const authToken = this.config?.authToken || this.config?.token || null

      this.socket = io(httpUrl, {
        auth: authToken ? { token: authToken } : {},
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        timeout: 10000
      })

      this.socket.on('connect', () => {
        if (this._autoTimer && !this._autoSettled) {
          this._autoSettled = true
          clearTimeout(this._autoTimer)
          this._autoTimer = null
          this.negotiatedMode = 'socketio'
          this.logFn('✓ 协议协商成功: Socket.IO')
        }
        this.logFn('✓ 已连接到信令服务器，Socket ID: ' + this.socket.id)
        this.logFn('正在注册设备 ID: ' + this.myDeviceId)
        this.socket.emit('register', { deviceId: this.myDeviceId })
        this._startRegisterTimeout()
        if (typeof this.onConnected === 'function') this.onConnected()
      })

      this.socket.on('disconnect', (reason) => {
        if (this._autoTimer && !this._autoSettled) return
        this.logFn('与信令服务器断开连接，原因: ' + reason)
        if (typeof this.onDisconnected === 'function') this.onDisconnected('socketio', reason)
      })

      this.socket.on('connect_error', (error) => {
        if (this._autoTimer && !this._autoSettled) {
          this._autoSettled = true
          clearTimeout(this._autoTimer)
          this._autoTimer = null
          this._cleanupSocketIO()
          this.logFn('Socket.IO 连接失败 (' + (error.message || 'unknown') + ')，切换到原始 WebSocket')
          this.connectionMode = 'websocket'
          this.negotiatedMode = 'websocket'
          this._connectWebSocket(this._autoServerUrl)
          return
        }
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
      if (this._autoTimer && !this._autoSettled) {
        this._autoSettled = true
        clearTimeout(this._autoTimer)
        this._autoTimer = null
        this.logFn('Socket.IO 初始化失败，切换到原始 WebSocket')
        this.connectionMode = 'websocket'
        this.negotiatedMode = 'websocket'
        this._connectWebSocket(this._autoServerUrl)
        return
      }
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
    }, 15000)
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      this.logFn('重连次数已达上限(' + this.maxReconnectAttempts + '次)，停止重连')
      return
    }

    this._reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this._reconnectAttempts - 1), 30000)
    this.logFn('将在 ' + (delay / 1000).toFixed(1) + ' 秒后尝试第 ' + this._reconnectAttempts + ' 次重连...')

    if (typeof this.onReconnecting === 'function') {
      this.onReconnecting({
        attempt: this._reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delay: delay
      })
    }

    this._reconnectTimer = setTimeout(() => {
      this._connectWebSocket(this._reconnectServerUrl)
    }, delay)
  }

  _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  _startRegisterTimeout() {
    this._stopRegisterTimeout()
    this._registerTimer = setTimeout(() => {
      this.logFn('⚠ 设备注册超时 (5s) — 请确认服务器版本是否正确')
    }, 5000)
  }

  _stopRegisterTimeout() {
    if (this._registerTimer) {
      clearTimeout(this._registerTimer)
      this._registerTimer = null
    }
  }

  _handleMessage(data) {
    const type = data.type

    switch (type) {
      case 'registered':
        this._stopRegisterTimeout()
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
    this._manualDisconnect = true
    this._stopHeartbeat()
    this._cancelReconnect()
    this._autoSettled = true
    if (this._autoTimer) {
      clearTimeout(this._autoTimer)
      this._autoTimer = null
    }
    if (this.socket) {
      if (this.connectionMode === 'websocket') {
        this.socket.close()
      } else {
        this.socket.disconnect()
      }
      this.socket = null
      this.logFn('已断开服务器连接')
    }
    this._manualDisconnect = false
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignalingClient
}
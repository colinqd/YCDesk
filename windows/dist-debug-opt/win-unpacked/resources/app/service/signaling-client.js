/**
 * YCDesk 服务端信令客户端
 * 轻量级实现，仅支持信令注册和连接等待
 */

const { io } = require('socket.io-client')

class ServiceSignalingClient {
  constructor(options = {}) {
    this.deviceId = options.deviceId || ''
    this.serverUrl = options.serverUrl || ''
    this.logger = options.logger || console
    this.socket = null
    this.isConnected = false
    this.heartbeatTimer = null

    // 回调
    this.onIncomingConnection = options.onIncomingConnection || null
    this.onConnected = options.onConnected || null
    this.onDisconnected = options.onDisconnected || null
  }

  /**
   * 连接信令服务器
   */
  async connect(serverUrl) {
    if (serverUrl) this.serverUrl = serverUrl
    if (!this.serverUrl) {
      this.logger.error('未指定信令服务器地址')
      return false
    }

    // 构建 HTTP URL（Socket.IO 需要）
    let httpUrl = this.serverUrl.trim()
    httpUrl = httpUrl.replace(/^wss:\/\//i, 'https://')
    httpUrl = httpUrl.replace(/^ws:\/\//i, 'http://')
    if (!httpUrl.match(/^https?:\/\//i)) {
      httpUrl = 'http://' + httpUrl
    }

    this.logger.info('连接信令服务器: ' + httpUrl)

    return new Promise((resolve) => {
      try {
        this.socket = io(httpUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 2000,
          timeout: 10000
        })

        this.socket.on('connect', () => {
          this.isConnected = true
          this.logger.info('已连接到信令服务器')
          this._register()
          this._startHeartbeat()
          if (this.onConnected) this.onConnected()
          resolve(true)
        })

        this.socket.on('disconnect', (reason) => {
          this.isConnected = false
          this._stopHeartbeat()
          this.logger.warn('与信令服务器断开: ' + reason)
          if (this.onDisconnected) this.onDisconnected(reason)
        })

        this.socket.on('connect_error', (err) => {
          this.logger.error('连接错误: ' + err.message)
          resolve(false)
        })

        // 监听连接请求
        this.socket.on('connect-request', (data) => {
          this.logger.info('收到连接请求: ' + JSON.stringify(data))
          if (this.onIncomingConnection) {
            this.onIncomingConnection(data.fromDeviceId || data.deviceId)
          }
        })

        this.socket.on('incoming-connection', (data) => {
          this.logger.info('收到入站连接: ' + JSON.stringify(data))
          if (this.onIncomingConnection) {
            this.onIncomingConnection(data.fromDeviceId || data.deviceId)
          }
        })

      } catch (e) {
        this.logger.error('连接初始化失败: ' + e.message)
        resolve(false)
      }
    })
  }

  /**
   * 注册设备
   */
  _register() {
    if (!this.socket || !this.isConnected) return
    this.logger.info('注册设备 ID: ' + this.deviceId)
    this.socket.emit('register', { deviceId: this.deviceId })
  }

  /**
   * 心跳
   */
  _startHeartbeat() {
    this._stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('ping')
      }
    }, 5000)
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this._stopHeartbeat()
    if (this.socket) {
      try {
        this.socket.removeAllListeners()
        this.socket.disconnect()
      } catch (e) {}
      this.socket = null
    }
    this.isConnected = false
    this.logger.info('信令客户端已断开')
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      connected: this.isConnected,
      deviceId: this.deviceId,
      serverUrl: this.serverUrl
    }
  }
}

module.exports = ServiceSignalingClient

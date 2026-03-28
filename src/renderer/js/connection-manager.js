const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
}

class ConnectionManager {
  constructor(options = {}) {
    this.status = CONNECTION_STATUS.DISCONNECTED
    this.heartbeatInterval = null
    this.reconnectAttempts = 0
    this.reconnectTimeout = null
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.baseReconnectDelay = options.baseReconnectDelay || 1000
    this.maxReconnectDelay = options.maxReconnectDelay || 30000 // 最大延迟 30 秒
    this.reconnectWindow = options.reconnectWindow || 300000 // 重连时间窗口 5 分钟
    this.reconnectStartTime = null
    this.heartbeatIntervalMs = options.heartbeatInterval || 5000
    this.logFn = options.log || console.log
    this.onStatusChange = options.onStatusChange || null
    this.savedConnectionInfo = null
    this.savedRole = null
    this.savedServerUrl = null
  }

  setStatus(status) {
    this.status = status
    this.logFn(`连接状态变更: ${status}`)
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status)
    }
  }

  startHeartbeat(sendFn, clientId) {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (clientId) {
        sendFn(clientId, { type: 'heartbeat' })
      }
    }, this.heartbeatIntervalMs)
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  saveConnectionInfo(type, data) {
    this.savedConnectionInfo = { type, ...data }
  }

  clearConnectionInfo() {
    this.savedConnectionInfo = null
  }

  saveRoleAndServer(role, serverUrl) {
    this.savedRole = role
    this.savedServerUrl = serverUrl
  }

  async attemptReconnect(reconnectFn, networkManager = null) {
    // 记录重连开始时间
    if (!this.reconnectStartTime) {
      this.reconnectStartTime = Date.now()
    }
    
    // 检查是否超过重连时间窗口
    const elapsed = Date.now() - this.reconnectStartTime
    if (elapsed > this.reconnectWindow) {
      this.logFn('重连时间窗口已过期，停止重连')
      this.reconnectAttempts = 0
      this.reconnectStartTime = null
      this.setStatus(CONNECTION_STATUS.ERROR)
      return false
    }
    
    // 检查重连次数
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logFn('重连次数已达上限，停止重连')
      this.reconnectAttempts = 0
      this.reconnectStartTime = null
      this.setStatus(CONNECTION_STATUS.ERROR)
      return false
    }

    if (networkManager && !networkManager.isOnline()) {
      this.logFn('网络离线，等待网络恢复...')
      return false
    }

    this.reconnectAttempts++
    // 计算延迟时间，使用指数退避但有上限
    let delay
    if (networkManager) {
      delay = networkManager.calculateReconnectDelay(this.reconnectAttempts, this.baseReconnectDelay)
    } else {
      delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    }
    // 限制最大延迟
    delay = Math.min(delay, this.maxReconnectDelay)
    // 添加 jitter 防止同时重连
    const jitter = delay * 0.1 * Math.random()
    delay = delay + jitter

    this.logFn(`将在 ${Math.round(delay / 1000)} 秒后尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.cancelReconnect()

    this.reconnectTimeout = setTimeout(async () => {
      try {
        this.setStatus(CONNECTION_STATUS.CONNECTING)
        await reconnectFn()
        // 重连成功，重置时间窗口
        this.reconnectStartTime = null
      } catch (error) {
        this.logFn('重连失败：' + error.message)
        await this.attemptReconnect(reconnectFn, networkManager)
      }
    }, delay)

    return true
  }

  cancelReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    this.reconnectAttempts = 0
    this.reconnectStartTime = null
  }

  reset() {
    this.stopHeartbeat()
    this.cancelReconnect()
    this.setStatus(CONNECTION_STATUS.DISCONNECTED)
    this.savedConnectionInfo = null
  }

  isConnected() {
    return this.status === CONNECTION_STATUS.CONNECTED
  }

  isConnecting() {
    return this.status === CONNECTION_STATUS.CONNECTING
  }
}

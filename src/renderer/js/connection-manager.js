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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logFn('重连次数已达上限，停止重连')
      this.reconnectAttempts = 0
      this.setStatus(CONNECTION_STATUS.ERROR)
      return false
    }

    if (networkManager && !networkManager.isOnline()) {
      this.logFn('网络离线，等待网络恢复...')
      return false
    }

    this.reconnectAttempts++
    const delay = networkManager
      ? networkManager.calculateReconnectDelay(this.reconnectAttempts, this.baseReconnectDelay)
      : this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts)

    this.logFn(`将在 ${Math.round(delay / 1000)} 秒后尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.cancelReconnect()

    this.reconnectTimeout = setTimeout(async () => {
      try {
        this.setStatus(CONNECTION_STATUS.CONNECTING)
        await reconnectFn()
      } catch (error) {
        this.logFn('重连失败: ' + error.message)
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

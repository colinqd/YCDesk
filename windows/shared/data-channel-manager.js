const DATA_CHANNEL_STATE = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSING: 'closing',
  CLOSED: 'closed'
}

class DataChannelManager {
  constructor(options = {}) {
    this.dataChannel = null
    this.messageQueue = []
    this.messageIdCounter = 0
    this.pendingMessages = new Map()
    this.options = {
      maxRetries: 3,
      retryInterval: 1000,
      maxQueueSize: 100,
      ...options
    }
    this.callbacks = {
      onOpen: null,
      onClose: null,
      onError: null,
      onMessage: null,
      onBufferedAmountLow: null
    }
    this.isReconnecting = false
    this.logger = options.logger || console
  }

  setDataChannel(channel) {
    if (this.dataChannel) {
      this.removeEventListeners()
    }

    this.dataChannel = channel
    this.addEventListeners()
    
    // 如果新通道已经是 open 状态，直接刷新队列
    if (channel.readyState === 'open') {
      this.flushQueue()
    }
  }

  addEventListeners() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = this.handleOpen.bind(this)
    this.dataChannel.onclose = this.handleClose.bind(this)
    this.dataChannel.onerror = this.handleError.bind(this)
    this.dataChannel.onmessage = this.handleMessage.bind(this)
    this.dataChannel.onbufferedamountlow = this.handleBufferedAmountLow.bind(this)
  }

  removeEventListeners() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = null
    this.dataChannel.onclose = null
    this.dataChannel.onerror = null
    this.dataChannel.onmessage = null
    this.dataChannel.onbufferedamountlow = null
  }

  handleOpen() {
    this.logger.log('[DataChannel] 数据通道已打开')
    this.isReconnecting = false
    this.flushQueue()
    
    if (this.callbacks.onOpen) {
      this.callbacks.onOpen()
    }
  }

  handleClose() {
    this.logger.log('[DataChannel] 数据通道已关闭')
    
    if (this.callbacks.onClose) {
      this.callbacks.onClose()
    }
  }

  handleError(error) {
    this.logger.error('[DataChannel] 数据通道错误:', error)
    
    if (this.callbacks.onError) {
      this.callbacks.onError(error)
    }
  }

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data)
      
      if (data.ack && this.pendingMessages.has(data.ackId)) {
        const entry = this.pendingMessages.get(data.ackId)
        clearTimeout(entry.timer)
        this.pendingMessages.delete(data.ackId)
        return
      }
      
      if (data.id) {
        this.sendAck(data.id)
      }
      
      if (this.callbacks.onMessage) {
        this.callbacks.onMessage(data)
      }
    } catch (e) {
      this.logger.error('[DataChannel] 解析消息失败:', e)
    }
  }

  handleBufferedAmountLow() {
    if (this.callbacks.onBufferedAmountLow) {
      this.callbacks.onBufferedAmountLow()
    }
    this.flushQueue()
  }

  send(data, requireAck = false) {
    const message = {
      ...data,
      id: requireAck ? ++this.messageIdCounter : undefined,
      timestamp: Date.now()
    }

    if (this.messageIdCounter > 9007199254740990) {
      this.messageIdCounter = 0
    }
    
    if (!this.isOpen()) {
      this.enqueue(message, requireAck)
      return false
    }

    return this.sendRaw(message, requireAck)
  }

  sendRaw(message, requireAck) {
    try {
      const json = JSON.stringify(message)
      
      if (this.dataChannel.bufferedAmount > 1024 * 1024) {
        this.enqueue(message, requireAck)
        return false
      }

      this.dataChannel.send(json)
      
      if (requireAck && message.id) {
        this.trackPendingMessage(message)
      }
      
      return true
    } catch (e) {
      this.enqueue(message, requireAck)
      return false
    }
  }

  sendAck(messageId) {
    this.send({ ack: true, ackId: messageId }, false)
  }

  trackPendingMessage(message) {
    const entry = {
      message,
      timer: null,
      retryCount: 0
    }
    entry.timer = setTimeout(() => {
      this.retryMessage(message.id)
    }, this.options.retryInterval)
    this.pendingMessages.set(message.id, entry)
  }

  retryMessage(messageId) {
    const entry = this.pendingMessages.get(messageId)
    if (!entry) return

    const newRetryCount = entry.retryCount + 1
    if (newRetryCount > this.options.maxRetries) {
      this.logger.error('[DataChannel] 消息重发失败，放弃:', messageId)
      clearTimeout(entry.timer)
      this.pendingMessages.delete(messageId)
      return
    }

    if (!this.isOpen()) {
      this.logger.log('[DataChannel] 通道关闭，停止重发')
      clearTimeout(entry.timer)
      this.pendingMessages.delete(messageId)
      return
    }

    entry.retryCount = newRetryCount

    try {
      const json = JSON.stringify(entry.message)
      if (this.dataChannel.bufferedAmount > 1024 * 1024) {
        entry.timer = setTimeout(() => {
          this.retryMessage(messageId)
        }, this.options.retryInterval)
        return
      }
      this.dataChannel.send(json)
      entry.timer = setTimeout(() => {
        this.retryMessage(messageId)
      }, this.options.retryInterval)
    } catch (e) {
      this.logger.error('[DataChannel] 重发失败:', e.message)
      clearTimeout(entry.timer)
      this.pendingMessages.delete(messageId)
    }
  }

  enqueue(message, requireAck) {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      this.logger.warn('[DataChannel] 队列已满，丢弃最早的消息')
      this.messageQueue.shift()
    }
    this.messageQueue.push({ message, requireAck })
  }

  flushQueue() {
    if (!this.isOpen() || this.messageQueue.length === 0) {
      return
    }
    
    while (this.messageQueue.length > 0 && this.isOpen()) {
      const { message, requireAck } = this.messageQueue[0]
      if (this.sendRaw(message, requireAck)) {
        this.messageQueue.shift()
      } else {
        break
      }
    }
  }

  isOpen() {
    return this.dataChannel && this.dataChannel.readyState === 'open'
  }

  getReadyState() {
    return this.dataChannel ? this.dataChannel.readyState : 'closed'
  }

  getBufferedAmount() {
    return this.dataChannel ? this.dataChannel.bufferedAmount : 0
  }

  setOnOpen(callback) {
    this.callbacks.onOpen = callback
  }

  setOnClose(callback) {
    this.callbacks.onClose = callback
  }

  setOnError(callback) {
    this.callbacks.onError = callback
  }

  setOnMessage(callback) {
    this.callbacks.onMessage = callback
  }

  setOnBufferedAmountLow(callback) {
    this.callbacks.onBufferedAmountLow = callback
  }

  close() {
    this.messageQueue = []
    this.pendingMessages.forEach(({ timer }) => {
      clearTimeout(timer)
    })
    this.pendingMessages.clear()
    
    if (this.dataChannel) {
      this.removeEventListeners()
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.callbacks.onClose) {
      this.callbacks.onClose()
    }
  }

  reset() {
    this.close()
    this.messageIdCounter = 0
  }
  
  /**
   * 销毁管理器，清理所有资源
   */
  destroy() {
    this.close()
    this.callbacks = {}
    this.options = null
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DataChannelManager,
    DATA_CHANNEL_STATE
  }
} else {
  window.DataChannelManager = DataChannelManager
  window.DATA_CHANNEL_STATE = DATA_CHANNEL_STATE
}

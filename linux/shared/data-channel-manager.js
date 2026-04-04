class DataChannelManager {
  constructor(options = {}) {
    this.dataChannel = null
    this.logger = options.logger || { log: console.log, error: console.error }
    this.onOpenCallback = null
    this.onMessageCallback = null
    this.onCloseCallback = null
    this.onErrorCallback = null
    this.messageQueue = []
  }

  setDataChannel(channel) {
    this.dataChannel = channel
    this.logger.log('[DataChannelManager] 设置数据通道')
    
    this.dataChannel.onopen = () => {
      this.logger.log('[DataChannelManager] 数据通道已打开')
      if (this.onOpenCallback) {
        this.onOpenCallback()
      }
      
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()
        this.send(msg)
      }
    }

    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.logger.log('[DataChannelManager] 收到消息:', data.type)
        if (this.onMessageCallback) {
          this.onMessageCallback(data)
        }
      } catch (error) {
        this.logger.error('[DataChannelManager] 解析消息失败:', error)
      }
    }

    this.dataChannel.onclose = () => {
      this.logger.log('[DataChannelManager] 数据通道已关闭')
      if (this.onCloseCallback) {
        this.onCloseCallback()
      }
    }

    this.dataChannel.onerror = (error) => {
      this.logger.error('[DataChannelManager] 数据通道错误:', error)
      if (this.onErrorCallback) {
        this.onErrorCallback(error)
      }
    }
  }

  isOpen() {
    return this.dataChannel && this.dataChannel.readyState === 'open'
  }

  send(data, queueIfClosed = true) {
    if (this.isOpen()) {
      try {
        this.dataChannel.send(JSON.stringify(data))
        return true
      } catch (error) {
        this.logger.error('[DataChannelManager] 发送消息失败:', error)
        return false
      }
    } else if (queueIfClosed) {
      this.messageQueue.push(data)
      this.logger.log('[DataChannelManager] 消息已加入队列（等待通道打开）')
      return true
    }
    return false
  }

  setOnOpen(callback) {
    this.onOpenCallback = callback
  }

  setOnMessage(callback) {
    this.onMessageCallback = callback
  }

  setOnClose(callback) {
    this.onCloseCallback = callback
  }

  setOnError(callback) {
    this.onErrorCallback = callback
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    this.messageQueue = []
  }
}

if (typeof window !== 'undefined') {
  window.DataChannelManager = DataChannelManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataChannelManager;
}

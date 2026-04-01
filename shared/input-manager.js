/**
 * YCDesk 输入管理器
 * 
 * 提供输入事件节流、队列管理等功能
 * 用于优化高频输入事件的处理
 */

class InputManager {
  /**
   * 创建输入管理器实例
   * 
   * @param {Object} options - 配置选项
   * @param {number} [options.throttleMs=8] - 节流时间（毫秒）
   * @param {number} [options.queueMaxSize=100] - 队列最大容量
   * @param {Function} [options.logFn=console.log] - 日志函数
   */
  constructor(options = {}) {
    this.throttleMs = options.throttleMs || 8
    this.queueMaxSize = options.queueMaxSize || 100
    this.logFn = options.logFn || console.log
    
    this.lastInputTime = 0
    this.inputQueue = []
    this.isProcessing = false
    this.pendingMouseMove = null
    
    this.statistics = {
      totalReceived: 0,
      totalSent: 0,
      throttled: 0,
      queued: 0,
      dropped: 0
    }
  }

  /**
   * 检查是否应该节流输入
   * 
   * @param {string} inputType - 输入类型
   * @returns {boolean} 是否应该节流
   */
  shouldThrottle(inputType) {
    const now = Date.now()
    const shouldThrottle = inputType === 'mousemove' && 
                          (now - this.lastInputTime < this.throttleMs)
    
    if (shouldThrottle) {
      this.statistics.throttled++
    }
    
    return shouldThrottle
  }

  /**
   * 节流处理输入
   * 
   * @param {string} inputType - 输入类型
   * @param {Object} inputData - 输入数据
   * @param {Function} sendFn - 发送函数
   * @returns {boolean} 是否发送了输入
   */
  throttleInput(inputType, inputData, sendFn) {
    this.statistics.totalReceived++
    
    if (this.shouldThrottle(inputType)) {
      this.pendingMouseMove = inputData
      return false
    }
    
    this.lastInputTime = Date.now()
    this.statistics.totalSent++
    
    if (this.pendingMouseMove && inputType !== 'mousemove') {
      sendFn(this.pendingMouseMove)
      this.pendingMouseMove = null
    }
    
    sendFn(inputData)
    return true
  }

  /**
   * 刷新待处理的鼠标移动事件
   * 
   * @param {Function} sendFn - 发送函数
   */
  flushPendingMouseMove(sendFn) {
    if (this.pendingMouseMove) {
      sendFn(this.pendingMouseMove)
      this.pendingMouseMove = null
      this.statistics.totalSent++
    }
  }

  /**
   * 添加输入到队列
   * 
   * @param {Object} inputData - 输入数据
   * @returns {boolean} 是否成功添加到队列
   */
  enqueue(inputData) {
    if (this.inputQueue.length >= this.queueMaxSize) {
      this.statistics.dropped++
      this.logFn('[InputManager] 队列已满，丢弃输入:', inputData.inputType)
      return false
    }
    
    this.inputQueue.push(inputData)
    this.statistics.queued++
    return true
  }

  /**
   * 从队列中获取输入
   * 
   * @returns {Object|null} 输入数据或 null
   */
  dequeue() {
    if (this.inputQueue.length === 0) {
      return null
    }
    return this.inputQueue.shift()
  }

  /**
   * 处理队列中的输入
   * 
   * @param {Function} processFn - 处理函数
   */
  async processQueue(processFn) {
    if (this.isProcessing) {
      return
    }
    
    this.isProcessing = true
    
    try {
      let inputData = this.dequeue()
      while (inputData) {
        await processFn(inputData)
        inputData = this.dequeue()
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * 清空队列
   */
  clearQueue() {
    const clearedCount = this.inputQueue.length
    this.inputQueue = []
    this.pendingMouseMove = null
    
    if (clearedCount > 0) {
      this.logFn('[InputManager] 清空队列，清除了 ' + clearedCount + ' 个输入')
    }
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStatistics() {
    return {
      ...this.statistics,
      queueSize: this.inputQueue.length
    }
  }

  /**
   * 重置统计信息
   */
  resetStatistics() {
    this.statistics = {
      totalReceived: 0,
      totalSent: 0,
      throttled: 0,
      queued: 0,
      dropped: 0
    }
  }

  /**
   * 重置管理器状态
   */
  reset() {
    this.clearQueue()
    this.resetStatistics()
    this.lastInputTime = 0
    this.isProcessing = false
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputManager
} else {
  window.InputManager = InputManager
}

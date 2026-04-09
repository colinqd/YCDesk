/**
 * YCDesk 历史记录管理器
 * 管理直连和信令服务器的连接历史
 */
class HistoryManager {
  constructor(options = {}) {
    this.storageKeys = options.storageKeys || {
      directHistory: 'ycdesk_direct_history',
      signalingHistory: 'ycdesk_signaling_history'
    }
    this.maxItems = options.maxItems || 10
    this.log = options.log || console.log.bind(console)
  }

  /**
   * 加载历史记录
   * @param {string} type - 历史类型 ('direct' 或 'signaling')
   * @returns {Array} 历史记录数组
   */
  loadHistory(type) {
    try {
      const key = type === 'direct' ? this.storageKeys.directHistory : this.storageKeys.signalingHistory
      const history = JSON.parse(localStorage.getItem(key) || '[]')
      return history
    } catch (error) {
      this.log('加载历史记录失败:', error)
      return []
    }
  }

  /**
   * 获取指定索引的历史记录
   * @param {string} type - 历史类型
   * @param {number} index - 索引
   * @returns {Object|null} 历史记录项
   */
  getHistoryItem(type, index) {
    const history = this.loadHistory(type)
    return history[index] || null
  }

  /**
   * 保存到历史记录
   * @param {string} type - 历史类型
   * @param {Object} data - 要保存的数据
   */
  saveToHistory(type, data) {
    try {
      const key = type === 'direct' ? this.storageKeys.directHistory : this.storageKeys.signalingHistory
      let history = this.loadHistory(type)
      
      // 检查是否已存在相同项
      const existingIndex = history.findIndex(item => {
        if (type === 'direct') {
          return item.ip === data.ip && item.port === data.port
        } else {
          return item.deviceId === data.deviceId && item.serverUrl === data.serverUrl
        }
      })
      
      if (existingIndex !== -1) {
        history.splice(existingIndex, 1)
      }
      
      // 添加到最前面
      history.unshift({
        ...data,
        timestamp: Date.now()
      })
      
      // 限制数量
      history = history.slice(0, this.maxItems)
      localStorage.setItem(key, JSON.stringify(history))
      
      this.log(`历史记录已保存 [${type}]`, data)
    } catch (error) {
      this.log('保存历史记录失败:', error)
    }
  }

  /**
   * 删除历史记录
   * @param {string} type - 历史类型
   * @param {number} index - 要删除的索引
   */
  deleteFromHistory(type, index) {
    try {
      const key = type === 'direct' ? this.storageKeys.directHistory : this.storageKeys.signalingHistory
      let history = this.loadHistory(type)
      history.splice(index, 1)
      localStorage.setItem(key, JSON.stringify(history))
      this.log(`历史记录已删除 [${type}], 索引: ${index}`)
    } catch (error) {
      this.log('删除历史记录失败:', error)
    }
  }
}

window.HistoryManager = HistoryManager

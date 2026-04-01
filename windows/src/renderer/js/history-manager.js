class HistoryManager {
  constructor(options = {}) {
    this.storageKeys = options.storageKeys || {
      direct: 'ycdesk_direct_history',
      signaling: 'ycdesk_signaling_history'
    }
    this.maxItems = options.maxItems || 10
    this.logFn = options.log || console.log
  }

  saveToHistory(type, data) {
    try {
      const key = this._getStorageKey(type)
      let history = this._loadHistory(key)

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

      history.unshift({
        ...data,
        timestamp: Date.now()
      })

      history = history.slice(0, this.maxItems)
      localStorage.setItem(key, JSON.stringify(history))

      return history
    } catch (error) {
      this.logFn('保存历史记录失败:', error)
      return null
    }
  }

  loadHistory(type) {
    try {
      const key = this._getStorageKey(type)
      return this._loadHistory(key)
    } catch (error) {
      this.logFn('加载历史记录失败:', error)
      return []
    }
  }

  deleteFromHistory(type, index) {
    try {
      const key = this._getStorageKey(type)
      let history = this._loadHistory(key)
      history.splice(index, 1)
      localStorage.setItem(key, JSON.stringify(history))
      return history
    } catch (error) {
      this.logFn('删除历史记录失败:', error)
      return null
    }
  }

  renderHistory(type, renderFn) {
    const history = this.loadHistory(type)
    if (typeof renderFn === 'function') {
      renderFn(history)
    }
    return history
  }

  getHistoryItem(type, index) {
    const history = this.loadHistory(type)
    return history[index] || null
  }

  _getStorageKey(type) {
    return this.storageKeys[type] || this.storageKeys.direct
  }

  _loadHistory(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]')
    } catch {
      return []
    }
  }
}

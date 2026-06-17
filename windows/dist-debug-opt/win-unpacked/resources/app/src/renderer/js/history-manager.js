class HistoryManager {
  constructor(options = {}) {
    this.storageKeys = options.storageKeys || {
      direct: 'ycdesk_direct_history',
      signaling: 'ycdesk_signaling_history',
      signalingServers: 'ycdesk_signaling_servers'
    }
    this.maxItems = options.maxItems || 10
    this.logFn = options.log || console.log
    this._serversCache = null
    this._serversInitialized = false
  }

  /**
   * 初始化信令服务器列表（异步从主进程加载，带 localStorage 迁移）
   */
  async initServers() {
    if (this._serversInitialized) return

    try {
      if (window.electronAPI && window.electronAPI.getSignalingServers) {
        const result = await window.electronAPI.getSignalingServers()
        if (result && result.success && result.servers && result.servers.length > 0) {
          this._serversCache = result.servers
          this.logFn('从主进程加载信令服务器: ' + result.servers.length + ' 个')
        } else {
          // 主进程无数据，尝试从 localStorage 迁移旧数据
          this._serversCache = this._loadServersFromLocalStorage()
          if (this._serversCache.length > 0) {
            this.logFn('从 localStorage 迁移信令服务器: ' + this._serversCache.length + ' 个')
            await this._saveServersToIPC(this._serversCache)
            // 迁移后清除 localStorage 中的旧数据
            try { localStorage.removeItem(this.storageKeys.signalingServers) } catch (e) {}
          } else {
            this._serversCache = []
          }
        }
      } else {
        // preload API 不可用，回退到 localStorage
        this._serversCache = this._loadServersFromLocalStorage()
      }
    } catch (e) {
      this.logFn('初始化信令服务器列表失败: ' + (e.message || e))
      this._serversCache = this._loadServersFromLocalStorage()
    }

    this._serversInitialized = true
  }

  _loadServersFromLocalStorage() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKeys.signalingServers) || '[]')
    } catch {
      return []
    }
  }

  async _saveServersToIPC(servers) {
    try {
      if (window.electronAPI && window.electronAPI.saveSignalingServers) {
        await window.electronAPI.saveSignalingServers(servers)
      }
    } catch (e) {
      this.logFn('保存信令服务器到主进程失败: ' + (e.message || e))
    }
  }

  async _ensureServersLoaded() {
    if (!this._serversInitialized) {
      await this.initServers()
    }
    if (!this._serversCache || this._serversCache.length === 0) {
      try {
        if (window.electronAPI && window.electronAPI.getSignalingServers) {
          const result = await window.electronAPI.getSignalingServers()
          if (result && result.success && result.servers) {
            this._serversCache = result.servers
            this.logFn('_ensureServersLoaded: 从主进程重新加载 ' + this._serversCache.length + ' 个服务器')
          }
        }
      } catch (e) {
        this.logFn('_ensureServersLoaded 失败: ' + (e.message || e))
      }
    }
  }

  getServers() {
    return this._serversCache || this._loadServersFromLocalStorage()
  }

  async saveServers(servers) {
    this._serversCache = servers
    try {
      if (window.electronAPI && window.electronAPI.saveSignalingServers) {
        await window.electronAPI.saveSignalingServers(servers)
      } else {
        localStorage.setItem(this.storageKeys.signalingServers, JSON.stringify(servers))
      }
      return servers
    } catch (e) {
      this.logFn('保存信令服务器列表失败:', e)
      // 回退到 localStorage
      try { localStorage.setItem(this.storageKeys.signalingServers, JSON.stringify(servers)) } catch (e2) {}
      return servers
    }
  }

  async addServer(name, url) {
    await this._ensureServersLoaded()
    const servers = this.getServers()
    const exists = servers.some(s => s.name === name && s.url === url)
    if (exists) {
      this.logFn('信令服务器已存在，跳过重复添加: ' + name)
      return servers
    }
    servers.unshift({ name, url, timestamp: Date.now() })
    return this.saveServers(servers)
  }

  async editServer(index, name, url) {
    const servers = this.getServers()
    if (index >= servers.length) return null
    servers[index] = { name, url, timestamp: Date.now() }
    return this.saveServers(servers)
  }

  async deleteServer(index) {
    const servers = this.getServers()
    if (index >= servers.length) return null
    servers.splice(index, 1)
    return this.saveServers(servers)
  }

  saveToHistory(type, data) {
    const key = this.storageKeys[type]
    if (!key) return
    const history = this.loadHistory(type)
    const entry = Object.assign({ timestamp: Date.now() }, data)
    history.unshift(entry)
    if (history.length > this.maxItems) {
      history.length = this.maxItems
    }
    try {
      localStorage.setItem(key, JSON.stringify(history))
    } catch (e) {
      this.logFn('保存历史记录失败: ' + (e.message || e))
    }
  }

  loadHistory(type) {
    const key = this.storageKeys[type]
    if (!key) return []
    try {
      return JSON.parse(localStorage.getItem(key) || '[]')
    } catch {
      return []
    }
  }

  getHistoryItem(type, index) {
    const history = this.loadHistory(type)
    if (index >= 0 && index < history.length) {
      return history[index]
    }
    return null
  }

  deleteFromHistory(type, index) {
    const key = this.storageKeys[type]
    if (!key) return
    const history = this.loadHistory(type)
    if (index >= 0 && index < history.length) {
      history.splice(index, 1)
      try {
        localStorage.setItem(key, JSON.stringify(history))
      } catch (e) {
        this.logFn('删除历史记录失败: ' + (e.message || e))
      }
    }
  }
}

(function () {
  var exitBehavior = (function() {
    try { return localStorage.getItem('ycdesk_exit_behavior') || 'lock_and_disconnect' } catch(e) { return 'lock_and_disconnect' }
  })()
  var statsBarVisible = (function() {
    try { return localStorage.getItem('ycdesk_stats_bar_hidden') !== '1' } catch(e) { return true }
  })()
  var toolbarVisible = true
  var idleTimer = null
  var idleTimeout = 0 // 0 means auto-hide disabled

  window.ToolbarManager = {
    lockRemoteScreen: function (getConnectionManager) {
      var cm = typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager
      if (!cm) {
        window.UIState && window.UIState.log('lockRemoteScreen: connectionManager 未初始化')
        return
      }
      window.UIState && window.UIState.log('lockRemoteScreen: 发送锁屏命令')
      var inputCommand = window.createInputCommand(window.INPUT_TYPES.LOCK_SCREEN, {})
      cm.sendInput(inputCommand)
      window.UIState && window.UIState.log('lockRemoteScreen: 锁屏命令已发送')
    },

    disconnectAndLock: function (getConnectionManager) {
      if (!confirm('确定要退出连接并锁定远程屏幕吗？')) return
      var cm = typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager
      if (cm) {
        window.UIState && window.UIState.log('disconnectAndLock: 先发送锁屏命令')
        var inputCommand = window.createInputCommand(window.INPUT_TYPES.LOCK_SCREEN, {})
        cm.sendInput(inputCommand)
        window.UIState && window.UIState.log('disconnectAndLock: 锁屏命令已发送，等待500ms后断开')
        setTimeout(function () { cm.disconnect(); window.resetInputModifiers(); window.close() }, 500)
      } else {
        window.resetInputModifiers()
        window.close()
      }
    },

    disconnect: function (getConnectionManager) {
      if (!confirm('确定要断开连接吗？')) return
      var cm = typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager
      if (cm) { cm.disconnect() }
      window.resetInputModifiers()
      window.close()
    },

    resetInputModifiers: function () {
      try {
        if (window.electronAPI && window.electronAPI.resetInputModifiers) {
          window.electronAPI.resetInputModifiers()
        }
      } catch (e) { console.error('重置输入修饰键失败:', e) }
    },

    unlockPanel: function () {
      if (window.unlockUI) {
        window.unlockUI.showOverlay()
      } else if (window.UnlockUI) {
        window.unlockUI = new window.UnlockUI()
        window.unlockUI.showOverlay()
      }
    },

    getExitBehavior: function () {
      return exitBehavior
    },

    toggleExitBehavior: function () {
      exitBehavior = exitBehavior === 'disconnect_only' ? 'lock_and_disconnect' : 'disconnect_only'
      try { localStorage.setItem('ycdesk_exit_behavior', exitBehavior) } catch(e) {}
      this.updateExitButton()
      window.UIState && window.UIState.log('退出模式切换为: ' + (exitBehavior === 'lock_and_disconnect' ? '退出并锁屏' : '仅退出'))
    },

    updateExitButton: function () {
      var btn = document.getElementById('exitLockBtn')
      if (!btn) return
      if (exitBehavior === 'lock_and_disconnect') {
        btn.textContent = '🚪 退出并锁屏'
        btn.title = '右键切换为仅退出（当前:退出并锁屏）'
      } else {
        btn.textContent = '🚪 退出'
        btn.title = '右键切换为退出并锁屏（当前:仅退出）'
      }
    },

    handleExit: function (getConnectionManager) {
      if (exitBehavior === 'lock_and_disconnect') {
        this.disconnectAndLock(getConnectionManager)
      } else {
        this.disconnect(getConnectionManager)
      }
    },

    // ==================== 状态栏开关 ====================
    isStatsBarVisible: function () {
      return statsBarVisible
    },

    toggleStatsBar: function () {
      var el = document.getElementById('toolbarStats')
      if (!el) return
      statsBarVisible = !statsBarVisible
      if (statsBarVisible) {
        el.classList.remove('hidden')
      } else {
        el.classList.add('hidden')
      }
      try { localStorage.setItem('ycdesk_stats_bar_hidden', statsBarVisible ? '0' : '1') } catch(e) {}
      var btn = document.getElementById('statsBtn')
      if (btn) btn.textContent = statsBarVisible ? '📊 状态' : '📊 状态(关)'
    },

    // ==================== 工具栏显示/隐藏 ====================
    isToolbarVisible: function () {
      return toolbarVisible
    },

    toggleToolbar: function () {
      var toolbar = document.querySelector('.toolbar')
      if (!toolbar) return
      toolbarVisible = !toolbarVisible
      toolbar.style.display = toolbarVisible ? 'flex' : 'none'
      var btn = document.getElementById('hideToolbarBtn')
      if (btn) btn.textContent = toolbarVisible ? '👁️ 隐藏栏' : '👁️‍🗨️ 显示栏'
    },

    // ==================== 状态栏数据更新 ====================
    updateLatency: function (latencyMs) {
      var el = document.getElementById('latency')
      if (el) el.textContent = latencyMs + ' ms'
    },

    updateFps: function (fps) {
      var el = document.getElementById('fps')
      if (el) el.textContent = fps + ' fps'
    },

    updateResolution: function (width, height) {
      var el = document.getElementById('resolution')
      if (el) el.textContent = width + 'x' + height
    },

    updateConnectionState: function (state) {
      var el = document.getElementById('connectionState')
      if (el) el.textContent = state
    },

    // ==================== 控制栏自动隐藏 ====================
    setIdleTimeout: function (seconds) {
      idleTimeout = seconds
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      if (seconds > 0) {
        this._resetIdleTimer()
      } else {
        // 恢复显示工具栏
        if (!toolbarVisible) this.toggleToolbar()
      }
    },

    _resetIdleTimer: function () {
      var self = this
      if (idleTimer) clearTimeout(idleTimer)
      if (idleTimeout <= 0) return
      idleTimer = setTimeout(function () {
        if (toolbarVisible) self.toggleToolbar()
        idleTimer = null
      }, idleTimeout * 1000)
    },

    _onUserActivity: function () {
      if (idleTimeout <= 0) return
      if (!toolbarVisible) {
        var toolbar = document.querySelector('.toolbar')
        if (toolbar) {
          toolbarVisible = true
          toolbar.style.display = 'flex'
          var btn = document.getElementById('hideToolbarBtn')
          if (btn) btn.textContent = '👁️ 隐藏栏'
        }
      }
      this._resetIdleTimer()
    }
  }

  // 全局引用
  window.resetInputModifiers = window.ToolbarManager.resetInputModifiers

  // 初始化
  setTimeout(function () {
    window.ToolbarManager.updateExitButton()

    // 恢复状态栏状态
    var statsEl = document.getElementById('toolbarStats')
    if (statsEl && !statsBarVisible) {
      statsEl.classList.add('hidden')
    }

    // 设置用户活动监听（用于自动隐藏控制栏）
    var activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    activityEvents.forEach(function (evt) {
      document.addEventListener(evt, function () { window.ToolbarManager._onUserActivity() }, { passive: true })
    })
  }, 0)
})()
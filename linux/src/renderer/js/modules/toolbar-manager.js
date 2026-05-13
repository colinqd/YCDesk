(function () {
  var exitBehavior = (function() {
    try { return localStorage.getItem('ycdesk_exit_behavior') || 'lock_and_disconnect' } catch(e) { return 'lock_and_disconnect' }
  })()

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
      if (window.UnlockUI) {
        var ui = new window.UnlockUI()
        ui.showOverlay()
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
    }
  }

  window.resetInputModifiers = window.ToolbarManager.resetInputModifiers
  setTimeout(function () { window.ToolbarManager.updateExitButton() }, 0)
})()
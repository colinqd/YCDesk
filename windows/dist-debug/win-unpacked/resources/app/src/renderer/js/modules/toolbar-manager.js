(function () {
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
    }
  }

  window.resetInputModifiers = window.ToolbarManager.resetInputModifiers
})()
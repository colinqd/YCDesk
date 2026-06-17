(function () {
  function UnlockUI() {
    this.overlay = document.getElementById('unlockOverlay')
    this.passwordInput = document.getElementById('unlockPassword')
    this.rememberCheckbox = document.getElementById('rememberUnlockPassword')
    this.manualBtn = document.getElementById('btnManualUnlock')
    this.autoBtn = document.getElementById('btnAutoUnlock')
    this.messageEl = document.getElementById('unlockMessage')
    this.autoUnlockEnabled = false
    this.savedPasswordAvailable = false
    this.savedPassword = null

    var self = this
    this.manualBtn.addEventListener('click', function () { self.handleManualUnlock() })
    this.autoBtn.addEventListener('click', function () { self.handleAutoUnlock() })
    this.passwordInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') self.handleManualUnlock() })
    this.rememberCheckbox.addEventListener('change', function () { self.handlePasswordSave() })
    this.loadSavedPassword()
  }

  UnlockUI.prototype.loadSavedPassword = function () {
    var self = this
    if (window.electronAPI && window.electronAPI.getUnlockPassword) {
      window.electronAPI.getUnlockPassword().then(function (result) {
        if (result && result.success && result.password) {
          self.savedPassword = result.password
          self.savedPasswordAvailable = true
          self.rememberCheckbox.checked = true
        }
      }).catch(function () {})
    }
  }

  UnlockUI.prototype.showOverlay = function () {
    this.overlay.classList.remove('hidden')
    if (window.setUnlockPanelState) window.setUnlockPanelState(true)
    var self = this
    setTimeout(function () { self.passwordInput.focus() }, 50)
    this.autoBtn.style.display = this.savedPasswordAvailable ? 'block' : 'none'
  }

  UnlockUI.prototype.hideOverlay = function () {
    this.overlay.classList.add('hidden')
    this.passwordInput.value = ''
    this.clearMessage()
    if (window.setUnlockPanelState) window.setUnlockPanelState(false)
  }

  UnlockUI.prototype.handleManualUnlock = function () {
    var password = this.passwordInput.value
    // 允许空密码，被控端会自动使用本地保存的密码
    try {
      this.sendUnlockCommand(password)
      this.showMessage('正在发送解锁命令...', 'success')
      if (password && this.rememberCheckbox.checked) this.savePassword(password)
      var self = this
      setTimeout(function () { self.hideOverlay() }, 1500)
    } catch (error) { this.showMessage('发送解锁命令失败: ' + error.message, 'error') }
  }

  UnlockUI.prototype.handleAutoUnlock = function () {
    if (!this.savedPassword) { this.showMessage('没有保存的密码', 'error'); return }
    try {
      this.sendUnlockCommand(this.savedPassword)
      this.showMessage('正在发送自动解锁命令...', 'success')
      var self = this
      setTimeout(function () { self.hideOverlay() }, 1500)
    } catch (error) { this.showMessage('自动解锁失败: ' + error.message, 'error'); this.autoBtn.style.display = 'none' }
  }

  UnlockUI.prototype.sendUnlockCommand = function (password) {
    if (!window.connectionManager) throw new Error('连接管理器未初始化')
    var unlockCommand
    if (window.createInputCommand && typeof window.createInputCommand === 'function') {
      unlockCommand = window.createInputCommand('unlock_screen', { password: password || '' })
    } else {
      unlockCommand = { type: 'input', inputType: 'unlock_screen', password: password || '', timestamp: Date.now() }
    }
    window.connectionManager.sendInput(unlockCommand)

    // 解锁后发送 Enter 键以关闭锁屏壁纸（与 Android 端行为一致）
    var self = this
    setTimeout(function () {
      if (!window.connectionManager) return
      var enterCommand
      if (window.createInputCommand && typeof window.createInputCommand === 'function') {
        enterCommand = window.createInputCommand('keydown', { code: 'Enter', key: 'Enter' })
      } else {
        enterCommand = { type: 'input', inputType: 'keydown', code: 'Enter', key: 'Enter', timestamp: Date.now() }
      }
      window.connectionManager.sendInput(enterCommand)
    }, 500)
  }

  UnlockUI.prototype.savePassword = function (password) {
    if (window.electronAPI && window.electronAPI.saveUnlockPassword) {
      window.electronAPI.saveUnlockPassword(password).then(function () {}).catch(function () {})
    }
    this.savedPassword = password
    this.savedPasswordAvailable = true
  }

  UnlockUI.prototype.handlePasswordSave = function () {
    if (!this.rememberCheckbox.checked) this.clearPassword()
    else if (this.passwordInput.value) this.savePassword(this.passwordInput.value)
  }

  UnlockUI.prototype.clearPassword = function () {
    if (window.electronAPI && window.electronAPI.clearUnlockPassword) {
      window.electronAPI.clearUnlockPassword().then(function () {}).catch(function () {})
    }
    this.savedPassword = null
    this.savedPasswordAvailable = false
  }

  UnlockUI.prototype.showMessage = function (text, type) { this.messageEl.textContent = text; this.messageEl.className = 'unlock-message ' + type }
  UnlockUI.prototype.clearMessage = function () { this.messageEl.textContent = ''; this.messageEl.className = 'unlock-message' }

  window.UnlockUI = UnlockUI
})()
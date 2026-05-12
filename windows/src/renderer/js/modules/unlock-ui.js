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
    try {
      var saved = localStorage.getItem('ycdesk_unlock_password')
      if (saved) { this.savedPassword = saved; this.savedPasswordAvailable = true; this.rememberCheckbox.checked = true }
    } catch (e) {}
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
    if (!password) { this.showMessage('请输入密码', 'error'); return }
    try {
      this.sendUnlockCommand(password)
      this.showMessage('正在发送解锁命令...', 'success')
      if (this.rememberCheckbox.checked) this.savePassword(password)
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
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      window.electronAPI.invoke('service:unlockWithPassword', { password: password })
    }
    if (!window.connectionManager) throw new Error('连接管理器未初始化')
    var unlockCommand
    if (window.createInputCommand && typeof window.createInputCommand === 'function') {
      unlockCommand = window.createInputCommand('unlock_screen', { password: password })
    } else {
      unlockCommand = { type: 'input', inputType: 'unlock_screen', password: password, timestamp: Date.now() }
    }
    window.connectionManager.sendInput(unlockCommand)
  }

  UnlockUI.prototype.savePassword = function (password) {
    try { localStorage.setItem('ycdesk_unlock_password', password); this.savedPassword = password; this.savedPasswordAvailable = true } catch (e) {}
  }

  UnlockUI.prototype.handlePasswordSave = function () {
    if (!this.rememberCheckbox.checked) this.clearPassword()
    else if (this.passwordInput.value) this.savePassword(this.passwordInput.value)
  }

  UnlockUI.prototype.clearPassword = function () {
    try { localStorage.removeItem('ycdesk_unlock_password'); this.savedPassword = null; this.savedPasswordAvailable = false } catch (e) {}
  }

  UnlockUI.prototype.showMessage = function (text, type) { this.messageEl.textContent = text; this.messageEl.className = 'unlock-message ' + type }
  UnlockUI.prototype.clearMessage = function () { this.messageEl.textContent = ''; this.messageEl.className = 'unlock-message' }

  window.UnlockUI = UnlockUI
})()
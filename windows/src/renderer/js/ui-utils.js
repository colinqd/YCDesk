let connectionLogDiv = null

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    if (type === 'error') {
      div.className = 'error'
    } else if (type === 'warning') {
      div.className = 'warning'
    } else if (type === 'info') {
      div.className = 'info'
    }
    connectionLogDiv.appendChild(div)
    connectionLogDiv.scrollTop = connectionLogDiv.scrollHeight
  }
}

function setConnectionLogDiv(elementId) {
  connectionLogDiv = document.getElementById(elementId)
}

function updateServerStatus(text, status) {
  // 更新被控端状态
  const controlledText = document.getElementById('serverStatusText')
  const controlledBadge = document.getElementById('serverStatus')
  const controlledDot = document.querySelector('#controlledPage .status-dot')

  if (controlledText) controlledText.textContent = text
  if (controlledBadge) controlledBadge.classList.remove('connecting', 'error', 'reconnecting')
  if (controlledDot) controlledDot.classList.remove('connecting', 'error', 'reconnecting')

  if (status === 'connecting' || status === 'reconnecting') {
    if (controlledBadge) controlledBadge.classList.add('connecting')
    if (controlledDot) controlledDot.classList.add('connecting')
  } else if (status === 'error' || status === 'disconnected') {
    if (controlledBadge) controlledBadge.classList.add('error')
    if (controlledDot) controlledDot.classList.add('error')
  }

  // 更新主控端状态
  const controllerText = document.getElementById('controllerStatusText')
  const controllerBadge = document.getElementById('controllerServerStatus')
  const controllerDot = document.getElementById('controllerStatusDot')

  if (controllerText) controllerText.textContent = text
  if (controllerBadge) controllerBadge.classList.remove('connecting', 'error', 'reconnecting')
  if (controllerDot) controllerDot.classList.remove('connecting', 'error', 'reconnecting')

  if (status === 'connecting' || status === 'reconnecting') {
    if (controllerBadge) controllerBadge.classList.add('connecting')
    if (controllerDot) controllerDot.classList.add('connecting')
  } else if (status === 'error' || status === 'disconnected') {
    if (controllerBadge) controllerBadge.classList.add('error')
    if (controllerDot) controllerDot.classList.add('error')
  }

  // 根据连接状态更新按钮启用/禁用
  const isConnected = (status === 'connected')
  const isConnecting = (status === 'connecting' || status === 'reconnecting')

  const controlledConnectBtn = document.getElementById('controlledConnectBtn')
  const controlledDisconnectBtn = document.getElementById('controlledDisconnectBtn')
  if (controlledConnectBtn) controlledConnectBtn.disabled = isConnected || isConnecting
  if (controlledDisconnectBtn) controlledDisconnectBtn.disabled = !isConnected && !isConnecting

  const controllerConnectBtn = document.getElementById('controllerConnectBtn')
  const controllerDisconnectBtn = document.getElementById('controllerDisconnectBtn')
  if (controllerConnectBtn) controllerConnectBtn.disabled = isConnected || isConnecting
  if (controllerDisconnectBtn) controllerDisconnectBtn.disabled = !isConnected && !isConnecting
}

function copyDeviceId(deviceId) {
  if (!deviceId) return
  
  navigator.clipboard.writeText(deviceId).then(() => {
    showToast('设备ID已复制到剪贴板', 'success')
    const el = document.getElementById('deviceId')
    if (!el) return
    
    const originalText = el.textContent
    el.textContent = '已复制!'
    setTimeout(() => {
      el.textContent = originalText
    }, 1500)
  }).catch(err => {
    showToast('复制失败: ' + err.message, 'error')
  })
}

function getControlledServerUrl() {
  return document.getElementById('controlledServerUrl')?.value || 'http://localhost:3000'
}

function getControllerServerUrl() {
  return document.getElementById('controllerServerUrl')?.value || 'http://localhost:3000'
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast')
  if (existingToast) {
    existingToast.remove()
  }
  
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.classList.add('hiding')
    setTimeout(() => {
      toast.remove()
    }, 300)
  }, 3000)
}

function showModal(title, content, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    
    const modal = document.createElement('div')
    modal.className = 'modal'
    
    const titleEl = document.createElement('div')
    titleEl.className = 'modal-title'
    titleEl.textContent = title
    
    const contentEl = document.createElement('div')
    contentEl.className = 'modal-content'
    contentEl.textContent = content
    
    const actionsEl = document.createElement('div')
    actionsEl.className = 'modal-actions'
    
    if (options.type === 'confirm' || options.type === 'danger') {
      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'modal-btn modal-btn-cancel'
      cancelBtn.textContent = options.cancelText || '取消'
      cancelBtn.onclick = () => {
        overlay.remove()
        resolve(false)
      }
      actionsEl.appendChild(cancelBtn)
    }
    
    const confirmBtn = document.createElement('button')
    confirmBtn.className = `modal-btn ${options.type === 'danger' ? 'modal-btn-danger' : 'modal-btn-confirm'}`
    confirmBtn.textContent = options.confirmText || '确定'
    confirmBtn.onclick = () => {
      overlay.remove()
      resolve(true)
    }
    actionsEl.appendChild(confirmBtn)
    
    modal.appendChild(titleEl)
    modal.appendChild(contentEl)
    modal.appendChild(actionsEl)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(false)
      }
    }
    
    confirmBtn.focus()
  })
}

function showConfirm(title, content) {
  return showModal(title, content, { type: 'confirm' })
}

function showDangerConfirm(title, content) {
  return showModal(title, content, { type: 'danger', confirmText: '确认', cancelText: '取消' })
}

function showAlert(title, content) {
  return showModal(title, content, { confirmText: '知道了' })
}

function setButtonLoading(button, loading) {
  if (!button) return
  
  if (loading) {
    button.disabled = true
    button.dataset.originalText = button.textContent
    button.innerHTML = `<span class="loading-spinner"></span>${button.dataset.originalText}`
  } else {
    button.disabled = false
    button.textContent = button.dataset.originalText || button.textContent
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分`
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  } else {
    return `${seconds}秒`
  }
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'q':
          e.preventDefault()
          window.close()
          break
        case 'r':
          e.preventDefault()
          location.reload()
          break
        case 'f':
          e.preventDefault()
          const fullscreenBtn = document.querySelector('[onclick*="toggleFullscreen"]')
          if (fullscreenBtn) fullscreenBtn.click()
          break
      }
    }
    
    if (e.key === 'Escape') {
      const modal = document.querySelector('.modal-overlay')
      if (modal) {
        modal.click()
      }
    }
  })
}

module.exports = {
  log,
  setConnectionLogDiv,
  updateServerStatus,
  copyDeviceId,
  getControlledServerUrl,
  getControllerServerUrl,
  openRemoteWindow,
  showToast,
  showModal,
  showConfirm,
  showDangerConfirm,
  showAlert,
  setButtonLoading,
  formatBytes,
  formatDuration,
  initKeyboardShortcuts
}
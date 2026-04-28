class UIManager {
  constructor(options = {}) {
    this.connectionLogDiv = null
    this.currentPage = 'role'
    this.options = options
    this.logFn = options.log || console.log
  }

  setLogDiv(element) {
    this.connectionLogDiv = element
  }

  showPage(pageId) {
    const pages = ['rolePage', 'controlledPage', 'controllerPage']
    pages.forEach(id => {
      const el = document.getElementById(id)
      if (el) {
        el.classList.remove('active')
      }
    })

    const targetPage = document.getElementById(pageId)
    if (targetPage) {
      targetPage.classList.add('active')
    }
    this.currentPage = pageId
  }

  selectRole(role) {
    this.showPage('rolePage')

    if (role === 'controlled') {
      this.showPage('controlledPage')
      this.connectionLogDiv = document.getElementById('connectionLog')
      return 'controlled'
    } else {
      this.showPage('controllerPage')
      this.connectionLogDiv = document.getElementById('connectionLogController')
      return 'controller'
    }
  }

  goBack() {
    this.showPage('rolePage')
  }

  switchMode(role, mode, event) {
    const modeTabs = document.querySelectorAll(`#${role}Page .mode-tab`)
    modeTabs.forEach(tab => tab.classList.remove('active'))

    const clickedTab = Array.from(modeTabs).find(tab => tab.textContent === (mode === 'direct' ? '直连模式' : '信令服务器模式'))
    if (clickedTab) {
      clickedTab.classList.add('active')
    }

    const directMode = document.getElementById(`${role}DirectMode`)
    const signalingMode = document.getElementById(`${role}SignalingMode`)

    if (directMode) directMode.classList.remove('active')
    if (signalingMode) signalingMode.classList.remove('active')

    if (role === 'controlled') {
      const directSection = document.getElementById('controlledDirectSection')
      if (directSection) {
        directSection.style.display = mode === 'direct' ? 'block' : 'none'
      }
    }

    const targetMode = mode === 'direct' ? directMode : signalingMode
    if (targetMode) {
      targetMode.classList.add('active')
    }

    return mode
  }

  updateServerStatus(text, status) {
    const statusText = document.getElementById('serverStatusText')
    const statusBadge = document.getElementById('serverStatus')
    const statusDot = document.querySelector('.status-dot')

    if (!statusText || !statusBadge || !statusDot) return

    statusText.textContent = text

    const statusStyles = {
      'connected': { bg: '#e6f4ea', color: '#135429', dotColor: '#2ecc71' },
      'connecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107' },
      'disconnected': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' },
      'error': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' }
    }

    const style = statusStyles[status] || statusStyles['disconnected']
    statusBadge.style.background = style.bg
    statusBadge.style.color = style.color
    statusDot.style.background = style.dotColor
  }

  setDeviceId(deviceId) {
    const el = document.getElementById('deviceId')
    if (el) {
      el.textContent = deviceId
    }
  }

  updateLocalIpList(ipList) {
    const listEl = document.getElementById('localIpList')
    if (!listEl) return

    if (!ipList || ipList.length === 0) {
      listEl.innerHTML = '<div class="ip-item">未找到可用网络接口</div>'
      return
    }

    const displayList = ipList.map(ip => {
      const addr = ip.family === 'IPv6' ? `[${ip.address}]` : ip.address
      return `<div class="ip-item">${addr} (${ip.name})</div>`
    })

    listEl.innerHTML = displayList.join('')
  }

  showIncomingConnectionDialog(fromDeviceId) {
    return confirm(`设备 ${fromDeviceId} 想要连接到你的电脑，是否接受？`)
  }

  copyDeviceId(deviceId) {
    if (!deviceId) return false

    const el = document.getElementById('deviceId')
    if (!el) return false

    return navigator.clipboard.writeText(deviceId).then(() => {
      const originalText = el.textContent
      el.textContent = '已复制!'
      setTimeout(() => {
        el.textContent = originalText
      }, 1500)
      return true
    }).catch(err => {
      console.error('复制失败:', err)
      return false
    })
  }

  getControlledServerUrl() {
    return document.getElementById('controlledServerUrl')?.value || 'http://localhost:3000'
  }

  getControllerServerUrl() {
    return document.getElementById('controllerServerUrl')?.value || 'http://localhost:3000'
  }

  getListenPort() {
    const el = document.getElementById('listenPort')
    if (!el) return 8080
    const port = parseInt(el.value)
    return this._validatePort(port) ? port : 8080
  }

  getRemotePort() {
    const el = document.getElementById('remotePort')
    if (!el) return 8080
    const port = parseInt(el.value)
    return this._validatePort(port) ? port : 8080
  }

  getRemoteIp() {
    const el = document.getElementById('remoteIp')
    return el ? el.value.trim() : ''
  }

  _validatePort(port) {
    if (isNaN(port)) return false
    if (port < 1024 || port > 65535) return false
    return true
  }

  _validateIpAddress(ip) {
    if (!ip || typeof ip !== 'string') return false
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$/
    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === 'localhost'
  }

  _validateDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return false
    return deviceId.length >= 6 && deviceId.length <= 16
  }

  getTargetDeviceId() {
    const el = document.getElementById('targetDeviceId')
    return el ? el.value.trim().toUpperCase() : ''
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString()
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    if (this.connectionLogDiv) {
      const div = document.createElement('div')
      div.textContent = logMessage
      this.connectionLogDiv.appendChild(div)
      this.connectionLogDiv.scrollTop = this.connectionLogDiv.scrollHeight
    }
  }
}

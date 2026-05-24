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
    const pages = ['rolePage', 'controlledPage', 'controllerPage', 'settingsPage']
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
    if (pageId !== 'settingsPage') {
      this.currentPage = pageId
    }

    // 更新侧边栏导航高亮
    const navItems = document.querySelectorAll('.sidebar .nav-item')
    navItems.forEach(item => {
      const navPage = item.getAttribute('data-page')
      if (navPage === pageId || (pageId === 'settingsPage' && navPage === 'settingsPage')) {
        item.classList.add('active')
      } else if (navPage === 'aboutSection' && pageId === 'settingsPage') {
        item.classList.add('active')
      } else {
        item.classList.remove('active')
      }
    })
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
    const statusStyles = {
      'connected': { bg: '#e6f4ea', color: '#135429', dotColor: '#2ecc71', dotAnimation: '' },
      'connecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107', dotAnimation: 'pulse-fast 1s infinite' },
      'disconnected': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c', dotAnimation: '' },
      'error': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c', dotAnimation: '' },
      'reconnecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107', dotAnimation: 'pulse-fast 1s infinite' }
    }
    const style = statusStyles[status] || statusStyles['disconnected']

    // 更新被控端状态指示灯
    const controlledText = document.getElementById('serverStatusText')
    const controlledBadge = document.getElementById('serverStatus')
    const controlledDot = document.querySelector('#controlledPage .status-dot')
    if (controlledText) controlledText.textContent = text
    if (controlledBadge) {
      controlledBadge.style.background = style.bg
      controlledBadge.style.color = style.color
    }
    if (controlledDot) {
      controlledDot.style.background = style.dotColor
      controlledDot.style.animation = style.dotAnimation
    }

    // 更新主控端状态指示灯
    const controllerText = document.getElementById('controllerStatusText')
    const controllerBadge = document.getElementById('controllerServerStatus')
    const controllerDot = document.getElementById('controllerStatusDot')
    if (controllerText) controllerText.textContent = text
    if (controllerBadge) {
      controllerBadge.style.background = style.bg
      controllerBadge.style.color = style.color
    }
    if (controllerDot) {
      controllerDot.style.background = style.dotColor
      controllerDot.style.animation = style.dotAnimation
    }

    // 更新底部状态栏
    const statusbarText = document.getElementById('statusbarText')
    if (statusbarText) {
      const statusIcons = { connected: '\u{1F7E2}', connecting: '\u{1F7E1}', disconnected: '\u{1F534}', error: '\u{1F534}', reconnecting: '\u{1F7E1}' }
      statusbarText.textContent = (statusIcons[status] || '\u{26AA}') + ' ' + text
    }
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

// 全局侧边栏导航函数
function navigateTo(pageId) {
  if (!uiManager) {
    console.warn('navigateTo: uiManager 未初始化')
    return
  }
  if (pageId === 'controlledPage' || pageId === 'controllerPage') {
    var role = pageId === 'controlledPage' ? 'controlled' : 'controller'
    uiManager.selectRole(role)
  } else {
    uiManager.showPage(pageId)
  }
}

// 全局状态栏日志切换
function toggleStatusbarLog() {
  const controlledLogBox = document.getElementById('controlledLogBox')
  const controllerLogBox = document.getElementById('controllerLogBox')
  const activeLog = [controlledLogBox, controllerLogBox].find(function(box) {
    return box && box.offsetParent !== null
  })
  if (activeLog) {
    activeLog.classList.toggle('collapsed')
  }
}

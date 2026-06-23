/**
 * 设置页面与实用功能 — 窗口控制、日志、解锁密码、Credential Provider、屏幕捕获
 *
 * 依赖 app.js 中定义的全局状态 (log, myDeviceId 等)。
 * 通过 <script> 标签加载，函数自动注册为全局。
 */

// ==================== 设置页面 ====================

let currentSettingsPage = null

function openSettingsPage() {
  currentSettingsPage = uiManager.currentPage

  // 隐藏所有页面
  const pages = document.querySelectorAll('.page')
  pages.forEach(page => page.classList.remove('active'))

  // 显示设置页面
  const settingsPage = document.getElementById('settingsPage')
  if (settingsPage) {
    settingsPage.classList.add('active')
  }

  loadAutoStartStatus()
  loadServiceModeStatus()
  // 加载信令服务器列表到设置页
  if (typeof renderSettingsServerList === 'function') {
    renderSettingsServerList()
  }
  log('打开设置页面')
}

function closeSettingsPage() {
  // 隐藏设置页面
  const settingsPage = document.getElementById('settingsPage')
  if (settingsPage) {
    settingsPage.classList.remove('active')
  }

  // 回到之前的页面
  if (currentSettingsPage) {
    const page = document.getElementById(currentSettingsPage)
    if (page) {
      page.classList.add('active')
    }
    currentSettingsPage = null
  }

  log('关闭设置页面')
}

// ==================== 窗口控制 ====================

async function minimizeWindow() {
  try {
    await window.electronAPI.windowMinimize()
  } catch (e) {
    console.error('最小化失败:', e)
  }
}

async function closeWindow() {
  try {
    await window.electronAPI.windowClose()
  } catch (e) {
    console.error('关闭失败:', e)
  }
}

// ==================== UI 工具函数 ====================

function toggleLogBox(boxId) {
  const logBox = document.getElementById(boxId)
  if (!logBox) return

  const btn = logBox.querySelector('.log-toggle-btn')
  if (logBox.classList.contains('collapsed')) {
    logBox.classList.remove('collapsed')
    if (btn) btn.textContent = '收起'
  } else {
    logBox.classList.add('collapsed')
    if (btn) btn.textContent = '展开'
  }
}

function toggleAdvancedSettings(sectionId) {
  const content = document.getElementById(sectionId)
  const toggleEl = document.getElementById(sectionId + 'Toggle')
  if (!content || !toggleEl) return

  const arrow = toggleEl.querySelector('.toggle-arrow')
  if (content.style.display === 'none') {
    content.style.display = 'block'
    if (arrow) arrow.textContent = '▼'
  } else {
    content.style.display = 'none'
    if (arrow) arrow.textContent = '▶'
  }
}

function updateServerStatusDisplay(text, type) {
  // 更新被控端状态
  const badge = document.getElementById('serverStatus')
  if (badge) {
    const dot = badge.querySelector('.status-dot')
    const textEl = document.getElementById('serverStatusText')
    if (textEl) textEl.textContent = text
    badge.classList.remove('connecting', 'error', 'reconnecting')
    if (type === 'error' || type === 'disconnected') badge.classList.add('error')
    else if (type === 'connecting' || type === 'reconnecting') badge.classList.add('connecting')
    if (dot) {
      dot.classList.remove('connecting', 'error', 'reconnecting')
      if (type === 'error' || type === 'disconnected') dot.classList.add('error')
      else if (type === 'connecting' || type === 'reconnecting') dot.classList.add('connecting')
    }
  }
  // 更新主控端状态
  const controllerBadge = document.getElementById('controllerServerStatus')
  if (controllerBadge) {
    const controllerDot = document.getElementById('controllerStatusDot')
    const controllerText = document.getElementById('controllerStatusText')
    if (controllerText) controllerText.textContent = text
    controllerBadge.classList.remove('connecting', 'error', 'reconnecting')
    if (type === 'error' || type === 'disconnected') controllerBadge.classList.add('error')
    else if (type === 'connecting' || type === 'reconnecting') controllerBadge.classList.add('connecting')
    if (controllerDot) {
      controllerDot.classList.remove('connecting', 'error', 'reconnecting')
      if (type === 'error' || type === 'disconnected') controllerDot.classList.add('error')
      else if (type === 'connecting' || type === 'reconnecting') controllerDot.classList.add('connecting')
    }
  }

  // 根据连接状态更新连接按钮
  updateConnectButtons(type)
}

function updateConnectButtons(type) {
  const isConnected = (type === 'connected')
  const isConnecting = (type === 'connecting' || type === 'reconnecting')

  // 被控端连接按钮
  const controlledConnectBtn = document.getElementById('controlledConnectBtn')
  const controlledDisconnectBtn = document.getElementById('controlledDisconnectBtn')
  if (controlledConnectBtn) controlledConnectBtn.disabled = isConnected || isConnecting
  if (controlledDisconnectBtn) controlledDisconnectBtn.disabled = !isConnected && !isConnecting

  // 主控端连接按钮
  const controllerConnectBtn = document.getElementById('controllerConnectBtn')
  const controllerDisconnectBtn = document.getElementById('controllerDisconnectBtn')
  if (controllerConnectBtn) controllerConnectBtn.disabled = isConnected || isConnecting
  if (controllerDisconnectBtn) controllerDisconnectBtn.disabled = !isConnected && !isConnecting
}

function showMessage(msg) {
  const msgDiv = document.createElement('div')
  msgDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:8px;font-size:16px;z-index:10000;'
  msgDiv.textContent = msg
  document.body.appendChild(msgDiv)
  setTimeout(() => msgDiv.remove(), 2000)
}

// ==================== 解锁设置 ====================

let unlockPasswordVisible = false

async function loadUnlockPasswordStatus() {
  try {
    const status = await window.electronAPI.getUnlockStatus()
    updateUnlockStatusDisplay(status.hasSavedPassword)
  } catch (e) {
    console.error('加载解锁状态失败:', e)
  }
}

function updateUnlockStatusDisplay(hasPassword) {
  const statusBox = document.querySelector('.unlock-status-box')
  const statusDiv = document.getElementById('unlockPasswordStatus')

  if (hasPassword) {
    statusBox.classList.add('has-password')
    statusDiv.innerHTML = `
      <span class="status-icon">✅</span>
      <span class="status-text">已设置解锁密码</span>
    `
  } else {
    statusBox.classList.remove('has-password')
    statusDiv.innerHTML = `
      <span class="status-icon">⚠️</span>
      <span class="status-text">未设置解锁密码</span>
    `
  }
}

function toggleUnlockPasswordVisibility() {
  const input = document.getElementById('unlockPasswordInput')
  const btn = document.getElementById('toggleUnlockPasswordBtn')
  unlockPasswordVisible = !unlockPasswordVisible

  if (unlockPasswordVisible) {
    input.type = 'text'
    btn.textContent = '👁️‍🗨️'
  } else {
    input.type = 'password'
    btn.textContent = '👁️'
  }
}

async function saveUnlockPassword() {
  const password = document.getElementById('unlockPasswordInput').value

  if (!password) {
    showMessage('请输入解锁密码')
    return
  }

  try {
    const result = await window.electronAPI.saveUnlockPassword(password)
    if (result.success) {
      showMessage('解锁密码保存成功')
      document.getElementById('unlockPasswordInput').value = ''
      loadUnlockPasswordStatus()
    } else {
      showMessage('保存失败: ' + (result.message || '未知错误'))
    }
  } catch (e) {
    console.error('保存密码失败:', e)
    showMessage('保存失败: ' + e.message)
  }
}

async function clearUnlockPassword() {
  if (!confirm('确定要清除解锁密码吗？')) {
    return
  }

  try {
    const result = await window.electronAPI.clearUnlockPassword()
    if (result.success) {
      showMessage('解锁密码已清除')
      loadUnlockPasswordStatus()
    }
  } catch (e) {
    console.error('清除密码失败:', e)
    showMessage('清除失败: ' + e.message)
  }
}

// ==================== Credential Provider ====================

async function checkCredProvider() {
  try {
    const result = await window.electronAPI.checkCredProvider()
    updateCredProviderStatus(result)
  } catch (e) {
    console.error('检查 Credential Provider 状态失败:', e)
    showMessage('检查状态失败: ' + e.message)
  }
}

function updateCredProviderStatus(status) {
  const statusDiv = document.getElementById('credProviderStatus')

  if (status.success) {
    if (status.installed) {
      statusDiv.innerHTML = `
        <span class="status-icon">✅</span>
        <span class="status-text">已安装</span>
      `
    } else {
      statusDiv.innerHTML = `
        <span class="status-icon">⚠️</span>
        <span class="status-text">未安装</span>
      `
    }
  } else {
    statusDiv.innerHTML = `
      <span class="status-icon">❌</span>
      <span class="status-text">检查失败</span>
    `
  }
}

async function installCredProvider() {
  if (!confirm('确定要安装 Credential Provider 吗？此操作需要管理员权限，并且安装后需要重启电脑。')) {
    return
  }

  const progressDiv = document.getElementById('credProviderProgress')
  const progressText = document.getElementById('credProviderProgressText')
  progressDiv.style.display = 'block'
  progressText.textContent = '请求管理员权限...'

  try {
    // 监听进度事件
    window.electronAPI.on('credProvider:progress', (data) => {
      progressText.textContent = data.message
      if (data.status === 'success') {
        log(data.message)
      } else if (data.status === 'error') {
        console.error(data.message)
      }
    })

    const result = await window.electronAPI.installCredProvider()

    if (result.success) {
      showMessage('安装成功！请重启电脑使更改生效。')
      setTimeout(() => {
        checkCredProvider()
      }, 1000)
    } else {
      showMessage('安装失败: ' + (result.message || '未知错误'))
    }
  } catch (e) {
    console.error('安装 Credential Provider 失败:', e)
    showMessage('安装失败: ' + e.message)
  } finally {
    progressDiv.style.display = 'none'
  }
}

async function uninstallCredProvider() {
  if (!confirm('确定要卸载 Credential Provider 吗？此操作需要管理员权限，并且卸载后需要重启电脑。')) {
    return
  }

  const progressDiv = document.getElementById('credProviderProgress')
  const progressText = document.getElementById('credProviderProgressText')
  progressDiv.style.display = 'block'
  progressText.textContent = '请求管理员权限...'

  try {
    window.electronAPI.on('credProvider:progress', (data) => {
      progressText.textContent = data.message
    })

    const result = await window.electronAPI.uninstallCredProvider()

    if (result.success) {
      showMessage('卸载成功！请重启电脑使更改生效。')
      setTimeout(() => {
        checkCredProvider()
      }, 1000)
    } else {
      showMessage('卸载失败: ' + (result.message || '未知错误'))
    }
  } catch (e) {
    console.error('卸载 Credential Provider 失败:', e)
    showMessage('卸载失败: ' + e.message)
  } finally {
    progressDiv.style.display = 'none'
  }
}

// ==================== 屏幕捕获源选择 ====================

window.availableCaptureSources = []

async function loadCaptureSources() {
  try {
    var sources = await window.electronAPI.getSources()
    window.availableCaptureSources = sources

    var select = document.getElementById('captureSource')
    if (!select) return

    var currentValue = select.value
    select.innerHTML = '<option value="" data-source-id="">整个屏幕（默认）</option>'

    var screens = sources.filter(function(s) { return s.id && s.id.startsWith('screen:') })
    var windows = sources.filter(function(s) { return s.id && s.id.startsWith('window:') })

    if (screens.length > 0) {
      var screenGroup = document.createElement('optgroup')
      screenGroup.label = '🖥️ 屏幕'
      screens.forEach(function(s) {
        var opt = document.createElement('option')
        opt.value = s.id
        opt.setAttribute('data-source-id', s.id)
        opt.textContent = s.name
        screenGroup.appendChild(opt)
      })
      select.appendChild(screenGroup)
    }

    if (windows.length > 0) {
      var windowGroup = document.createElement('optgroup')
      windowGroup.label = '🪟 窗口'
      windows.forEach(function(s) {
        var opt = document.createElement('option')
        opt.value = s.id
        opt.setAttribute('data-source-id', s.id)
        opt.textContent = s.name
        windowGroup.appendChild(opt)
      })
      select.appendChild(windowGroup)
    }

    if (currentValue) { select.value = currentValue }

    var section = document.getElementById('sourceSelectorSection')
    if (section) { section.style.display = 'block' }

    try {
      var useService = localStorage.getItem('ycdesk_use_service_capture') === 'true'
      var checkbox = document.getElementById('useServiceCapture')
      if (checkbox) checkbox.checked = useService
    } catch(e) {}

    detectWdaProtection()
  } catch (e) {
    console.error('加载捕获源列表失败:', e)
  }
}

window.getSelectedSourceId = function() {
  var select = document.getElementById('captureSource')
  if (!select) return null
  var selected = select.options[select.selectedIndex]
  if (!selected) return null
  return selected.getAttribute('data-source-id') || null
}

window.refreshCaptureSources = loadCaptureSources

window.selectWindowSource = function(windowName) {
  var select = document.getElementById('captureSource')
  if (!select) return
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].textContent.indexOf(windowName) !== -1) {
      select.selectedIndex = i
      return true
    }
  }
  return false
}

async function detectWdaProtection() {
  try {
    if (!window.electronAPI.detectWdaProtection) return
    var result = await window.electronAPI.detectWdaProtection()
    var statusDiv = document.getElementById('wdaStatus')
    var bypassBtn = document.getElementById('bypassWdaBtn')
    if (!statusDiv) return

    if (result.success && result.isWdaProtected) {
      statusDiv.style.display = 'block'
      statusDiv.textContent = '⚠️ 检测到微信反截屏保护 — 微信窗口内容可能显示为黑色。点击"🔓 解锁反截屏"尝试解除。'
      if (bypassBtn) bypassBtn.style.display = 'inline-block'
    } else if (result.success && !result.isWdaProtected) {
      statusDiv.style.display = 'none'
      if (bypassBtn) bypassBtn.style.display = 'none'
    }
  } catch (e) {
    console.warn('WDA检测失败:', e)
  }
}

window.bypassWdaProtection = async function() {
  try {
    if (!window.electronAPI.tryBypassWda) {
      window.UIState && window.UIState.log('此版本不支持WDA绕过功能')
      return
    }
    var statusDiv = document.getElementById('wdaStatus')
    if (statusDiv) { statusDiv.textContent = '正在尝试解除反截屏保护...'; statusDiv.style.display = 'block' }
    var result = await window.electronAPI.tryBypassWda()
    if (result.success) {
      if (statusDiv) { statusDiv.textContent = '✅ 反截屏保护已解除！请刷新捕获源列表。'; statusDiv.style.color = '#4caf50' }
      var bypassBtn = document.getElementById('bypassWdaBtn')
      if (bypassBtn) bypassBtn.style.display = 'none'
      setTimeout(function() { loadCaptureSources() }, 500)
    } else {
      if (statusDiv) { statusDiv.textContent = '❌ 解除失败: ' + (result.error || '未知错误'); statusDiv.style.color = '#e94560' }
    }
  } catch (e) {
    console.error('WDA绕过失败:', e)
  }
}

function toggleServiceCapture() {
  var enabled = document.getElementById('useServiceCapture').checked
  try {
    localStorage.setItem('ycdesk_use_service_capture', enabled ? 'true' : 'false')
    log('服务级捕获模式: ' + (enabled ? '已启用' : '已禁用'))
  } catch(e) {
    log('保存服务捕获设置失败: ' + e.message)
  }
}

// ==================== 开机自启动 ====================

async function loadAutoStartStatus() {
  try {
    const result = await window.electronAPI.getAutoStartStatus()
    const toggle = document.getElementById('autoStartToggle')
    const statusDiv = document.getElementById('autoStartStatus')

    if (result.success) {
      if (toggle) toggle.checked = result.enabled
      if (statusDiv) {
        statusDiv.innerHTML = result.enabled
          ? '<span class="status-icon">✅</span><span class="status-text">已启用开机自启动</span>'
          : '<span class="status-icon">⚠️</span><span class="status-text">未启用开机自启动</span>'
      }
    } else {
      if (toggle) toggle.checked = false
      if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-icon">❌</span><span class="status-text">获取状态失败</span>'
      }
    }
  } catch (e) {
    console.error('加载自启动状态失败:', e)
    const toggle = document.getElementById('autoStartToggle')
    const statusDiv = document.getElementById('autoStartStatus')
    if (toggle) toggle.checked = false
    if (statusDiv) {
      statusDiv.innerHTML = '<span class="status-icon">❌</span><span class="status-text">获取状态失败</span>'
    }
  }
}

async function toggleAutoStart() {
  const toggle = document.getElementById('autoStartToggle')
  const enabled = toggle ? toggle.checked : false

  try {
    const result = await window.electronAPI.setAutoStart(enabled)
    if (result.success) {
      showMessage(enabled ? '已启用开机自启动' : '已禁用开机自启动')
      loadAutoStartStatus()
    } else {
      showMessage('设置失败: ' + (result.error || '未知错误'))
      if (toggle) toggle.checked = !enabled
    }
  } catch (e) {
    console.error('设置自启动失败:', e)
    showMessage('设置失败: ' + e.message)
    if (toggle) toggle.checked = !enabled
  }
}

// ==================== 自动连接 ====================

// 监听主进程的自动连接通知
window.electronAPI.on('auto-start:trigger-auto-connect', (config) => {
  log('收到自动连接通知: ' + JSON.stringify(config))
  executeAutoConnect(config)
})

// 监听服务模式的信令状态
window.electronAPI.on('service-mode:signaling-status', (status) => {
  log('收到服务模式信令状态: ' + JSON.stringify(status))
  handleServiceModeSignalingStatus(status)
})

// 执行自动连接
async function executeAutoConnect(config) {
  if (!config || !config.enabled) {
    log('自动连接未启用，跳过')
    return
  }

  try {
    // 切换到被控端页面
    const controlledPage = document.getElementById('controlledPage')
    if (controlledPage) {
      const pages = document.querySelectorAll('.page')
      pages.forEach(page => page.classList.remove('active'))
      controlledPage.classList.add('active')
    }

    // 等待被控端初始化
    await new Promise(resolve => setTimeout(resolve, 1000))

    if (config.mode === 'signaling') {
      // 信令服务器模式
      const serverUrlInput = document.getElementById('controlledServerUrl')
      if (serverUrlInput && config.serverUrl) {
        serverUrlInput.value = config.serverUrl
      }
      // 切换到信令模式
      if (typeof switchControlledMode === 'function') {
        switchControlledMode('signaling')
      }
      // 等待模式切换完成后自动连接
      await new Promise(resolve => setTimeout(resolve, 500))
      if (typeof controlledConnectToServer === 'function') {
        log('自动连接到信令服务器: ' + config.serverUrl)
        controlledConnectToServer()
      }
    } else if (config.mode === 'direct') {
      // 直连模式
      const listenPortInput = document.getElementById('listenPort')
      if (listenPortInput && config.listenPort) {
        listenPortInput.value = config.listenPort
      }
      // 切换到直连模式
      if (typeof switchControlledMode === 'function') {
        switchControlledMode('direct')
      }
      // 等待模式切换完成后自动监听
      await new Promise(resolve => setTimeout(resolve, 500))
      if (typeof startListening === 'function') {
        log('自动开始监听端口: ' + config.listenPort)
        startListening()
      }
    }
  } catch (e) {
    log('自动连接执行失败: ' + e.message)
  }
}

// 保存当前被控端连接配置
async function saveCurrentConnectConfig() {
  try {
    const mode = typeof currentControlledMode !== 'undefined' ? currentControlledMode : 'direct'
    const config = {
      enabled: true,
      mode: mode
    }

    if (mode === 'signaling') {
      const serverUrlInput = document.getElementById('controlledServerUrl')
      config.serverUrl = serverUrlInput ? serverUrlInput.value : ''
    } else {
      const listenPortInput = document.getElementById('listenPort')
      config.listenPort = listenPortInput ? parseInt(listenPortInput.value) : 8080
    }

    await window.electronAPI.saveAutoConnectConfig(config)
    log('连接配置已保存')
  } catch (e) {
    log('保存连接配置失败: ' + e.message)
  }
}

// 加载上次的连接配置到输入框（非自启动时）
async function loadLastConnectConfig() {
  try {
    const result = await window.electronAPI.loadAutoConnectConfig()
    if (result.success && result.config) {
      const config = result.config
      if (config.mode === 'signaling' && config.serverUrl) {
        const serverUrlInput = document.getElementById('controlledServerUrl')
        if (serverUrlInput) serverUrlInput.value = config.serverUrl
      } else if (config.mode === 'direct' && config.listenPort) {
        const listenPortInput = document.getElementById('listenPort')
        if (listenPortInput) listenPortInput.value = config.listenPort
      }
    }
  } catch (e) {
    // 静默失败，不影响正常使用
  }
}

// 处理服务模式信令状态
async function handleServiceModeSignalingStatus(status) {
  if (!status || !status.connected) {
    log('服务模式：信令未连接，将直接连接信令服务器')
    // 服务未连接信令服务器，渲染进程自行连接
    return
  }

  log('服务模式：信令已连接，服务正在等待连接请求')
  // 服务已连接信令服务器，Electron 应用只需等待连接请求
  // 通知服务 WebRTC 已就绪
  try {
    if (typeof window.electronAPI.notifyServiceWebRTCReady === 'function') {
      await window.electronAPI.notifyServiceWebRTCReady()
      log('已通知服务 WebRTC 就绪')
    }
  } catch (e) {
    log('通知服务 WebRTC 就绪失败: ' + e.message)
  }
}

// ==================== 服务模式 ====================

async function loadServiceModeStatus() {
  const statusDiv = document.getElementById('serviceModeStatus')
  const btnInstall = document.getElementById('btnInstallService')
  const btnUninstall = document.getElementById('btnUninstallService')
  const btnStart = document.getElementById('btnStartService')
  const btnStop = document.getElementById('btnStopService')

  if (!statusDiv) return

  // 安全隐藏所有按钮
  if (btnInstall) btnInstall.style.display = 'none'
  if (btnUninstall) btnUninstall.style.display = 'none'
  if (btnStart) btnStart.style.display = 'none'
  if (btnStop) btnStop.style.display = 'none'

  try {
    // 查询 Windows 服务安装和运行状态
    const result = await window.electronAPI.getWindowsServiceStatus()

    if (result.installed) {
      if (result.running) {
        statusDiv.innerHTML = '<span class="status-icon">✅</span><span class="status-text">服务已安装并运行中</span>'
        if (btnUninstall) btnUninstall.style.display = 'inline-block'
        if (btnStop) btnStop.style.display = 'inline-block'
      } else {
        statusDiv.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">服务已安装但未运行</span>'
        if (btnUninstall) btnUninstall.style.display = 'inline-block'
        if (btnStart) btnStart.style.display = 'inline-block'
      }
      // 服务模式启用时，禁用自启动开关
      updateAutoStartForServiceMode(true)
    } else {
      statusDiv.innerHTML = '<span class="status-icon">❌</span><span class="status-text">服务未安装</span>'
      if (btnInstall) btnInstall.style.display = 'inline-block'
      // 服务模式未启用时，恢复自启动开关
      updateAutoStartForServiceMode(false)
    }
  } catch (e) {
    console.error('加载服务状态失败:', e)
    statusDiv.innerHTML = '<span class="status-icon">❌</span><span class="status-text">服务未安装</span>'
    if (btnInstall) btnInstall.style.display = 'inline-block'
    updateAutoStartForServiceMode(false)
  }
}

function updateAutoStartForServiceMode(serviceModeEnabled) {
  const autoStartToggle = document.getElementById('autoStartToggle')
  const autoStartStatus = document.getElementById('autoStartStatus')

  if (serviceModeEnabled) {
    if (autoStartToggle) {
      autoStartToggle.disabled = true
      autoStartToggle.title = '服务模式启用时，自启动由服务管理'
    }
    if (autoStartStatus) {
      autoStartStatus.innerHTML = '<span class="status-icon">🔒</span><span class="status-text">由服务模式管理</span>'
    }
  } else {
    if (autoStartToggle) {
      autoStartToggle.disabled = false
      autoStartToggle.title = ''
    }
    // 恢复自启动状态显示
    loadAutoStartStatus()
  }
}

async function installService() {
  if (!confirm('安装 YCDesk 服务需要管理员权限。\n\n安装后，系统启动时 YCDesk 将自动运行（无需登录）。\n\n是否继续？')) {
    return
  }

  try {
    showMessage('正在安装服务（需要管理员权限）...')
    const result = await window.electronAPI.installServiceWithElevation()
    if (result.success) {
      await window.electronAPI.disableAutoStartForService()
      showMessage('服务安装成功')
      loadServiceModeStatus()
    } else {
      showMessage('服务安装失败: ' + (result.error || '未知错误'))
    }
  } catch (e) {
    showMessage('服务安装失败: ' + e.message)
  }
}

async function uninstallService() {
  if (!confirm('确定要卸载 YCDesk 服务吗？\n\n卸载后，系统启动时将不再自动运行。')) {
    return
  }

  try {
    showMessage('正在卸载服务...')
    const result = await window.electronAPI.uninstallServiceWithElevation()
    if (result.success) {
      await window.electronAPI.restoreAutoStartAfterService()
      showMessage('服务卸载成功')
      loadServiceModeStatus()
    } else {
      showMessage('服务卸载失败: ' + (result.error || '未知错误'))
    }
  } catch (e) {
    showMessage('服务卸载失败: ' + e.message)
  }
}

/**
 * 等待服务状态达到预期，最多重试 maxRetries 次，每次间隔 1s
 */
async function waitForServiceStatus(expectedRunning, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const status = await window.electronAPI.getWindowsServiceStatus()
      if (status.installed && status.running === expectedRunning) {
        loadServiceModeStatus()
        return true
      }
    } catch (e) {
      // 忽略中间态错误，继续重试
    }
  }
  // 最终刷新，兜底总还会走一次
  loadServiceModeStatus()
  return false
}

async function startServiceMode() {
  try {
    showMessage('正在启动服务...')
    const result = await window.electronAPI.startServiceMode()
    if (result.success) {
      showMessage('服务启动成功')
      await waitForServiceStatus(true)
    } else {
      showMessage('服务启动失败: ' + (result.error || '未知错误'))
    }
  } catch (e) {
    showMessage('服务启动失败: ' + e.message)
  }
}

async function stopServiceMode() {
  try {
    showMessage('正在停止服务...')
    const result = await window.electronAPI.stopServiceMode()
    if (result.success) {
      showMessage('服务停止成功')
      await waitForServiceStatus(false)
    } else {
      showMessage('服务停止失败: ' + (result.error || '未知错误'))
    }
  } catch (e) {
    showMessage('服务停止失败: ' + e.message)
  }
}

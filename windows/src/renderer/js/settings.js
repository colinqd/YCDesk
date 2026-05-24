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

let myDeviceId = ''
let currentControlledMode = 'direct'
let currentControllerMode = 'direct'

let uiManager = null
let historyManager = null
let connectionManager = null
let signalingManager = null
let directManager = null
let networkManager = null

function initializeApp() {
  uiManager = new UIManager({
    log: log
  })

  historyManager = new HistoryManager({
    storageKeys: CONFIG.storage.keys,
    maxItems: CONFIG.maxHistoryItems,
    log: log
  })

  connectionManager = new ConnectionManager({
    maxReconnectAttempts: CONFIG.maxReconnectAttempts,
    baseReconnectDelay: CONFIG.baseReconnectDelay,
    heartbeatInterval: CONFIG.heartbeatInterval,
    log: log,
    onStatusChange: (status) => {
    }
  })

  signalingManager = new SignalingModeManager({
    log: log,
    uiManager: uiManager,
    config: CONFIG,
    onIncomingConnection: (fromDeviceId) => {
      const autoAccept = document.getElementById('autoAcceptConnection')?.checked
      if (autoAccept) {
        log('自动接受来自 ' + fromDeviceId + ' 的连接')
        acceptConnection()
      } else {
        if (uiManager.showIncomingConnectionDialog(fromDeviceId)) {
          acceptConnection()
        } else {
          rejectConnection()
        }
      }
    }
  })

  directManager = new DirectModeManager({
    log: log,
    uiManager: uiManager,
    config: CONFIG
  })
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (uiManager && uiManager.connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    uiManager.connectionLogDiv.appendChild(div)
    uiManager.connectionLogDiv.scrollTop = uiManager.connectionLogDiv.scrollHeight
  }
}

function renderHistory(type) {
  const history = historyManager.loadHistory(type)
  const listId = type === 'direct' ? 'directHistoryList' : 'signalingHistoryList'
  const listEl = document.getElementById(listId)

  if (!listEl) return

  if (history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史连接记录</div>'
    return
  }

  listEl.innerHTML = history.map((item, index) => {
    const time = new Date(item.timestamp).toLocaleString('zh-CN')
    let targetText = ''

    if (type === 'direct') {
      targetText = `${item.ip}:${item.port}`
    } else {
      targetText = `设备: ${item.deviceId}`
    }

    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${targetText}</div>
          <div class="history-time">${time}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="reconnectFromHistory('${type}', ${index})">重连</button>
          <button class="history-btn history-btn-delete" onclick="deleteFromHistory('${type}', ${index})">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function reconnectFromHistory(type, index) {
  const item = historyManager.getHistoryItem(type, index)
  if (!item) return

  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('controllerServerUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId

    if (!signalingManager.signalingClient.isConnected()) {
      controllerConnectToServer()
    } else {
      connectDevice()
    }
  }
}

function deleteFromHistory(type, index) {
  historyManager.deleteFromHistory(type, index)
  renderHistory(type)
}

function selectRole(role) {
  const selectedRole = uiManager.selectRole(role)

  if (selectedRole === 'controlled') {
    initControlled()
  } else {
    initController()
  }
}

function switchControlledMode(mode) {
  currentControlledMode = mode
  uiManager.switchMode('controlled', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  } else {
    stopListening()
  }

  log('被控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function switchControllerMode(mode) {
  currentControllerMode = mode
  uiManager.switchMode('controller', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  }

  log('主控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function goBack() {
  uiManager.goBack()
  stopListening()
  if (signalingManager) {
    signalingManager.disconnect()
  }
}

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

async function initControlled() {
  myDeviceId = await window.electronAPI.getDeviceId()
  uiManager.setDeviceId(myDeviceId)
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  log('YCDesk 被控端初始化完成，设备ID: ' + myDeviceId)

  window.electronAPI.on('direct-incoming-connection', (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    directManager.startControlledConnection(data.clientId)
  })

  window.electronAPI.on('direct-message', async (data) => {
    await directManager.handleMessage(data.clientId, data.message)
  })

  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
    uiManager.updateServerStatus('就绪', 'disconnected')
  })

  await getLocalIps()
}

async function initController() {
  myDeviceId = await window.electronAPI.getDeviceId()
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  log('YCDesk 主控端初始化完成，设备ID: ' + myDeviceId)

  window.electronAPI.on('direct-message', async (data) => {
    await directManager.handleMessage(data.clientId, data.message)
  })

  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
  })

  window.electronAPI.on('remote-window-ready', async () => {
    log('收到远程窗口准备就绪信号')
    
    // 检查信令模式是否有待发送的启动信号
    if (signalingManager && signalingManager.pendingStartSignal) {
      log('发送信令模式启动信号到远程窗口: ' + JSON.stringify(signalingManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('signaling-mode-start', signalingManager.pendingStartSignal)
        log('sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('sendToRemoteWindow 错误: ' + error.message)
      }
      signalingManager.pendingStartSignal = null
    }
    
    // 检查直连模式是否有待发送的启动信号
    if (directManager && directManager.pendingStartSignal) {
      log('发送直连模式启动信号到远程窗口: ' + JSON.stringify(directManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('direct-mode-start', directManager.pendingStartSignal)
        log('sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('sendToRemoteWindow 错误: ' + error.message)
      }
      directManager.pendingStartSignal = null
    }
  })

  window.electronAPI.on('webrtc-offer', async (data) => {
    log('收到远程窗口的offer，转发给被控端')
    directManager.sendMessage({
      type: 'offer',
      offer: data.offer
    })
  })

  window.electronAPI.on('webrtc-answer', async (data) => {
    log('收到远程窗口的answer，转发给被控端')
    directManager.sendMessage({
      type: 'answer',
      answer: data.answer
    })
  })

  window.electronAPI.on('webrtc-ice-candidate', async (data) => {
    log('收到远程窗口的ICE候选，转发给被控端')
    directManager.sendMessage({
      type: 'ice-candidate',
      candidate: data.candidate
    })
  })

  renderHistory('direct')
  renderHistory('signaling')
}

async function getLocalIps() {
  try {
    const ipList = await window.electronAPI.getLocalIps()
    uiManager.updateLocalIpList(ipList)
    log('获取本地IP地址成功')
  } catch (error) {
    log('获取本地IP地址失败: ' + error.message)
    uiManager.updateLocalIpList([])
  }
}

async function startListening() {
  console.log('startListening 函数被调用')
  const port = uiManager.getListenPort()
  console.log('获取到的端口:', port)
  if (!uiManager._validatePort(port)) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }

  console.log('调用 directManager.startListening')
  await directManager.startListening(port)
}

async function stopListening() {
  await directManager.stopListening()
}

async function connectDirect() {
  const remoteIp = uiManager.getRemoteIp()
  const remotePort = uiManager.getRemotePort()

  if (!remoteIp) {
    alert('请输入对方IP地址')
    return
  }

  if (!uiManager._validateIpAddress(remoteIp) && remoteIp !== 'localhost') {
    alert('请输入有效的IP地址')
    return
  }

  if (!uiManager._validatePort(remotePort)) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }

  const success = await directManager.connect(remoteIp, remotePort)
  if (success) {
    historyManager.saveToHistory('direct', { ip: remoteIp, port: remotePort })
    renderHistory('direct')
  }
}

async function controlledConnectToServer() {
  const serverUrl = uiManager.getControlledServerUrl()
  connectionManager.saveRoleAndServer('controlled', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controlled')
}

function controlledDisconnectFromServer() {
  signalingManager.disconnect()
}

async function controllerConnectToServer() {
  const serverUrl = uiManager.getControllerServerUrl()
  connectionManager.saveRoleAndServer('controller', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controller')
}

function controllerDisconnectFromServer() {
  signalingManager.disconnect()
}

function connectDevice() {
  const targetDeviceId = uiManager.getTargetDeviceId()
  if (!uiManager._validateDeviceId(targetDeviceId)) {
    alert('请输入有效的设备 ID（需要 6-16 位字符）')
    return false
  }
  if (!signalingManager.signalingClient.isConnected()) {
    alert('未连接到信令服务器，请先连接服务器')
    return false
  }
  if (signalingManager.connectDevice(targetDeviceId)) {
    historyManager.saveToHistory('signaling', {
      deviceId: targetDeviceId,
      serverUrl: uiManager.getControllerServerUrl()
    })
    renderHistory('signaling')
  }
}

function acceptConnection() {
  signalingManager.acceptConnection()
}

function rejectConnection() {
  signalingManager.rejectConnection()
}

function copyDeviceId() {
  uiManager.copyDeviceId(myDeviceId)
}

function showMessage(msg) {
  const msgDiv = document.createElement('div')
  msgDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:8px;font-size:16px;z-index:10000;'
  msgDiv.textContent = msg
  document.body.appendChild(msgDiv)
  setTimeout(() => msgDiv.remove(), 2000)
}

async function setCustomDeviceId() {
  const customIdInput = document.getElementById('customDeviceId')
  const customId = customIdInput.value.trim()
  
  if (!customId) {
    showMessage('请输入设备ID')
    return
  }
  
  try {
    const result = await window.electronAPI.setDeviceId(customId)
    if (result.success) {
      myDeviceId = result.deviceId
      uiManager.setDeviceId(myDeviceId)
      signalingManager.setDeviceId(myDeviceId)
      directManager.setDeviceId(myDeviceId)
      customIdInput.value = ''
      showMessage('设备ID已设置为: ' + myDeviceId)
    }
  } catch (error) {
    showMessage('设置失败: ' + error.message)
  }
}

async function resetDeviceId() {
  if (!confirm('确定要随机生成新的设备ID吗？')) {
    return
  }
  
  try {
    const result = await window.electronAPI.resetDeviceId()
    if (result.success) {
      myDeviceId = result.deviceId
      uiManager.setDeviceId(myDeviceId)
      signalingManager.setDeviceId(myDeviceId)
      directManager.setDeviceId(myDeviceId)
      alert('设备ID已重置为: ' + myDeviceId)
    }
  } catch (error) {
    alert('重置设备ID失败: ' + error.message)
  }
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

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

// 解锁设置相关函数
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

// Credential Provider 相关函数
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
    // 监听进度事件
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

// 服务相关函数
async function checkServiceStatus() {
  try {
    const status = await window.electronAPI.getServiceStatus()
    updateServiceStatus(status)
  } catch (e) {
    console.error('检查服务状态失败:', e)
  }
}

function updateServiceStatus(status) {
  const statusDiv = document.getElementById('serviceStatus')
  const modeSpan = document.getElementById('currentServiceMode')
  const modeProcess = document.getElementById('modeProcess')
  const modeService = document.getElementById('modeService')
  
  if (status.isRunning) {
    statusDiv.innerHTML = `
      <span class="status-icon">✅</span>
      <span class="status-text">服务运行中</span>
    `
  } else {
    statusDiv.innerHTML = `
      <span class="status-icon">⏸️</span>
      <span class="status-text">服务未运行</span>
    `
  }
  
  modeSpan.textContent = (status.mode === 'service' ? '服务模式' : '进程模式')
  
  modeProcess.classList.toggle('active', status.mode === 'process')
  modeService.classList.toggle('active', status.mode === 'service')
}

async function startService() {
  try {
    await window.electronAPI.startService()
    showMessage('服务启动中...')
    setTimeout(() => {
      checkServiceStatus()
    }, 2000)
  } catch (e) {
    console.error('启动服务失败:', e)
    showMessage('启动失败: ' + e.message)
  }
}

async function stopService() {
  try {
    await window.electronAPI.stopService()
    showMessage('服务停止中...')
    setTimeout(() => {
      checkServiceStatus()
    }, 2000)
  } catch (e) {
    console.error('停止服务失败:', e)
    showMessage('停止失败: ' + e.message)
  }
}

async function restartService() {
  try {
    await window.electronAPI.restartService()
    showMessage('服务重启中...')
    setTimeout(() => {
      checkServiceStatus()
    }, 3000)
  } catch (e) {
    console.error('重启服务失败:', e)
    showMessage('重启失败: ' + e.message)
  }
}

async function setServiceMode(mode) {
  try {
    await window.electronAPI.setServiceMode(mode)
    showMessage('模式已切换为' + (mode === 'service' ? '服务模式' : '进程模式'))
    await checkServiceStatus()
  } catch (e) {
    console.error('设置服务模式失败:', e)
    showMessage('设置失败: ' + e.message)
  }
}

async function installWindowsService() {
  if (!confirm('确定要安装 Windows 服务吗？此操作需要管理员权限。')) {
    return
  }
  
  try {
    const result = await window.electronAPI.installServiceWithElevation()
    if (result.success) {
      showMessage('服务安装成功！')
    } else {
      showMessage('服务安装失败: ' + (result.message || '未知错误'))
    }
  } catch (e) {
    console.error('安装 Windows 服务失败:', e)
    showMessage('安装失败: ' + e.message)
  }
}

async function uninstallWindowsService() {
  if (!confirm('确定要卸载 Windows 服务吗？此操作需要管理员权限。')) {
    return
  }
  
  try {
    const result = await window.electronAPI.uninstallServiceWithElevation()
    if (result.success) {
      showMessage('服务卸载成功！')
    } else {
      showMessage('服务卸载失败: ' + (result.message || '未知错误'))
    }
  } catch (e) {
    console.error('卸载 Windows 服务失败:', e)
    showMessage('卸载失败: ' + e.message)
  }
}

// 测试密码可见性
let testUnlockPasswordVisible = false

function toggleTestUnlockPasswordVisibility() {
  const input = document.getElementById('testUnlockPassword')
  const btn = document.getElementById('toggleTestUnlockPasswordBtn')
  testUnlockPasswordVisible = !testUnlockPasswordVisible
  
  if (testUnlockPasswordVisible) {
    input.type = 'text'
    btn.textContent = '👁️‍🗨️'
  } else {
    input.type = 'password'
    btn.textContent = '👁️'
  }
}

// 远程解锁测试相关函数
async function testUnlock() {
  const password = document.getElementById('testUnlockPassword').value
  
  if (!confirm('此测试将锁定屏幕然后尝试自动解锁。确定要继续吗？')) {
    return
  }
  
  const logDiv = document.getElementById('testUnlockLog')
  logDiv.style.display = 'block'
  logDiv.innerHTML = ''
  
  try {
    const result = await window.electronAPI.testUnlock(password)
    
    // 监听测试进度
    window.electronAPI.on('test-unlock-log', (data) => {
      appendTestLog(data.message, data.level || 'info')
    })
    
    appendTestLog('测试完成', 'success')
    
    if (result.unlockSuccess) {
      showMessage('解锁成功！使用的解锁方式: ' + result.unlockMode)
    } else {
      showMessage('解锁失败，请查看日志了解详情。')
    }
  } catch (e) {
    console.error('测试解锁失败:', e)
    appendTestLog('测试失败: ' + e.message, 'error')
    showMessage('测试失败: ' + e.message)
  }
}

async function runFullUnlockTest() {
  const password = document.getElementById('testUnlockPassword').value
  
  const logDiv = document.getElementById('testUnlockLog')
  logDiv.style.display = 'block'
  logDiv.innerHTML = ''
  
  try {
    const result = await window.electronAPI.runFullUnlockTest(password)
    
    appendTestLog('完整测试完成', 'success')
    
    if (result.success) {
      appendTestLog('测试通过: ' + JSON.stringify(result.results), 'success')
      showMessage('完整测试完成！')
    } else {
      appendTestLog('测试失败: ' + (result.error || '未知错误'), 'error')
      showMessage('完整测试失败，请查看日志。')
    }
    
    if (result.logContent) {
      appendTestLog('--- 完整日志 ---', 'info')
      appendTestLog(result.logContent, 'info')
    }
  } catch (e) {
    console.error('运行完整解锁测试失败:', e)
    appendTestLog('完整测试失败: ' + e.message, 'error')
    showMessage('完整测试失败: ' + e.message)
  }
}

function appendTestLog(message, level = 'info') {
  const logDiv = document.getElementById('testUnlockLog')
  const timestamp = new Date().toLocaleTimeString()
  const logLine = document.createElement('div')
  logLine.style.cssText = level === 'error' ? 'color: #dc3545;' : level === 'success' ? 'color: #28a745;' : ''
  logLine.textContent = `[${timestamp}] ${message}`
  logDiv.appendChild(logLine)
  logDiv.scrollTop = logDiv.scrollHeight
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp()
  
  const controlledModeSelect = document.getElementById('controlledConnectionMode')
  const controllerModeSelect = document.getElementById('controllerConnectionMode')
  
  if (controlledModeSelect) {
    controlledModeSelect.addEventListener('change', (e) => {
      signalingManager.setConnectionMode(e.target.value)
    })
  }
  
  if (controllerModeSelect) {
    controllerModeSelect.addEventListener('change', (e) => {
      signalingManager.setConnectionMode(e.target.value)
    })
  }
  
  // 加载解锁密码状态
  setTimeout(() => {
    loadUnlockPasswordStatus()
    checkCredProvider()
    checkServiceStatus()
  }, 500)
})

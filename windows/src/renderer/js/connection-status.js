/**
 * 连接状态管理 — 信令服务器、角色切换、直连、初始化
 *
 * 依赖 app.js 中定义的全局状态 (myDeviceId, uiManager, signalingManager, directManager, log等)。
 * 通过 <script> 标签加载，函数自动注册为全局。
 */

// ==================== 信令服务器管理（设置页面） ====================

function onAddServerClickSettings() {
  const btn = document.getElementById('settingsAddServerBtn')
  const editIndex = btn ? btn.getAttribute('data-edit-index') : null
  if (editIndex !== null && editIndex !== undefined) {
    updateSignalingServerSettings(parseInt(editIndex))
  } else {
    addSignalingServerSettings()
  }
}

let _addingServerSettings = false

async function addSignalingServerSettings() {
  if (_addingServerSettings) return
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('settingsNewServerName')
  const urlInput = document.getElementById('settingsNewServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { showMessage('请输入服务器名称'); return }
  if (!url) { showMessage('请输入服务器地址'); return }

  _addingServerSettings = true
  try {
    await historyManager.addServer(name, url)
    nameInput.value = ''
    urlInput.value = ''
    renderSettingsServerList()
    renderServerList()
    renderServerListControlled()
    showMessage('信令服务器已添加: ' + name)
  } finally {
    _addingServerSettings = false
  }
}

async function updateSignalingServerSettings(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('settingsNewServerName')
  const urlInput = document.getElementById('settingsNewServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { showMessage('请输入服务器名称'); return }
  if (!url) { showMessage('请输入服务器地址'); return }

  await historyManager.editServer(index, name, url)
  nameInput.value = ''
  urlInput.value = ''
  const addBtn = document.getElementById('settingsAddServerBtn')
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
  renderSettingsServerList()
  renderServerList()
  renderServerListControlled()
  showMessage('信令服务器已更新')
}

function editSignalingServerSettings(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const nameInput = document.getElementById('settingsNewServerName')
  const urlInput = document.getElementById('settingsNewServerUrl')
  const addBtn = document.getElementById('settingsAddServerBtn')

  if (nameInput) { nameInput.value = server.name; nameInput.focus() }
  if (urlInput) urlInput.value = server.url
  if (addBtn) {
    addBtn.textContent = '更新'
    addBtn.setAttribute('data-edit-index', index)
  }
}

function cancelEditServerSettings() {
  const nameInput = document.getElementById('settingsNewServerName')
  const urlInput = document.getElementById('settingsNewServerUrl')
  const addBtn = document.getElementById('settingsAddServerBtn')
  if (nameInput) nameInput.value = ''
  if (urlInput) urlInput.value = ''
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
}

async function deleteSignalingServerSettings(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  await historyManager.deleteServer(index)
  renderSettingsServerList()
  renderServerList()
  renderServerListControlled()
  showMessage('信令服务器已删除')
}

function renderSettingsServerList() {
  const listEl = document.getElementById('settingsServerList')
  if (!listEl) return

  if (!historyManager) {
    listEl.innerHTML = '<div class="history-empty">请等待加载完成...</div>'
    return
  }

  const servers = historyManager.getServers()
  if (servers.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无已保存的信令服务器</div>'
    return
  }

  listEl.innerHTML = servers.map((server, index) => {
    const time = new Date(server.timestamp).toLocaleDateString()
    return `<div class="history-item">
      <div class="history-info">
        <div class="history-target">${server.name}</div>
        <div class="history-meta">${server.url} · ${time}</div>
      </div>
      <div class="history-actions">
        <button class="history-btn history-btn-connect" onclick="editSignalingServerSettings(${index})">编辑</button>
        <button class="history-btn history-btn-delete" onclick="deleteSignalingServerSettings(${index})">删除</button>
      </div>
    </div>`
  }).join('')
}

// ==================== 信令服务器列表（主控端 — 快速选择） ====================

function selectServer(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const urlInput = document.getElementById('controllerServerUrl')
  if (urlInput) urlInput.value = server.url
  showMessage('已选择: ' + server.name)
}

function renderServerList() {
  const listEl = document.getElementById('signalingServerList')
  if (!listEl) return

  if (!historyManager) {
    listEl.innerHTML = '<div class="history-empty">请等待加载完成...</div>'
    return
  }

  const servers = historyManager.getServers()
  if (servers.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无已保存的信令服务器<br>请在设置页面添加</div>'
    return
  }

  listEl.innerHTML = servers.map((server, index) => {
    return `<div class="history-item" onclick="selectServer(${index})" title="点击选择此服务器">
      <div class="history-info">
        <div class="history-target">${server.name}</div>
        <div class="history-meta">${server.url}</div>
      </div>
    </div>`
  }).join('')
}

// ==================== 信令服务器列表（被控端 — 快速选择） ====================

function selectServerControlled(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const urlInput = document.getElementById('controlledServerUrl')
  if (urlInput) urlInput.value = server.url
  showMessage('已选择: ' + server.name)
}

function renderServerListControlled() {
  const listEl = document.getElementById('controlledSignalingServerList')
  if (!listEl) return

  if (!historyManager) {
    listEl.innerHTML = '<div class="history-empty">请等待加载完成...</div>'
    return
  }

  const servers = historyManager.getServers()
  if (servers.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无已保存的信令服务器<br>请在设置页面添加</div>'
    return
  }

  listEl.innerHTML = servers.map((server, index) => {
    return `<div class="history-item" onclick="selectServerControlled(${index})" title="点击选择此服务器">
      <div class="history-info">
        <div class="history-target">${server.name}</div>
        <div class="history-meta">${server.url}</div>
      </div>
    </div>`
  }).join('')
}

// ==================== 角色与模式切换 ====================

function selectRole(role) {
  const selectedRole = uiManager.selectRole(role)

  if (selectedRole === 'controlled') {
    initControlled()
  } else {
    initController()
  }
}

function switchControlledMode(mode) {
  if (signalingManager && signalingManager.peerConnection && signalingManager.peerConnection.connectionState === 'connected') {
    if (!confirm('当前有活跃的远程连接，切换模式将断开连接，是否继续？')) {
      return
    }
  }

  currentControlledMode = mode
  uiManager.switchMode('controlled', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  }

  log('被控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function switchControllerMode(mode) {
  if (signalingManager && signalingManager.peerConnection && signalingManager.peerConnection.connectionState === 'connected') {
    if (!confirm('当前有活跃的远程连接，切换模式将断开连接，是否继续？')) {
      return
    }
  }

  currentControllerMode = mode
  uiManager.switchMode('controller', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  } else {
    loadDeviceList()
  }

  log('主控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function goBack() {
  if (signalingManager && signalingManager.peerConnection && signalingManager.peerConnection.connectionState === 'connected') {
    if (!confirm('当前有活跃的远程连接，返回首页将断开连接，是否继续？')) {
      return
    }
  }

  uiManager.goBack()
  stopListening()
  if (signalingManager) {
    signalingManager.disconnect()
  }
}

// ==================== 初始化 ====================

async function initControlled() {
  if (historyManager) await historyManager.initServers()

  myDeviceId = await window.electronAPI.getDeviceId()
  uiManager.setDeviceId(myDeviceId)
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  // 同步设置页的设备ID输入框
  syncSettingsDeviceIdInput(myDeviceId)

  // 初始状态设置为"未连接"（红色指示灯）
  uiManager.updateServerStatus('未连接', 'disconnected')

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

  renderServerListControlled()
  await getLocalIps()

  // 非自启动时加载上次连接配置到输入框
  if (typeof loadLastConnectConfig === 'function') {
    loadLastConnectConfig()
  }
}

async function initController() {
  if (historyManager) await historyManager.initServers()

  myDeviceId = await window.electronAPI.getDeviceId()
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  // 统一设备ID显示（主控端页面）
  const controllerDeviceEl = document.getElementById('controllerDeviceId')
  if (controllerDeviceEl) controllerDeviceEl.textContent = myDeviceId

  // 同步设置页的设备ID输入框
  syncSettingsDeviceIdInput(myDeviceId)

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
    try {
      await directManager.sendMessage({
        type: 'offer',
        offer: data.offer
      })
    } catch (error) {
      log('转发offer失败: ' + error.message)
    }
  })

  window.electronAPI.on('webrtc-answer', async (data) => {
    log('收到远程窗口的answer，转发给被控端')
    try {
      await directManager.sendMessage({
        type: 'answer',
        answer: data.answer
      })
    } catch (error) {
      log('转发answer失败: ' + error.message)
    }
  })

  window.electronAPI.on('webrtc-ice-candidate', async (data) => {
    log('收到远程窗口的ICE候选，转发给被控端')
    try {
      await directManager.sendMessage({
        type: 'ice-candidate',
        candidate: data.candidate
      })
    } catch (error) {
      log('转发ICE候选失败: ' + error.message)
    }
  })

  renderHistory('direct')
  renderHistory('signaling')
  renderServerList()
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

// ==================== 直连 ====================

let _isListening = false
let _isListeningToggling = false

async function startListening() {
  if (_isListeningToggling) return
  const btn = document.querySelector('#controlledDirectSection .btn-danger')
  if (btn) {
    btn.classList.add('btn-loading')
    btn.disabled = true
  }

  console.log('startListening 函数被调用')
  const port = uiManager.getListenPort()
  console.log('获取到的端口:', port)
  if (!uiManager._validatePort(port)) {
    alert('请输入有效的端口号 (1024-65535)')
    if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false }
    return
  }

  _isListeningToggling = true
  console.log('调用 directManager.startListening')
  const success = await directManager.startListening(port)
  _isListeningToggling = false
  _isListening = success

  if (btn) {
    btn.classList.remove('btn-loading')
    btn.disabled = false
  }

  if (success && typeof saveCurrentConnectConfig === 'function') {
    saveCurrentConnectConfig()
  }
}

async function stopListening() {
  if (_isListeningToggling) return

  const btn = document.querySelector('#controlledDirectSection .btn-danger')
  if (btn) {
    btn.classList.add('btn-loading')
    btn.disabled = true
  }

  _isListeningToggling = true
  await directManager.stopListening()
  _isListeningToggling = false
  _isListening = false

  if (btn) {
    btn.classList.remove('btn-loading')
    btn.disabled = false
  }
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

// ==================== 信令连接 ====================

async function controlledConnectToServer() {
  // 如果按钮已禁用，不执行
  const btn = document.getElementById('controlledConnectBtn')
  if (btn && btn.disabled) return

  const serverUrl = uiManager.getControlledServerUrl()
  connectionManager.saveRoleAndServer('controlled', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controlled')
  if (typeof saveCurrentConnectConfig === 'function') {
    saveCurrentConnectConfig()
  }
}

function controlledDisconnectFromServer() {
  // 如果按钮已禁用，不执行
  const btn = document.getElementById('controlledDisconnectBtn')
  if (btn && btn.disabled) return

  signalingManager.disconnect()
}

async function controllerConnectToServer() {
  // 如果按钮已禁用，不执行
  const btn = document.getElementById('controllerConnectBtn')
  if (btn && btn.disabled) return

  const serverUrl = uiManager.getControllerServerUrl()
  connectionManager.saveRoleAndServer('controller', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controller')
}

function controllerDisconnectFromServer() {
  // 如果按钮已禁用，不执行
  const btn = document.getElementById('controllerDisconnectBtn')
  if (btn && btn.disabled) return

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

// ==================== 设备 ID 工具 ====================

function copyDeviceId() {
  uiManager.copyDeviceId(myDeviceId)
}

// 复制主控端设备ID
function copyControllerDeviceId() {
  const el = document.getElementById('controllerDeviceId')
  if (!el || !myDeviceId) return false
  return navigator.clipboard.writeText(myDeviceId).then(() => {
    const originalText = el.textContent
    el.textContent = '已复制!'
    setTimeout(() => { el.textContent = originalText }, 1500)
    return true
  }).catch(err => {
    console.error('复制失败:', err)
    return false
  })
}

// 同步设置页的设备ID输入框
function syncSettingsDeviceIdInput(id) {
  const inputs = document.querySelectorAll('#customDeviceId')
  inputs.forEach(input => { input.value = id })
}

async function setCustomDeviceId() {
  const inputs = document.querySelectorAll('#customDeviceId')
  let customIdInput = null
  for (const input of inputs) {
    if (input.closest('#settingsPage') && input.offsetParent !== null) {
      customIdInput = input
      break
    }
  }
  if (!customIdInput) {
    for (const input of inputs) {
      if (input.offsetParent !== null) {
        customIdInput = input
        break
      }
    }
  }
  if (!customIdInput) {
    customIdInput = inputs[0]
  }
  const customId = customIdInput.value.trim()

  if (!customId) {
    showMessage('请输入设备ID')
    return
  }

  try {
    const result = await window.electronAPI.setDeviceId(customId)
    if (result.success) {
      myDeviceId = result.deviceId
      // 统一更新所有UI
      uiManager.setDeviceId(myDeviceId)
      signalingManager.setDeviceId(myDeviceId)
      directManager.setDeviceId(myDeviceId)
      // 更新主控端设备ID显示
      const controllerDeviceEl = document.getElementById('controllerDeviceId')
      if (controllerDeviceEl) controllerDeviceEl.textContent = myDeviceId
      // 同步所有设置页输入框
      syncSettingsDeviceIdInput(myDeviceId)
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
      // 统一更新所有UI
      uiManager.setDeviceId(myDeviceId)
      signalingManager.setDeviceId(myDeviceId)
      directManager.setDeviceId(myDeviceId)
      // 更新主控端设备ID显示
      const controllerDeviceEl = document.getElementById('controllerDeviceId')
      if (controllerDeviceEl) controllerDeviceEl.textContent = myDeviceId
      // 同步所有设置页输入框
      syncSettingsDeviceIdInput(myDeviceId)
      showMessage('设备ID已重置为: ' + myDeviceId)
    }
  } catch (error) {
    showMessage('重置设备ID失败: ' + error.message)
  }
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

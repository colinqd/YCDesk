/**
 * 连接状态管理 — 信令服务器、角色切换、直连、初始化
 *
 * 依赖 app.js 中定义的全局状态 (myDeviceId, uiManager, signalingManager, directManager, log等)。
 * 通过 <script> 标签加载，函数自动注册为全局。
 */

// ==================== 信令服务器管理（主控端） ====================

function manageSignalingServer() {
  const panel = document.getElementById('serverManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

function onAddServerClick() {
  const btn = document.getElementById('addServerBtn')
  const editIndex = btn ? btn.getAttribute('data-edit-index') : null
  if (editIndex !== null && editIndex !== undefined) {
    updateSignalingServer(parseInt(editIndex))
  } else {
    addSignalingServer()
  }
}

let _addingServer = false

async function addSignalingServer() {
  if (_addingServer) return
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }

  _addingServer = true
  try {
    await historyManager.addServer(name, url)
    nameInput.value = ''
    urlInput.value = ''
    renderServerList()
    log('信令服务器已添加: ' + name)
  } finally {
    _addingServer = false
  }
}

async function updateSignalingServer(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }

  await historyManager.editServer(index, name, url)
  nameInput.value = ''
  urlInput.value = ''
  const addBtn = document.getElementById('addServerBtn')
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
  renderServerList()
  log('信令服务器已更新')
}

function editSignalingServer(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  const addBtn = document.getElementById('addServerBtn')
  const panel = document.getElementById('serverManagePanel')

  if (panel) panel.style.display = 'block'
  if (nameInput) { nameInput.value = server.name; nameInput.focus() }
  if (urlInput) urlInput.value = server.url
  if (addBtn) {
    addBtn.textContent = '更新'
    addBtn.setAttribute('data-edit-index', index)
  }
}

function cancelEditServer() {
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  const addBtn = document.getElementById('addServerBtn')
  if (nameInput) nameInput.value = ''
  if (urlInput) urlInput.value = ''
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
}

async function deleteSignalingServer(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  await historyManager.deleteServer(index)
  renderServerList()
  log('信令服务器已删除')
}

function selectServer(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const urlInput = document.getElementById('controllerServerUrl')
  if (urlInput) urlInput.value = server.url
  log('已选择信令服务器: ' + server.name)
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
    listEl.innerHTML = '<div class="history-empty">暂无已保存的信令服务器<br>请添加后从列表选择</div>'
    return
  }

  listEl.innerHTML = servers.map((server, index) => {
    const time = new Date(server.timestamp).toLocaleDateString()
    return `<div class="history-item" onclick="selectServer(${index})">
      <div class="history-info">
        <div class="history-target">${server.name}</div>
        <div class="history-meta">${server.url} · ${time}</div>
      </div>
      <div class="history-actions">
        <button class="history-btn history-btn-connect" onclick="event.stopPropagation(); editSignalingServer(${index})">编辑</button>
        <button class="history-btn history-btn-delete" onclick="event.stopPropagation(); deleteSignalingServer(${index})">删除</button>
      </div>
    </div>`
  }).join('')
}

// ==================== 信令服务器管理（被控端） ====================

function manageSignalingServerControlled() {
  const panel = document.getElementById('controlledServerManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

function onAddServerClickControlled() {
  const btn = document.getElementById('controlledAddServerBtn')
  const editIndex = btn ? btn.getAttribute('data-edit-index') : null
  if (editIndex !== null && editIndex !== undefined) {
    updateSignalingServerControlled(parseInt(editIndex))
  } else {
    addSignalingServerControlled()
  }
}

let _addingServerControlled = false

async function addSignalingServerControlled() {
  if (_addingServerControlled) return
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }

  _addingServerControlled = true
  try {
    await historyManager.addServer(name, url)
    nameInput.value = ''
    urlInput.value = ''
    renderServerListControlled()
    log('信令服务器已添加: ' + name)
  } finally {
    _addingServerControlled = false
  }
}

async function updateSignalingServerControlled(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }

  await historyManager.editServer(index, name, url)
  nameInput.value = ''
  urlInput.value = ''
  const addBtn = document.getElementById('controlledAddServerBtn')
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
  renderServerListControlled()
  log('信令服务器已更新')
}

function editSignalingServerControlled(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  const addBtn = document.getElementById('controlledAddServerBtn')
  const panel = document.getElementById('controlledServerManagePanel')

  if (panel) panel.style.display = 'block'
  if (nameInput) { nameInput.value = server.name; nameInput.focus() }
  if (urlInput) urlInput.value = server.url
  if (addBtn) {
    addBtn.textContent = '更新'
    addBtn.setAttribute('data-edit-index', index)
  }
}

function cancelEditServerControlled() {
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  const addBtn = document.getElementById('controlledAddServerBtn')
  if (nameInput) nameInput.value = ''
  if (urlInput) urlInput.value = ''
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
}

async function deleteSignalingServerControlled(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  await historyManager.deleteServer(index)
  renderServerListControlled()
  log('信令服务器已删除')
}

function selectServerControlled(index) {
  if (!historyManager) { console.error('historyManager 未初始化'); return }
  const servers = historyManager.getServers()
  if (index >= servers.length) return

  const server = servers[index]
  const urlInput = document.getElementById('controlledServerUrl')
  if (urlInput) urlInput.value = server.url
  log('已选择信令服务器: ' + server.name)
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
    listEl.innerHTML = '<div class="history-empty">暂无已保存的信令服务器<br>请添加后从列表选择</div>'
    return
  }

  listEl.innerHTML = servers.map((server, index) => {
    const time = new Date(server.timestamp).toLocaleDateString()
    return `<div class="history-item" onclick="selectServerControlled(${index})">
      <div class="history-info">
        <div class="history-target">${server.name}</div>
        <div class="history-meta">${server.url} · ${time}</div>
      </div>
      <div class="history-actions">
        <button class="history-btn history-btn-connect" onclick="event.stopPropagation(); editSignalingServerControlled(${index})">编辑</button>
        <button class="history-btn history-btn-delete" onclick="event.stopPropagation(); deleteSignalingServerControlled(${index})">删除</button>
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
  if (typeof saveCurrentConnectConfig === 'function') {
    saveCurrentConnectConfig()
  }
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
      uiManager.setDeviceId(myDeviceId)
      signalingManager.setDeviceId(myDeviceId)
      directManager.setDeviceId(myDeviceId)
      customIdInput.value = myDeviceId
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
      const inputs = document.querySelectorAll('#customDeviceId')
      for (const input of inputs) {
        input.value = myDeviceId
      }
      showMessage('设备ID已重置为: ' + myDeviceId)
    }
  } catch (error) {
    showMessage('重置设备ID失败: ' + error.message)
  }
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

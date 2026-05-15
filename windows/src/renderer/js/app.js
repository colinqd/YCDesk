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
    },
    onWebRTCConnected: (targetDeviceId, serverUrl) => {
      if (targetDeviceId) {
        saveConnectedDevice(targetDeviceId, serverUrl)
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
    while (uiManager.connectionLogDiv.children.length > 200) {
      uiManager.connectionLogDiv.removeChild(uiManager.connectionLogDiv.firstChild)
    }
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

function manageSignalingServer() {
  const panel = document.getElementById('serverManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

// ==================== 设备列表管理 ====================
async function loadDeviceList() {
  try {
    const result = await window.electronAPI.getDeviceList()
    if (result.success) {
      renderDeviceList(result.devices)
    } else {
      log('加载设备列表失败')
    }
  } catch (e) {
    log('加载设备列表异常: ' + e.message)
  }
}

function renderDeviceList(devices) {
  const container = document.getElementById('deviceListContainer')
  if (!container) return

  if (!devices || devices.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无已保存的设备<br>连接成功后会自动添加</div>'
    return
  }

  container.innerHTML = devices.map((device, index) => {
    const alias = device.alias || ''
    const displayName = alias ? `${alias} (${device.deviceId})` : device.deviceId
    const lastConnected = device.lastConnected ? new Date(device.lastConnected).toLocaleDateString('zh-CN') : '未连接'
    
    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${displayName}</div>
          <div class="history-time">最后连接: ${lastConnected}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="connectFromDeviceList('${device.deviceId}')">连接</button>
          <button class="history-btn history-btn-delete" onclick="removeDeviceFromList('${device.deviceId}')">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function manageDeviceList() {
  const panel = document.getElementById('deviceManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

async function addDeviceToList() {
  const deviceIdInput = document.getElementById('newDeviceId')
  const aliasInput = document.getElementById('newDeviceAlias')
  
  if (!deviceIdInput) return
  
  const deviceId = deviceIdInput.value.trim().toUpperCase()
  const alias = aliasInput ? aliasInput.value.trim() : ''
  
  if (!deviceId) {
    log('请输入设备ID')
    return
  }
  
  if (deviceId.length < 6 || deviceId.length > 16) {
    log('设备ID长度必须在6-16个字符之间')
    return
  }
  
  try {
    const serverUrl = document.getElementById('controllerServerUrl')?.value || ''
    const result = await window.electronAPI.addDevice(deviceId, alias, serverUrl)
    
    if (result.success) {
      log(result.message)
      renderDeviceList(result.devices)
      deviceIdInput.value = ''
      if (aliasInput) aliasInput.value = ''
    } else {
      log('添加失败: ' + result.message)
    }
  } catch (e) {
    log('添加设备异常: ' + e.message)
  }
}

async function removeDeviceFromList(deviceId) {
  if (!confirm('确定要删除设备 ' + deviceId + ' 吗？')) {
    return
  }
  
  try {
    const result = await window.electronAPI.removeDevice(deviceId)
    
    if (result.success) {
      log('设备已删除')
      renderDeviceList(result.devices)
    } else {
      log('删除失败: ' + result.message)
    }
  } catch (e) {
    log('删除设备异常: ' + e.message)
  }
}

function cancelDeviceManage() {
  const panel = document.getElementById('deviceManagePanel')
  if (panel) {
    panel.style.display = 'none'
  }
  
  const deviceIdInput = document.getElementById('newDeviceId')
  const aliasInput = document.getElementById('newDeviceAlias')
  if (deviceIdInput) deviceIdInput.value = ''
  if (aliasInput) aliasInput.value = ''
}

function connectFromDeviceList(deviceId) {
  const targetInput = document.getElementById('targetDeviceId')
  if (targetInput) {
    targetInput.value = deviceId
    connectDevice()
  }
}

async function saveConnectedDevice(deviceId, serverUrl) {
  try {
    await window.electronAPI.addDevice(deviceId, '', serverUrl)
    loadDeviceList()
  } catch (e) {
    log('保存设备信息失败: ' + e.message)
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

function addSignalingServer() {
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }
  
  historyManager.addServer(name, url)
  nameInput.value = ''
  urlInput.value = ''
  renderServerList()
  log('信令服务器已添加: ' + name)
}

function updateSignalingServer(index) {
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }
  
  historyManager.editServer(index, name, url)
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

// 被控端信令服务器管理
function manageSignalingServerControlled() {
  const panel = document.getElementById('controlledServerManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

function addSignalingServerControlled() {
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }
  
  historyManager.addServer(name, url)
  nameInput.value = ''
  urlInput.value = ''
  renderServerListControlled()
  log('信令服务器已添加: ' + name)
}

function updateSignalingServerControlled(index) {
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { alert('请输入服务器名称'); return }
  if (!url) { alert('请输入服务器地址'); return }
  
  historyManager.editServer(index, name, url)
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

function deleteSignalingServerControlled(index) {
  historyManager.deleteServer(index)
  renderServerListControlled()
  log('信令服务器已删除')
}

function selectServerControlled(index) {
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

function onAddServerClickControlled() {
  const btn = document.getElementById('controlledAddServerBtn')
  const editIndex = btn ? btn.getAttribute('data-edit-index') : null
  if (editIndex !== null && editIndex !== undefined) {
    updateSignalingServerControlled(parseInt(editIndex))
  } else {
    addSignalingServerControlled()
  }
}

function deleteSignalingServer(index) {
  historyManager.deleteServer(index)
  renderServerList()
  log('信令服务器已删除')
}

function selectServer(index) {
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
    loadDeviceListControlled()
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
  } else {
    loadDeviceList()
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

  renderServerListControlled()
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

function updateServerStatusDisplay(text, type) {
  const badge = document.getElementById('serverStatus')
  if (!badge) return
  const dot = badge.querySelector('.status-dot')
  const textEl = document.getElementById('serverStatusText')
  if (textEl) textEl.textContent = text
  if (badge) {
    badge.classList.remove('connecting', 'error')
    if (type === 'error') badge.classList.add('error')
    else if (type === 'connecting') badge.classList.add('connecting')
  }
  if (dot) {
    dot.classList.remove('connecting', 'error')
    if (type === 'error') dot.classList.add('error')
    else if (type === 'connecting') dot.classList.add('connecting')
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

// ==================== 被控端设备列表管理 ====================
async function loadDeviceListControlled() {
  try {
    const result = await window.electronAPI.getDeviceList()
    if (result.success) {
      renderDeviceListControlled(result.devices)
    }
  } catch (e) {
    log('加载设备列表异常: ' + e.message)
  }
}

function renderDeviceListControlled(devices) {
  const container = document.getElementById('controlledDeviceListContainer')
  if (!container) return

  if (!devices || devices.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无已保存的设备<br>连接成功后会自动添加</div>'
    return
  }

  container.innerHTML = devices.map((device, index) => {
    const alias = device.alias || ''
    const displayName = alias ? `${alias} (${device.deviceId})` : device.deviceId
    const lastConnected = device.lastConnected ? new Date(device.lastConnected).toLocaleDateString('zh-CN') : '未连接'
    
    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${displayName}</div>
          <div class="history-time">最后连接: ${lastConnected}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-delete" onclick="removeDeviceFromListControlled('${device.deviceId}')">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function manageDeviceListControlled() {
  const panel = document.getElementById('controlledDeviceManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

async function addDeviceToListControlled() {
  const deviceIdInput = document.getElementById('controlledNewDeviceId')
  const aliasInput = document.getElementById('controlledNewDeviceAlias')
  
  if (!deviceIdInput) return
  
  const deviceId = deviceIdInput.value.trim().toUpperCase()
  const alias = aliasInput ? aliasInput.value.trim() : ''
  
  if (!deviceId) {
    log('请输入设备ID')
    return
  }
  
  if (deviceId.length < 6 || deviceId.length > 16) {
    log('设备ID长度必须在6-16个字符之间')
    return
  }
  
  try {
    const serverUrl = document.getElementById('controlledServerUrl')?.value || ''
    const result = await window.electronAPI.addDevice(deviceId, alias, serverUrl)
    
    if (result.success) {
      log(result.message)
      renderDeviceListControlled(result.devices)
      deviceIdInput.value = ''
      if (aliasInput) aliasInput.value = ''
    } else {
      log('添加失败: ' + result.message)
    }
  } catch (e) {
    log('添加设备异常: ' + e.message)
  }
}

async function removeDeviceFromListControlled(deviceId) {
  if (!confirm('确定要删除设备 ' + deviceId + ' 吗？')) {
    return
  }
  
  try {
    const result = await window.electronAPI.removeDevice(deviceId)
    
    if (result.success) {
      log('设备已删除')
      renderDeviceListControlled(result.devices)
    } else {
      log('删除失败: ' + result.message)
    }
  } catch (e) {
    log('删除设备异常: ' + e.message)
  }
}

function cancelDeviceManageControlled() {
  const panel = document.getElementById('controlledDeviceManagePanel')
  if (panel) {
    panel.style.display = 'none'
  }
  
  const deviceIdInput = document.getElementById('controlledNewDeviceId')
  const aliasInput = document.getElementById('controlledNewDeviceAlias')
  if (deviceIdInput) deviceIdInput.value = ''
  if (aliasInput) aliasInput.value = ''
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp()
  
  // 加载解锁密码状态
  setTimeout(() => {
    loadUnlockPasswordStatus()
    checkCredProvider()
  }, 500)

  window.electronAPI.on('unlock-state-changed', (data) => {
    console.log('[app.js 全局] 收到 unlock-state-changed IPC: ' + JSON.stringify(data))
    if (data.isLocked) {
      updateServerStatusDisplay('已锁定', 'error')
      log('系统通知：屏幕已锁定（被控端）')
    } else {
      updateServerStatusDisplay('已连接', 'connected')
      log('系统通知：屏幕已解锁（被控端）')
    }

    if (directManager && directManager.dataChannelManager) {
      console.log('[app.js 全局] 通过 directManager 转发锁屏状态到主控端')
      directManager.dataChannelManager.send({ type: 'unlock-state-changed', ...data })
    }
    if (signalingManager && signalingManager.dataChannelManager) {
      console.log('[app.js 全局] 通过 signalingManager 转发锁屏状态到主控端')
      signalingManager.dataChannelManager.send({ type: 'unlock-state-changed', ...data })
    }
  })

  window.electronAPI.on('lock-screen-frame', (data) => {
    if (directManager && directManager.dataChannelManager) {
      directManager.dataChannelManager.send({ type: 'lock-screen-frame', ...data })
    }
    if (signalingManager && signalingManager.dataChannelManager) {
      signalingManager.dataChannelManager.send({ type: 'lock-screen-frame', ...data })
    }
  })
})

// === 屏幕捕获源选择 ===
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

// 被控端信令服务器管理函数暴露到window
window.manageSignalingServerControlled = manageSignalingServerControlled
window.addSignalingServerControlled = addSignalingServerControlled
window.onAddServerClickControlled = onAddServerClickControlled
window.editSignalingServerControlled = editSignalingServerControlled
window.deleteSignalingServerControlled = deleteSignalingServerControlled
window.selectServerControlled = selectServerControlled
window.cancelEditServerControlled = cancelEditServerControlled

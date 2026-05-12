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
  
  if (nameInput) nameInput.value = server.name
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
  
  if (nameInput) nameInput.value = server.name
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
  
  const pages = document.querySelectorAll('.page')
  pages.forEach(page => page.classList.remove('active'))
  
  const settingsPage = document.getElementById('settingsPage')
  if (settingsPage) {
    settingsPage.classList.add('active')
  }
  
  log('打开设置页面')
}

function closeSettingsPage() {
  const settingsPage = document.getElementById('settingsPage')
  if (settingsPage) {
    settingsPage.classList.remove('active')
  }
  
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

function updateServerStatusDisplay(text, type) {
  const badge = document.getElementById('serverStatus')
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
})

window.manageSignalingServerControlled = manageSignalingServerControlled
window.addSignalingServerControlled = addSignalingServerControlled
window.onAddServerClickControlled = onAddServerClickControlled
window.editSignalingServerControlled = editSignalingServerControlled
window.deleteSignalingServerControlled = deleteSignalingServerControlled
window.selectServerControlled = selectServerControlled
window.cancelEditServerControlled = cancelEditServerControlled

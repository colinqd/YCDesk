import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { registerPlugin } from '@capacitor/core';
import './shared/config.js';
import './shared/device-id-manager.js';

import s from './modules/state.js';
import { InputDispatcher, createGestureHandler, convertToInputCommand } from './modules/input.js';
import { handleReceivedInput, simulateMouseMove, simulateMouseDown, simulateMouseUp, simulateWheel, simulateKeyDown, simulateKeyUp } from './modules/input-executor.js';
import { buildWsUrl, buildHttpUrl, setConnectionMode, startWsHeartbeat, stopWsHeartbeat, wsSend, isSocketConnected, handleWsMessage, connectToServer, disconnectFromServer, attemptReconnect, cancelReconnect, sendDirectMessage, extractHostname, isIpAddress, resolveHostname } from './modules/signaling.js';
import { getIceConfig, startDirectControllerConnection, handleDirectOffer, handleDirectAnswer, handleRenegotiationAnswer, handleDirectIceCandidate, handleRenegotiationOffer, setupDataChannel, createPeerConnection, startControllerConnection, startControlledConnection, handleOffer, startAndroidScreenCapture, handleAnswer, addPendingIceCandidates, handleIceCandidate } from './modules/webrtc.js';
import { updateVideoTransformGlobal, resetZoomAndPan, toggleMouseMode, toggleControlsExpand, toggleControlsHide, showControls, resetDimTimer, handleOrientationChange, showFloatingMouse, hideFloatingMouse, handleFloatingMouseEvent, toggleFullscreen, handleRemoteLockStateChanged, setupRemoteScreenInteraction } from './modules/ui.js';
import { cycleKeyboardPosition, cycleKeyboardSize, cycleKeyboardOpacity, applyKeyboardPosition, ensureKeyboardInBounds, applyKeyboardSize, applyKeyboardOpacity, saveKeyboardSettings, loadKeyboardSettings, setupKeyboardDrag, toggleKeyboard, sendKey, toggleModifier, toggleSystemKeyboard, setupSystemKeyboardListener, toggleSpecialKeys, setupSystemKbBarDrag } from './modules/keyboard.js';
import { updateScreenSize, showRemoteScreen, updateContainerSizeAfterVideoLoad, hideRemoteScreen, startStatsMonitoring, stopStatsMonitoring, toggleStatsOverlay, initStatsVisibility } from './modules/screen.js';
import FileTransferManager from './modules/file-transfer.js';

const TCPSocket = registerPlugin('TCPSocket');
const FloatingMouse = registerPlugin('FloatingMouse');
const InputExecutor = registerPlugin('InputExecutor');
const ScreenCapture = registerPlugin('ScreenCapture');

let deviceIdManager = null;

function log(message) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (s.connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    s.connectionLogDiv.appendChild(div)
    while (s.connectionLogDiv.children.length > 200) {
      s.connectionLogDiv.removeChild(s.connectionLogDiv.firstChild)
    }
    s.connectionLogDiv.scrollTop = s.connectionLogDiv.scrollHeight
  }
}
window.log = log

function getServerUrl() {
  const input = document.getElementById('serverUrl')
  return input ? input.value.trim() : ''
}

function getControlledServerUrl() {
  const input = document.getElementById('controlledServerUrl')
  return input ? input.value.trim() : ''
}

function updateDeviceIdDisplay() {
  const deviceIdEl = document.getElementById('deviceId')
  if (deviceIdEl) {
    deviceIdEl.textContent = s.myDeviceId
  }
}

async function setCustomDeviceId() {
  const customIdInput = document.getElementById('customDeviceId')
  const customId = customIdInput.value.trim()
  
  if (!customId) {
    showToast('请输入设备ID')
    return
  }
  
  try {
    deviceIdManager.setDeviceId(customId)
    s.myDeviceId = deviceIdManager.getDeviceId()
    updateDeviceIdDisplay()
    customIdInput.value = ''
    showToast('设备ID已设置为: ' + s.myDeviceId)
  } catch (error) {
    showToast('设置失败: ' + error.message)
  }
}

async function resetDeviceId() {
  if (!confirm('确定要随机生成新的设备ID吗？')) {
    return
  }
  
  try {
    s.myDeviceId = deviceIdManager.resetDeviceId()
    updateDeviceIdDisplay()
    showToast('设备ID已重置为: ' + s.myDeviceId)
  } catch (error) {
    showToast('重置失败: ' + error.message)
  }
}

function showToast(message, duration = 3000) {
  const existing = document.querySelector('.toast-message')
  if (existing) existing.remove()
  
  const toast = document.createElement('div')
  toast.className = 'toast-message'
  toast.textContent = message
  document.body.appendChild(toast)
  
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, duration)
}
window.showToast = showToast

function updateServerStatus(text, status) {
  const statusEl = document.getElementById('serverStatusText')
  const statusDot = document.querySelector('.status-dot')
  
  if (statusEl) statusEl.textContent = text
  if (statusDot) {
    statusDot.className = 'status-dot'
    if (status === 'connected') statusDot.classList.add('connected')
    else if (status === 'connecting') statusDot.classList.add('connecting')
    else if (status === 'error') statusDot.classList.add('error')
  }
}
window.updateServerStatus = updateServerStatus

async function copyDeviceId() {
  try {
    await navigator.clipboard.writeText(s.myDeviceId)
    showToast('设备 ID 已复制')
  } catch (e) {
    showToast('复制失败')
  }
}

function loadServers() {
  try {
    return JSON.parse(localStorage.getItem(s.STORAGE_KEYS.SIGNALING_SERVERS) || '[]')
  } catch (e) {
    return []
  }
}

function saveServers(servers) {
  try {
    localStorage.setItem(s.STORAGE_KEYS.SIGNALING_SERVERS, JSON.stringify(servers))
  } catch (e) {
    console.error('保存信令服务器列表失败:', e)
  }
}

function addSignalingServer() {
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { showToast('请输入服务器名称'); return }
  if (!url) { showToast('请输入服务器地址'); return }
  
  const servers = loadServers()
  servers.unshift({ name, url, timestamp: Date.now() })
  saveServers(servers)
  
  nameInput.value = ''
  urlInput.value = ''
  renderServerList()
  showToast('服务器已添加')
}

function editSignalingServer(index) {
  const servers = loadServers()
  if (index >= servers.length) return
  
  const server = servers[index]
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  const addBtn = document.getElementById('addServerBtn')
  const panel = document.getElementById('serverManagePanel')
  
  if (nameInput) nameInput.value = server.name
  if (urlInput) urlInput.value = server.url
  if (addBtn) {
    addBtn.textContent = '更新'
    addBtn.setAttribute('data-edit-index', index)
  }
  if (panel) {
    panel.style.display = 'block'
  }
  showToast('编辑服务器: ' + server.name)
}

function updateSignalingServer(index) {
  const servers = loadServers()
  if (index >= servers.length) return
  
  const nameInput = document.getElementById('newServerName')
  const urlInput = document.getElementById('newServerUrl')
  if (!nameInput || !urlInput) return
  
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  
  if (!name) { showToast('请输入服务器名称'); return }
  if (!url) { showToast('请输入服务器地址'); return }
  
  servers[index] = { name, url, timestamp: Date.now() }
  saveServers(servers)
  
  nameInput.value = ''
  urlInput.value = ''
  const addBtn = document.getElementById('addServerBtn')
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
  renderServerList()
  showToast('服务器已更新')
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

  if (!name) { showToast('请输入服务器名称'); return }
  if (!url) { showToast('请输入服务器地址'); return }

  const servers = loadServers()
  servers.unshift({ name, url, timestamp: Date.now() })
  saveServers(servers)

  nameInput.value = ''
  urlInput.value = ''
  renderServerListControlled()
  showToast('服务器已添加')
}

function updateSignalingServerControlled(index) {
  const servers = loadServers()
  if (index >= servers.length) return

  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  if (!nameInput || !urlInput) return

  const name = nameInput.value.trim()
  const url = urlInput.value.trim()

  if (!name) { showToast('请输入服务器名称'); return }
  if (!url) { showToast('请输入服务器地址'); return }

  servers[index] = { name, url, timestamp: Date.now() }
  saveServers(servers)

  nameInput.value = ''
  urlInput.value = ''
  const addBtn = document.getElementById('controlledAddServerBtn')
  if (addBtn) {
    addBtn.textContent = '添加'
    addBtn.removeAttribute('data-edit-index')
  }
  renderServerListControlled()
  showToast('服务器已更新')
}

function editSignalingServerControlled(index) {
  const servers = loadServers()
  if (index >= servers.length) return

  const server = servers[index]
  const nameInput = document.getElementById('controlledNewServerName')
  const urlInput = document.getElementById('controlledNewServerUrl')
  const addBtn = document.getElementById('controlledAddServerBtn')
  const panel = document.getElementById('controlledServerManagePanel')

  if (nameInput) nameInput.value = server.name
  if (urlInput) urlInput.value = server.url
  if (addBtn) {
    addBtn.textContent = '更新'
    addBtn.setAttribute('data-edit-index', index)
  }
  if (panel) {
    panel.style.display = 'block'
  }
  showToast('编辑服务器: ' + server.name)
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
  const servers = loadServers()
  if (index >= servers.length) return
  servers.splice(index, 1)
  saveServers(servers)
  renderServerListControlled()
  showToast('服务器已删除')
}

function selectServerControlled(index) {
  const servers = loadServers()
  if (index >= servers.length) return

  const server = servers[index]
  const urlInput = document.getElementById('controlledServerUrl')
  if (urlInput) urlInput.value = server.url
  showToast('已选择: ' + server.name)
}

function renderServerListControlled() {
  const listEl = document.getElementById('controlledSignalingServerList')
  if (!listEl) return

  const servers = loadServers()
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
      <div class="history-actions" style="flex-shrink: 0;">
        <button class="history-btn history-btn-connect" onclick="event.stopPropagation(); editSignalingServerControlled(${index})">编辑</button>
        <button class="history-btn history-btn-delete" onclick="event.stopPropagation(); deleteSignalingServerControlled(${index})">删除</button>
      </div>
    </div>`
  }).join('')
}

// ==================== 设备列表管理 ====================
const DEVICE_LIST_KEY = 'ycdesk_device_list'

function loadDeviceList() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_LIST_KEY) || '[]')
  } catch (e) {
    return []
  }
}

function saveDeviceList(devices) {
  try {
    localStorage.setItem(DEVICE_LIST_KEY, JSON.stringify(devices))
  } catch (e) {
    console.error('保存设备列表失败:', e)
  }
}

function renderDeviceList() {
  const container = document.getElementById('deviceListContainer')
  if (!container) return

  const devices = loadDeviceList()
  if (devices.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无已保存的设备<br>连接成功后会自动添加</div>'
    return
  }

  container.innerHTML = devices.map((device, index) => {
    const alias = device.alias || ''
    const displayName = alias ? `${alias} (${device.deviceId})` : device.deviceId
    const lastConnected = device.lastConnected ? new Date(device.lastConnected).toLocaleDateString() : '未连接'
    
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

function addDeviceToList() {
  const deviceIdInput = document.getElementById('newDeviceId')
  const aliasInput = document.getElementById('newDeviceAlias')
  
  if (!deviceIdInput) return
  
  const deviceId = deviceIdInput.value.trim().toUpperCase()
  const alias = aliasInput ? aliasInput.value.trim() : ''
  
  if (!deviceId) {
    showToast('请输入设备ID')
    return
  }
  
  if (deviceId.length < 6 || deviceId.length > 16) {
    showToast('设备ID长度必须在6-16个字符之间')
    return
  }
  
  const devices = loadDeviceList()
  const existingIndex = devices.findIndex(d => d.deviceId === deviceId)
  
  if (existingIndex !== -1) {
    devices[existingIndex] = {
      ...devices[existingIndex],
      alias: alias || devices[existingIndex].alias,
      lastConnected: Date.now()
    }
    showToast('设备已更新')
  } else {
    devices.push({
      deviceId: deviceId,
      alias: alias,
      createdAt: Date.now(),
      lastConnected: Date.now()
    })
    showToast('设备已添加')
  }
  
  saveDeviceList(devices)
  renderDeviceList()
  
  deviceIdInput.value = ''
  if (aliasInput) aliasInput.value = ''
}

function removeDeviceFromList(deviceId) {
  if (!confirm('确定要删除设备 ' + deviceId + ' 吗？')) {
    return
  }
  
  const devices = loadDeviceList()
  const index = devices.findIndex(d => d.deviceId === deviceId)
  
  if (index !== -1) {
    devices.splice(index, 1)
    saveDeviceList(devices)
    renderDeviceList()
    showToast('设备已删除')
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

function saveConnectedDevice(deviceId) {
  if (!deviceId) return
  
  const devices = loadDeviceList()
  const existingIndex = devices.findIndex(d => d.deviceId === deviceId)
  
  if (existingIndex !== -1) {
    devices[existingIndex].lastConnected = Date.now()
  } else {
    devices.push({
      deviceId: deviceId,
      alias: '',
      createdAt: Date.now(),
      lastConnected: Date.now()
    })
  }
  
  saveDeviceList(devices)
  renderDeviceList()
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
  const servers = loadServers()
  if (index >= servers.length) return
  servers.splice(index, 1)
  saveServers(servers)
  renderServerList()
  showToast('服务器已删除')
}

function selectServer(index) {
  const servers = loadServers()
  if (index >= servers.length) return
  
  const server = servers[index]
  const urlInput = document.getElementById('serverUrl')
  if (urlInput) urlInput.value = server.url
  showToast('已选择: ' + server.name)
}

function renderServerList() {
  const listEl = document.getElementById('signalingServerList')
  if (!listEl) return
  
  const servers = loadServers()
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
      <div class="history-actions" style="flex-shrink: 0;">
        <button class="history-btn history-btn-connect" onclick="event.stopPropagation(); editSignalingServer(${index})">编辑</button>
        <button class="history-btn history-btn-delete" onclick="event.stopPropagation(); deleteSignalingServer(${index})">删除</button>
      </div>
    </div>`
  }).join('')
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

function manageSignalingServer() {
  const panel = document.getElementById('serverManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

function saveToHistory(type, data) {
  try {
    const key = type === 'direct' ? s.STORAGE_KEYS.DIRECT_HISTORY : s.STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    
    const existing = history.findIndex(item => {
      if (type === 'direct') return item.ip === data.ip && item.port === data.port
      return item.serverUrl === data.serverUrl
    })
    
    if (existing >= 0) {
      history.splice(existing, 1)
    }
    
    history.unshift({ ...data, timestamp: Date.now() })
    
    if (history.length > s.MAX_HISTORY_ITEMS) {
      history = history.slice(0, s.MAX_HISTORY_ITEMS)
    }
    
    localStorage.setItem(key, JSON.stringify(history))
  } catch (e) {
    console.error('保存历史记录失败:', e)
  }
}

function loadHistory(type) {
  try {
    const key = type === 'direct' ? s.STORAGE_KEYS.DIRECT_HISTORY : s.STORAGE_KEYS.SIGNALING_HISTORY
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch (e) {
    return []
  }
}

function deleteFromHistory(type, index) {
  try {
    const key = type === 'direct' ? s.STORAGE_KEYS.DIRECT_HISTORY : s.STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    history.splice(index, 1)
    localStorage.setItem(key, JSON.stringify(history))
    renderHistory(type)
  } catch (e) {
    console.error('删除历史记录失败:', e)
  }
}

function renderHistory(type) {
  const history = loadHistory(type)
  const listId = type === 'direct' ? 'directHistoryList' : 'signalingHistoryList'
  const listEl = document.getElementById(listId)
  
  if (!listEl) return
  
  if (history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史连接记录</div>'
    return
  }
  
  listEl.innerHTML = history.map((item, index) => {
    if (type === 'direct') {
      return `<div class="history-item" onclick="reconnectFromHistory('direct', ${index})">
        <span class="history-text">${item.ip}:${item.port}</span>
        <button class="history-delete" onclick="event.stopPropagation(); deleteFromHistory('direct', ${index})">×</button>
      </div>`
    } else {
      return `<div class="history-item" onclick="reconnectFromHistory('signaling', ${index})">
        <span class="history-text">${item.serverUrl}</span>
        <button class="history-delete" onclick="event.stopPropagation(); deleteFromHistory('signaling', ${index})">×</button>
      </div>`
    }
  }).join('')
}

function reconnectFromHistory(type, index) {
  const history = loadHistory(type)
  if (index >= history.length) return
  
  const item = history[index]
  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('serverUrl').value = item.serverUrl
    manualConnectToServer()
  }
}

function selectRole(role) {
  s.currentRole = role
  document.getElementById('rolePage').classList.remove('active')
  
  if (role === 'controller') {
    document.getElementById('controllerPage').classList.add('active')
    s.connectionLogDiv = document.getElementById('connectionLog')
    initController()
  } else {
    document.getElementById('controlledPage').classList.add('active')
    s.connectionLogDiv = document.getElementById('connectionLogControlled')
    initControlled()
  }
}

function goBack() {
  s.currentRole = null
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('rolePage').classList.add('active')
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

function switchControllerMode(mode) {
  s.controllerMode = mode
  document.querySelectorAll('#controllerPage .mode-tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#controllerPage .mode-content').forEach(c => c.classList.remove('active'))
  
  if (mode === 'direct') {
    document.querySelector('#controllerPage .mode-tab:first-child').classList.add('active')
    document.getElementById('controllerDirectMode').classList.add('active')
  } else {
    document.querySelector('#controllerPage .mode-tab:last-child').classList.add('active')
    document.getElementById('controllerSignalingMode').classList.add('active')
    renderDeviceList()
  }
}

function switchControlledMode(mode) {
  s.controlledMode = mode
  document.querySelectorAll('#controlledPage .mode-tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#controlledPage .mode-content').forEach(c => c.classList.remove('active'))
  
  if (mode === 'direct') {
    document.querySelector('#controlledPage .mode-tab:first-child').classList.add('active')
    document.getElementById('controlledDirectMode').classList.add('active')
  } else {
    document.querySelector('#controlledPage .mode-tab:last-child').classList.add('active')
    document.getElementById('controlledSignalingMode').classList.add('active')
  }
}

function manualConnectToServer() {
  connectToServer(getServerUrl(), 'controller')
}

function controlledConnectToServer() {
  connectToServer(getControlledServerUrl(), 'controlled')
}

function controlledDisconnectFromServer() {
  disconnectFromServer()
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase()
  const serverUrl = getServerUrl()
  
  if (!targetId) {
    showToast('请输入设备 ID')
    return
  }
  if (targetId.length < 6 || targetId.length > 16) {
    showToast('设备 ID 格式不正确（需要 6-16 位字符）')
    return
  }
  if (!isSocketConnected()) {
    showToast('未连接到信令服务器，请先连接服务器')
    return
  }
  
  s.incomingFromDeviceId = targetId
  wsSend('connect-request', {
    fromDeviceId: s.myDeviceId,
    toDeviceId: targetId
  })
  
  showToast('连接请求已发送，请等待对方确认...')
}

function showIncomingConnectionDialog(fromDeviceId) {
  if (confirm('设备 ' + fromDeviceId + ' 请求连接，是否接受？')) {
    acceptConnection()
  } else {
    rejectConnection()
  }
}

async function acceptConnection() {
  if (!isSocketConnected()) return
  wsSend('connection-response', {
    sessionId: s.currentSessionId,
    accepted: true,
    fromDeviceId: s.incomingFromDeviceId,
    toDeviceId: s.myDeviceId
  })
  showToast('已接受连接')
  await startControlledConnection()
}

function rejectConnection() {
  if (!isSocketConnected()) return
  wsSend('connection-response', {
    sessionId: s.currentSessionId,
    accepted: false,
    fromDeviceId: s.incomingFromDeviceId,
    toDeviceId: s.myDeviceId
  })
}

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  try {
    log('正在启动TCP服务器，端口: ' + port)
    const result = await TCPSocket.startServer({ port })
    
    if (result.success) {
      log('TCP服务器已启动，监听端口: ' + port)
      updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
      showToast('已开始监听')
    } else {
      log('启动TCP服务器失败: ' + result.error)
      showToast('启动监听失败: ' + result.error)
    }
  } catch (error) {
    log('启动TCP服务器异常: ' + error.message)
    showToast('启动监听失败')
  }
}

async function stopListening() {
  try {
    await TCPSocket.stopServer()
    log('TCP服务器已停止')
    updateServerStatus('就绪', 'disconnected')
  } catch (error) {
    log('停止TCP服务器失败: ' + error.message)
  }
}

async function connectDirect() {
  const remoteIp = document.getElementById('remoteIp').value.trim()
  const remotePort = parseInt(document.getElementById('remotePort').value)
  
  if (!remoteIp) {
    showToast('请输入对方IP地址或域名')
    return
  }
  
  if (isNaN(remotePort) || remotePort < 1024 || remotePort > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  if (s.currentDirectClientId) {
    log('清理旧连接...')
    stopHeartbeat()
    try { await TCPSocket.disconnect({ clientId: s.currentDirectClientId }) } catch(e) {}
    s.currentDirectClientId = null
  }
  if (s.directPeerConnection) {
    s.directPeerConnection.close()
    s.directPeerConnection = null
  }
  if (s.dataChannel) {
    s.dataChannel = null
  }
  if (s.inputChannel) {
    s.inputChannel = null
    s.inputChannelReady = false
  }
  s.isDirectControllerMode = false
  s.isWaitingRenegotiation = false
  s.pendingDirectIceCandidates = []
  
  let resolvedHost = remoteIp
  if (!isIpAddress(remoteIp)) {
    log('检测到域名，正在解析: ' + remoteIp)
    const dnsResult = await resolveHostname(remoteIp)
    if (dnsResult.success) {
      resolvedHost = dnsResult.ipAddress
      log('域名解析成功: ' + remoteIp + ' -> ' + resolvedHost)
    } else {
      log('域名解析失败，尝试直接连接: ' + dnsResult.error)
    }
  }
  
  saveToHistory('direct', { ip: remoteIp, port: remotePort })
  
  log('正在连接到 ' + remoteIp + (resolvedHost !== remoteIp ? ' (' + resolvedHost + ')' : '') + ':' + remotePort + '...')
  
  try {
    const result = await TCPSocket.connect({ host: resolvedHost, port: remotePort })
    
    if (result.success) {
      s.currentDirectClientId = result.clientId
      log('TCP连接成功，clientId: ' + s.currentDirectClientId)
      showToast('已连接到服务器')
      
      startHeartbeat()
      
      await startDirectControllerConnection()
    } else {
      log('TCP连接失败: ' + result.error)
      showToast('连接失败: ' + result.error)
    }
  } catch (error) {
    log('TCP连接异常: ' + error.message)
    showToast('连接失败')
  }
}

function startHeartbeat() {
  stopHeartbeat()
  
  s.heartbeatInterval = setInterval(() => {
    if (s.currentDirectClientId) {
      sendDirectMessage(s.currentDirectClientId, { type: 'heartbeat' })
    }
  }, 5000)
  
  log('心跳已启动，每5秒发送一次')
}

function stopHeartbeat() {
  if (s.heartbeatInterval) {
    clearInterval(s.heartbeatInterval)
    s.heartbeatInterval = null
    log('心跳已停止')
  }
}

async function handleDirectMessage(message) {
  try {
    switch (message.type) {
      case 'offer':
        if (s.directPeerConnection && s.directPeerConnection.connectionState === 'connected') {
          await handleRenegotiationOffer(message.offer)
        } else {
          await handleDirectOffer(message.offer)
        }
        break
      case 'answer':
        if (s.directPeerConnection && s.isDirectControllerMode && s.directPeerConnection.signalingState === 'have-local-offer') {
          await handleRenegotiationAnswer(message.answer)
        } else {
          await handleDirectAnswer(message.answer)
        }
        break
      case 'ice-candidate':
        await handleDirectIceCandidate(message.candidate)
        break
      case 'offer-with-video':
        await handleRenegotiationOffer(message.offer)
        break
      case 'heartbeat':
        break
      default:
        log('未知TCP消息类型: ' + message.type)
    }
  } catch (error) {
    log('处理TCP消息失败: ' + error.message)
  }
}

async function initController() {
  log('YCDesk Android 主控端初始化完成，设备ID: ' + s.myDeviceId)
  renderHistory('direct')
  renderHistory('signaling')
  renderServerList()
  
  try {
    const serviceResult = await FloatingMouse.startService()
    log('悬浮鼠标服务已启动')
    
    FloatingMouse.addListener('mouseEvent', (event) => {
      handleFloatingMouseEvent(event)
    })
    log('悬浮鼠标事件监听已注册')
  } catch (e) {
    log('启动悬浮鼠标服务失败: ' + e.message)
  }
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === s.currentDirectClientId) {
      s.currentDirectClientId = null
      s.isConnected = false
      stopHeartbeat()
      hideFloatingMouse()
      showToast('连接已断开')
    }
  })
}

async function initControlled() {
  document.getElementById('deviceId').textContent = s.myDeviceId
  s.isAndroidControlled = true
  log('YCDesk Android 被控端初始化完成，设备ID: ' + s.myDeviceId)
  log('Android端被控模式已启用，可以接收来自Windows端的控制指令')
  
  try {
    await InputExecutor.setControlledMode({ enabled: true })
    log('InputExecutor被控模式已启用')
  } catch (e) {
    log('设置InputExecutor模式失败: ' + e.message)
  }
  
  renderServerListControlled()
  
  const localIpList = document.getElementById('localIpList')
  if (localIpList) {
    localIpList.innerHTML = '<div class="ip-item">Android端暂不支持获取本机IP，请使用Windows端显示的IP地址</div>'
  }
  
  TCPSocket.addListener('incomingConnection', async (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    s.currentDirectClientId = data.clientId
    s.isAndroidControlled = true
    try {
      await InputExecutor.setControlledMode({ enabled: true })
    } catch (e) {
      log('设置InputExecutor模式失败: ' + e.message)
    }
    showToast('收到连接请求，正在建立连接...')
  })
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === s.currentDirectClientId) {
      s.currentDirectClientId = null
      s.isConnected = false
      s.isAndroidControlled = false
      InputExecutor.setControlledMode({ enabled: false }).catch(() => {})
    }
  })
}

function sendPhysicalKeyEvent(eventType, e) {
  if (!s.isConnected) return
  
  const keyEvent = {
    type: eventType,
    code: e.code,
    key: e.key,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey
  }
  
  const inputCommand = convertToInputCommand(keyEvent)
  const message = JSON.stringify(inputCommand)

  // 优先使用 control 通道（可靠，已知可用）
  if (s.dataChannel && s.dataChannel.readyState === 'open') {
    s.dataChannel.send(message)
  } else if (s.inputChannel && s.inputChannel.readyState === 'open') {
    if (s.inputChannel.bufferedAmount < 65536) {
      s.inputChannel.send(message)
    }
  }
}

function disconnect() {
  if (confirm('确定要断开连接吗？')) {
    stopHeartbeat()
    hideFloatingMouse()
    if (s.dataChannel) {
      s.dataChannel.close()
      s.dataChannel = null
    }
    if (s.peerConnection) {
      s.peerConnection.close()
      s.peerConnection = null
    }
    if (s.directPeerConnection) {
      s.directPeerConnection.close()
      s.directPeerConnection = null
    }
    if (s.currentDirectClientId) {
      TCPSocket.disconnect({ clientId: s.currentDirectClientId })
      s.currentDirectClientId = null
    }
    s.isConnected = false
    s.isController = false
    s.keyboardVisible = false
    const keyboardOverlay = document.getElementById('keyboardOverlay')
    if (keyboardOverlay) keyboardOverlay.classList.remove('active')
    
    if (s.matrixTransformer) {
        s.matrixTransformer.fullReset()
    }
    
    hideRemoteScreen()
    showToast('已断开连接')
  }
}

var exitBehavior = (function() {
  try { return localStorage.getItem('ycdesk_exit_behavior') || 'lock_and_disconnect' } catch(e) { return 'lock_and_disconnect' }
})()

function disconnectAndLock() {
  if (confirm('确定要退出连接并锁定远程屏幕吗？')) {
    if (s.inputDispatcher && s.inputDispatcher.sendInputCommand) {
      s.inputDispatcher.sendInputCommand({ type: 'lock_screen' })
    }
    setTimeout(function() { disconnect() }, 500)
  }
}

function toggleExitMode() {
  exitBehavior = exitBehavior === 'disconnect_only' ? 'lock_and_disconnect' : 'disconnect_only'
  try { localStorage.setItem('ycdesk_exit_behavior', exitBehavior) } catch(e) {}
  updateExitBtnDisplay()
  showToast(exitBehavior === 'lock_and_disconnect' ? '退出模式：退出并锁屏' : '退出模式：仅退出')
}

function updateExitBtnDisplay() {
  var btn = document.getElementById('exitBtn')
  if (!btn) return
  if (exitBehavior === 'lock_and_disconnect') {
    btn.textContent = '✕ 锁'
    btn.style.background = '#e94560'
  } else {
    btn.textContent = '✕'
    btn.style.background = ''
  }
}

function handleExit() {
  if (exitBehavior === 'lock_and_disconnect') {
    disconnectAndLock()
  } else {
    disconnect()
  }
}

function requestUnlock() {
  console.log('[requestUnlock] Sending unlock request to controlled end...')
  
  const inputDispatcher = s.inputDispatcher
  if (!inputDispatcher) {
    showToast('Input dispatcher not initialized')
    return
  }
  
  const command = {
    type: 'unlock_screen',
    password: ''  // Empty password triggers auto-fill from CP/credentials
  }
  
  inputDispatcher.sendInputCommand(command)
  showToast('Unlock request sent')
  
  // Also send Enter key to dismiss the lock screen wallpaper
  setTimeout(() => {
    const enterCommand = {
      type: 'keydown',
      code: 'Enter',
      key: 'Enter'
    }
    inputDispatcher.sendInputCommand(enterCommand)
  }, 500)
}

function requestLock() {
  console.log('[requestLock] Sending lock request to controlled end...')
  
  const inputDispatcher = s.inputDispatcher
  if (!inputDispatcher) {
    showToast('Input dispatcher not initialized')
    return
  }
  
  const command = {
    type: 'lock_screen'
  }
  
  inputDispatcher.sendInputCommand(command)
  showToast('Lock request sent')
}

async function init() {
  console.log('YCDesk Android 初始化')
  
  deviceIdManager = new DeviceIdManager(CONFIG)
  
  try {
    const deviceInfo = await Device.getInfo()
    console.log('设备信息:', deviceInfo)
  } catch (e) {
    console.log('获取设备信息失败')
  }
  
  s.myDeviceId = deviceIdManager.getDeviceId()
  
  const networkStatus = await Network.getStatus()
  console.log('网络状态:', networkStatus)
  
  Network.addListener('networkStatusChange', (status) => {
    console.log('网络状态变化:', status)
    if (!status.connected) {
      showToast('网络已断开')
      if (s.connectionStatus === s.CONNECTION_STATUS.CONNECTED) {
        attemptReconnect()
      }
    }
  })
  
  App.addListener('backButton', ({ canGoBack }) => {
    if (s.isConnected) {
      disconnect()
    } else if (s.currentRole) {
      goBack()
    } else {
      App.exitApp()
    }
  })
  
  window.addEventListener('orientationchange', handleOrientationChange)
  window.addEventListener('resize', handleOrientationChange)
  
  window.addEventListener('keydown', (e) => {
    if (s.isConnected && !e.target.matches('input, textarea')) {
      e.preventDefault()
      sendPhysicalKeyEvent('keydown', e)
    }
  })
  
  window.addEventListener('keyup', (e) => {
    if (s.isConnected && !e.target.matches('input, textarea')) {
      e.preventDefault()
      sendPhysicalKeyEvent('keyup', e)
    }
  })
  
  setupKeyboardDrag()
  loadKeyboardSettings()
  setupSystemKeyboardListener()
  setupSystemKbBarDrag()
  initStatsVisibility()
  FileTransferManager.init()
  
  console.log('初始化完成，设备ID:', s.myDeviceId)
}

document.addEventListener('DOMContentLoaded', init)

window.selectRole = selectRole
window.goBack = goBack
window.switchControllerMode = switchControllerMode
window.switchControlledMode = switchControlledMode
window.copyDeviceId = copyDeviceId
window.connectDevice = connectDevice
window.connectDirect = connectDirect
window.toggleKeyboard = toggleKeyboard
window.toggleSystemKeyboard = toggleSystemKeyboard
window.toggleSpecialKeys = toggleSpecialKeys
window.cycleKeyboardPosition = cycleKeyboardPosition
window.cycleKeyboardSize = cycleKeyboardSize
window.cycleKeyboardOpacity = cycleKeyboardOpacity
window.toggleMouseMode = toggleMouseMode
window.toggleFullscreen = toggleFullscreen
window.toggleStatsOverlay = toggleStatsOverlay
window.toggleControlsExpand = toggleControlsExpand
window.toggleControlsHide = toggleControlsHide
window.showControls = showControls
window.resetDimTimer = resetDimTimer
window.resetZoomAndPan = resetZoomAndPan
window.sendKey = sendKey
window.toggleModifier = toggleModifier
window.disconnect = disconnect
window.disconnectAndLock = disconnectAndLock
window.toggleExitMode = toggleExitMode
window.updateExitBtnDisplay = updateExitBtnDisplay
window.handleExit = handleExit
window.requestUnlock = requestUnlock
window.requestLock = requestLock
window.manualConnectToServer = manualConnectToServer
window.disconnectFromServer = disconnectFromServer
window.toggleLogBox = toggleLogBox
window.controlledConnectToServer = controlledConnectToServer
window.controlledDisconnectFromServer = controlledDisconnectFromServer
window.startListening = startListening
window.stopListening = stopListening
window.FileTransferManager = FileTransferManager
window.acceptConnection = acceptConnection
window.rejectConnection = rejectConnection
window.deleteFromHistory = deleteFromHistory
window.reconnectFromHistory = reconnectFromHistory
window.manageSignalingServer = manageSignalingServer
window.addSignalingServer = addSignalingServer
window.onAddServerClick = onAddServerClick
window.editSignalingServer = editSignalingServer
window.deleteSignalingServer = deleteSignalingServer
window.selectServer = selectServer
window.cancelEditServer = cancelEditServer
window.setCustomDeviceId = setCustomDeviceId
window.resetDeviceId = resetDeviceId
// 被控端信令服务器管理
window.manageSignalingServerControlled = manageSignalingServerControlled
window.addSignalingServerControlled = addSignalingServerControlled
window.onAddServerClickControlled = onAddServerClickControlled
window.editSignalingServerControlled = editSignalingServerControlled
window.deleteSignalingServerControlled = deleteSignalingServerControlled
window.selectServerControlled = selectServerControlled
window.cancelEditServerControlled = cancelEditServerControlled

// 设备列表管理
window.manageDeviceList = manageDeviceList
window.addDeviceToList = addDeviceToList
window.removeDeviceFromList = removeDeviceFromList
window.cancelDeviceManage = cancelDeviceManage
window.connectFromDeviceList = connectFromDeviceList
window.saveConnectedDevice = saveConnectedDevice
window.renderDeviceList = renderDeviceList

window.showIncomingConnectionDialog = showIncomingConnectionDialog
window.startControllerConnection = startControllerConnection
window.handleOffer = handleOffer
window.handleAnswer = handleAnswer
window.handleIceCandidate = handleIceCandidate
window.showRemoteScreen = showRemoteScreen
window.hideRemoteScreen = hideRemoteScreen
window.updateScreenSize = updateScreenSize
window.setupRemoteScreenInteraction = setupRemoteScreenInteraction

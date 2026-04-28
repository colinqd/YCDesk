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
import { updateVideoTransformGlobal, resetZoomAndPan, toggleMouseMode, toggleControlsHide, showControls, handleOrientationChange, showFloatingMouse, hideFloatingMouse, handleFloatingMouseEvent, toggleFullscreen, setupRemoteScreenInteraction } from './modules/ui.js';
import { cycleKeyboardPosition, cycleKeyboardSize, cycleKeyboardOpacity, applyKeyboardPosition, ensureKeyboardInBounds, applyKeyboardSize, applyKeyboardOpacity, saveKeyboardSettings, loadKeyboardSettings, setupKeyboardDrag, toggleKeyboard, sendKey, toggleModifier } from './modules/keyboard.js';
import { updateScreenSize, showRemoteScreen, updateContainerSizeAfterVideoLoad, hideRemoteScreen, startStatsMonitoring, stopStatsMonitoring } from './modules/screen.js';

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
    document.getElementById('controllerServerUrl').value = item.serverUrl
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
  
  if (s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open') {
    if (s.inputChannel.bufferedAmount < 65536) {
      s.inputChannel.send(message)
    } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
      s.dataChannel.send(message)
    }
  } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
    s.dataChannel.send(message)
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
  
  const controlledModeSelect = document.getElementById('controlledConnectionMode')
  const controllerModeSelect = document.getElementById('controllerConnectionMode')
  
  if (controlledModeSelect) {
    controlledModeSelect.addEventListener('change', (e) => {
      setConnectionMode(e.target.value)
    })
  }
  
  if (controllerModeSelect) {
    controllerModeSelect.addEventListener('change', (e) => {
      setConnectionMode(e.target.value)
    })
  }
  
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
window.cycleKeyboardPosition = cycleKeyboardPosition
window.cycleKeyboardSize = cycleKeyboardSize
window.cycleKeyboardOpacity = cycleKeyboardOpacity
window.toggleMouseMode = toggleMouseMode
window.toggleFullscreen = toggleFullscreen
window.toggleControlsHide = toggleControlsHide
window.showControls = showControls
window.resetZoomAndPan = resetZoomAndPan
window.sendKey = sendKey
window.toggleModifier = toggleModifier
window.disconnect = disconnect
window.manualConnectToServer = manualConnectToServer
window.disconnectFromServer = disconnectFromServer
window.toggleLogBox = toggleLogBox
window.controlledConnectToServer = controlledConnectToServer
window.controlledDisconnectFromServer = controlledDisconnectFromServer
window.startListening = startListening
window.stopListening = stopListening
window.acceptConnection = acceptConnection
window.rejectConnection = rejectConnection
window.deleteFromHistory = deleteFromHistory
window.reconnectFromHistory = reconnectFromHistory
window.setCustomDeviceId = setCustomDeviceId
window.resetDeviceId = resetDeviceId

window.showIncomingConnectionDialog = showIncomingConnectionDialog
window.startControllerConnection = startControllerConnection
window.handleOffer = handleOffer
window.handleAnswer = handleAnswer
window.handleIceCandidate = handleIceCandidate
window.showRemoteScreen = showRemoteScreen
window.hideRemoteScreen = hideRemoteScreen
window.updateScreenSize = updateScreenSize
window.setupRemoteScreenInteraction = setupRemoteScreenInteraction

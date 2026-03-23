let myDeviceId = ''
let localStream = null
let currentDirectClientId = null
let directPeerConnection = null
let isDirectController = false
let dataChannel = null
let log = null

function initDirectMode(deviceId, logFunc) {
  myDeviceId = deviceId
  log = logFunc
}

async function sendDirectMessage(clientId, message) {
  try {
    await window.electronAPI.sendDirectMessage(clientId, message)
  } catch (e) {
    log('发送消息失败: ' + e.message)
  }
}

function handleDirectMessage(clientId, message) {
  log('收到消息: ' + message.type)
  
  switch (message.type) {
    case 'offer':
      handleDirectOffer(clientId, message.offer)
      break
    case 'answer':
      handleDirectAnswer(clientId, message.answer)
      break
    case 'ice-candidate':
      handleDirectIceCandidate(clientId, message.candidate)
      break
  }
}

async function createDirectPeerConnection(clientId) {
  directPeerConnection = new RTCPeerConnection({ iceServers: [] })
  
  directPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendDirectMessage(clientId, {
        type: 'ice-candidate',
        candidate: event.candidate
      })
    }
  }
  
  directPeerConnection.ontrack = (event) => {
    log('收到远程媒体流')
    const stream = event.streams[0]
    window.remoteStream = stream
    window.electronAPI.openRemoteWindow()
    
    setTimeout(() => {
      window.electronAPI.sendToRemoteWindow('remote-stream', { hasStream: true })
    }, 500)
  }
  
  directPeerConnection.onconnectionstatechange = () => {
    log('直连状态: ' + directPeerConnection.connectionState)
  }
  
  directPeerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel(dataChannel)
  }
  
  if (isDirectController) {
    log('创建数据通道（主控端）')
    dataChannel = directPeerConnection.createDataChannel('control')
    setupDataChannel(dataChannel)
  }
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    log('数据通道已打开')
  }

  channel.onmessage = (event) => {
    log('收到数据通道消息:', event.data)
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'input') {
        window.electronAPI.send('remote-input', data)
      }
    } catch (e) {
      console.error('解析数据失败:', e)
    }
  }

  channel.onclose = () => {
    log('数据通道已关闭')
  }

  channel.onerror = (error) => {
    console.error('数据通道错误:', error)
  }
}

async function startDirectControllerConnection(clientId) {
  log('作为主控端建立直连')
  await createDirectPeerConnection(clientId)
  
  try {
    const offer = await directPeerConnection.createOffer()
    await directPeerConnection.setLocalDescription(offer)
    
    sendDirectMessage(clientId, {
      type: 'offer',
      offer: offer
    })
  } catch (error) {
    log('创建 offer 失败: ' + error.message)
  }
}

async function startDirectControlledConnection(clientId) {
  log('作为被控端建立直连')
  await createDirectPeerConnection(clientId)
  await startScreenCaptureForDirect()
}

async function startScreenCaptureForDirect() {
  try {
    const sources = await window.electronAPI.getSources()
    log('可用屏幕源:', sources)
    
    if (sources.length > 0) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      })

      stream.getTracks().forEach(track => {
        directPeerConnection.addTrack(track, stream)
      })

      log('屏幕捕获成功')
    }
  } catch (error) {
    log('屏幕捕获失败:', error)
  }
}

async function handleDirectOffer(clientId, offer) {
  await directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
  
  const answer = await directPeerConnection.createAnswer()
  await directPeerConnection.setLocalDescription(answer)
  
  sendDirectMessage(clientId, {
    type: 'answer',
    answer: answer
  })
}

async function handleDirectAnswer(clientId, answer) {
  await directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
}

async function handleDirectIceCandidate(clientId, candidate) {
  if (candidate) {
    await directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
  }
}

async function getLocalIps() {
  try {
    const ipList = await window.electronAPI.getLocalIps()
    const displayList = ipList.map(ip => {
      const addr = ip.family === 'IPv6' ? `[${ip.address}]` : ip.address
      return `<div class="ip-item">${addr} (${ip.name})</div>`
    })
    
    if (displayList.length === 0) {
      displayList.push('<div class="ip-item">未找到可用网络接口</div>')
    }
    
    document.getElementById('localIpList').innerHTML = displayList.join('')
    log('获取本地IP地址成功')
  } catch (error) {
    log('获取本地IP地址失败: ' + error.message)
    document.getElementById('localIpList').innerHTML = '<div class="ip-item">获取失败</div>'
  }
}

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }
  
  try {
    const result = await window.electronAPI.startDirectServer(port)
    if (result.success) {
      log('开始监听端口 ' + port + '，等待连接...')
      const { updateServerStatus } = require('./ui-utils')
      updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
    } else {
      log('启动监听失败: ' + result.error)
      alert('监听失败: ' + result.error)
    }
  } catch (error) {
    log('启动监听失败: ' + error.message)
    alert('启动监听失败: ' + error.message)
  }
}

async function stopListening() {
  try {
    await window.electronAPI.stopDirectServer()
    log('已停止监听')
    const { updateServerStatus } = require('./ui-utils')
    updateServerStatus('就绪', 'disconnected')
  } catch (error) {
    log('停止监听失败: ' + error.message)
  }
}

async function connectDirect() {
  const remoteIp = document.getElementById('remoteIp').value.trim()
  const remotePort = parseInt(document.getElementById('remotePort').value)
  
  if (!remoteIp) {
    alert('请输入对方IP地址')
    return
  }
  
  if (isNaN(remotePort) || remotePort < 1024 || remotePort > 65535) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }
  
  log('正在连接到 ' + remoteIp + ':' + remotePort + '...')
  
  try {
    const result = await window.electronAPI.connectDirectClient(remoteIp, remotePort)
    if (result.success) {
      log('已连接到 ' + remoteIp + ':' + remotePort)
      currentDirectClientId = result.clientId
      isDirectController = true
      startDirectControllerConnection(result.clientId)
    } else {
      log('连接失败: ' + result.error)
      alert('连接失败: ' + result.error)
    }
  } catch (error) {
    log('连接失败: ' + error.message)
    alert('连接失败: ' + error.message)
  }
}

function setCurrentDirectClientId(clientId) {
  currentDirectClientId = clientId
}

function getCurrentDirectClientId() {
  return currentDirectClientId
}

function setIsDirectController(value) {
  isDirectController = value
}

function getIsDirectController() {
  return isDirectController
}

module.exports = {
  initDirectMode,
  handleDirectMessage,
  startDirectControllerConnection,
  startDirectControlledConnection,
  getLocalIps,
  startListening,
  stopListening,
  connectDirect,
  setCurrentDirectClientId,
  getCurrentDirectClientId,
  setIsDirectController,
  getIsDirectController
}

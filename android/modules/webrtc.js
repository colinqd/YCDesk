import s from './state.js'
import { MatrixTransformer } from '../shared/components/matrix-transformer.js'
import { registerPlugin } from '@capacitor/core'
import { handleReceivedInput } from './input-executor.js'
import { wsSend, sendDirectMessage } from './signaling.js'

const TCPSocket = registerPlugin('TCPSocket')
const ScreenCapture = registerPlugin('ScreenCapture')

function getIceConfig() {
  const iceServers = []
  const stunServers = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun.stunprotocol.org:3478',
    'stun:stun.services.mozilla.com:3478',
    'stun:global.stun.twilio.com:3478',
    'stun:stunserver.org:3478'
  ]
  stunServers.forEach(url => {
    iceServers.push({ urls: url })
  })
  return { iceServers }
}

function setupOnTrackHandler(peerConnection) {
  const log = typeof window.log === 'function' ? window.log : console.log

  peerConnection.ontrack = (event) => {
    log('收到远程媒体流，track类型: ' + event.track.kind)
    const stream = event.streams[0]
    if (stream) {
      log('流ID: ' + stream.id + ', tracks数量: ' + stream.getTracks().length)
      const remoteVideo = document.getElementById('remoteVideo')
      remoteVideo.srcObject = stream

      remoteVideo.muted = true
      remoteVideo.playsInline = true

      remoteVideo.play().then(() => {
        log('视频自动播放成功')
      }).catch(e => {
        log('视频自动播放失败（需要用户交互）: ' + e.message)
        const tryPlayOnInteraction = () => {
          remoteVideo.play().then(() => {
            log('用户交互后视频播放成功')
          }).catch(playErr => {
            log('用户交互后视频播放仍失败: ' + playErr.message)
          })
          document.removeEventListener('touchstart', tryPlayOnInteraction)
          document.removeEventListener('click', tryPlayOnInteraction)
        }
        document.addEventListener('touchstart', tryPlayOnInteraction, { once: true })
        document.addEventListener('click', tryPlayOnInteraction, { once: true })
      })

      log('视频流已设置到video元素')

      // 收到视频流后显示远程屏幕（信令模式或直连模式主控端）
      if ((s.isController || s.isDirectControllerMode) && typeof window.showRemoteScreen === 'function') {
        setTimeout(() => {
          window.showRemoteScreen()
        }, 200)
      }

      remoteVideo.onloadedmetadata = () => {
        log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight)
        if (s.matrixTransformer) {
          s.matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight)
          // 用视频实际分辨率更新远程屏幕尺寸（覆盖默认的1920x1080）
          s.matrixTransformer.setRemoteScreenSize(remoteVideo.videoWidth, remoteVideo.videoHeight)

          const videoContainer = document.getElementById('videoContainer')
          const videoWrapper = document.getElementById('videoWrapper')
          if (videoContainer && videoWrapper) {
            s.matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
            log('视频加载后更新 container: ' + s.matrixTransformer.displayWidth + 'x' + s.matrixTransformer.displayHeight)
          }
        }
      }

      remoteVideo.oncanplay = () => {
        log('视频可以播放')
        remoteVideo.play().catch(e => {
          log('视频oncanplay时播放失败: ' + e.message)
        })
      }
    }
  }
}

function setupInputChannelHandler(channel) {
  const log = typeof window.log === 'function' ? window.log : console.log

  channel.binaryType = 'arraybuffer'
  s.inputChannelReady = true
  channel.onmessage = (msgEvent) => {
    try {
      const data = JSON.parse(msgEvent.data)
      if (data.type === 'input') {
        handleReceivedInput(data)
      }
    } catch (e) {
      log('输入通道消息解析失败: ' + e.message)
    }
  }
  channel.onclose = () => {
    s.inputChannelReady = false
    log('输入数据通道已关闭')
  }
  channel.onerror = (error) => {
    s.inputChannelReady = false
    log('输入数据通道错误: ' + error)
  }
  log('输入数据通道已就绪（接收端）')
}

function setupOnDataChannelHandler(peerConnection) {
  const log = typeof window.log === 'function' ? window.log : console.log

  peerConnection.ondatachannel = (event) => {
    log('收到数据通道: ' + event.channel.label)
    if (event.channel.label === 'control') {
      s.dataChannel = event.channel
      setupDataChannel()
    } else if (event.channel.label === 'input') {
      s.inputChannel = event.channel
      setupInputChannelHandler(s.inputChannel)
    }
  }
}

async function startDirectControllerConnection() {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('作为主控端建立直连WebRTC连接')
  
  s.isDirectControllerMode = true
  s.isWaitingRenegotiation = false
  
  if (!s.matrixTransformer) {
    s.matrixTransformer = new MatrixTransformer()
    log('提前初始化matrixTransformer完成')
  }
  
  s.directPeerConnection = new RTCPeerConnection({ iceServers: [] })
  
  s.directPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendDirectMessage(s.currentDirectClientId, {
        type: 'ice-candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      })
    }
  }
  
  setupOnTrackHandler(s.directPeerConnection)
  
  s.directPeerConnection.onconnectionstatechange = () => {
    log('WebRTC连接状态: ' + s.directPeerConnection.connectionState)
    if (s.directPeerConnection.connectionState === 'connected') {
      s.isConnected = true
      if (typeof window.showToast === 'function') window.showToast('连接成功')
      // 直连模式主控端：连接成功后显示远程屏幕
      if (typeof window.showRemoteScreen === 'function') {
        setTimeout(() => {
          window.showRemoteScreen()
        }, 300)
      }
    } else if (s.directPeerConnection.connectionState === 'disconnected' || s.directPeerConnection.connectionState === 'failed') {
      s.isConnected = false
      if (typeof window.showToast === 'function') window.showToast('连接已断开')
      if (typeof window.hideRemoteScreen === 'function') window.hideRemoteScreen()
    }
  }
  
  setupOnDataChannelHandler(s.directPeerConnection)

  s.directPeerConnection.addTransceiver('video', { direction: 'recvonly' })
  s.directPeerConnection.addTransceiver('audio', { direction: 'recvonly' })
  log('已添加视频和音频接收器')
  
  log('创建数据通道（主控端）')
  s.dataChannel = s.directPeerConnection.createDataChannel('control', {
    ordered: true,
    maxRetransmits: 3
  })
  setupDataChannel()
  
  s.inputChannel = s.directPeerConnection.createDataChannel('input', {
    ordered: false,
    maxRetransmits: 0
  })
  s.inputChannel.binaryType = 'arraybuffer'
  s.inputChannelReady = false
  s.inputChannel.onopen = () => {
    s.inputChannelReady = true
    log('输入数据通道已打开（无序、不重传）')
  }
  s.inputChannel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'input') {
        handleReceivedInput(data)
      }
    } catch (e) {
      log('输入通道消息解析失败: ' + e.message)
    }
  }
  s.inputChannel.onclose = () => {
    s.inputChannelReady = false
    log('输入数据通道已关闭')
  }
  s.inputChannel.onerror = (error) => {
    s.inputChannelReady = false
    log('输入数据通道错误: ' + error)
  }
  
  try {
    const offer = await s.directPeerConnection.createOffer()
    await s.directPeerConnection.setLocalDescription(offer)
    log('Offer创建成功')
    
    sendDirectMessage(s.currentDirectClientId, {
      type: 'offer',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
    log('Offer已发送')
  } catch (error) {
    log('创建 Offer 失败: ' + error.message)
    if (typeof window.showToast === 'function') window.showToast('连接失败')
  }
}

async function handleDirectOffer(offer) {
  const log = typeof window.log === 'function' ? window.log : console.log
  if (!offer) {
    log('错误: offer为空')
    return
  }
  
  log('处理直连Offer（被控端）')
  
  try {
    s.directPeerConnection = new RTCPeerConnection({ iceServers: [] })
    
    s.directPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendDirectMessage(s.currentDirectClientId, {
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }
        })
      }
    }
    
    s.directPeerConnection.onconnectionstatechange = () => {
      log('直连被控端 WebRTC连接状态: ' + s.directPeerConnection.connectionState)
      if (s.directPeerConnection.connectionState === 'connected') {
        s.isConnected = true
        if (typeof window.showToast === 'function') window.showToast('远程控制已连接')
      } else if (s.directPeerConnection.connectionState === 'disconnected' || s.directPeerConnection.connectionState === 'failed') {
        s.isConnected = false
        if (typeof window.showToast === 'function') window.showToast('连接已断开')
        stopScreenCaptureStream()
      }
    }
    
    setupOnDataChannelHandler(s.directPeerConnection)

    // 被控端：启用InputExecutor被控模式
    try {
      const _InputExecutor = registerPlugin('InputExecutor')
      await _InputExecutor.setControlledMode({ enabled: true })
      log('直连被控端 InputExecutor被控模式已启用')
    } catch (e) {
      log('直连被控端 设置InputExecutor模式失败: ' + e.message)
    }
    
    await s.directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    log('直连被控端 远程描述设置成功')
    await addDirectPendingIceCandidates()
    
    // 被控端：启动屏幕捕获并添加到WebRTC
    log('直连被控端 开始捕获屏幕...')
    await startScreenCaptureForWebRTC(s.directPeerConnection)
    
    const answer = await s.directPeerConnection.createAnswer()
    await s.directPeerConnection.setLocalDescription(answer)
    log('直连被控端 本地描述设置成功')
    
    sendDirectMessage(s.currentDirectClientId, {
      type: 'answer',
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    
    log('直连被控端 Answer已发送')
  } catch (error) {
    log('直连被控端 处理Offer失败: ' + error.message)
  }
}

async function handleDirectAnswer(answer) {
  const log = typeof window.log === 'function' ? window.log : console.log
  if (!answer) {
    log('错误: answer为空')
    return
  }
  
  try {
    await s.directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    log('Answer设置成功')
    await addDirectPendingIceCandidates()
  } catch (error) {
    log('设置Answer失败: ' + error.message)
  }
}

async function handleRenegotiationAnswer(answer) {
  const log = typeof window.log === 'function' ? window.log : console.log
  if (!answer) {
    log('错误: renegotiation answer为空')
    return
  }
  
  try {
    await s.directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    log('renegotiation answer设置成功，视频流即将到达')
    await addDirectPendingIceCandidates()
  } catch (error) {
    log('设置renegotiation answer失败: ' + error.message)
  }
}

async function handleDirectIceCandidate(candidate) {
  if (!candidate || !s.directPeerConnection) return
  
  // 过滤空候选
  if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) return
  
  // 如果远程描述未设置，缓存ICE候选
  if (!s.directPeerConnection.remoteDescription) {
    if (s.pendingDirectIceCandidates.length < 50) {
      s.pendingDirectIceCandidates.push(candidate)
      if (typeof window.log === 'function') window.log('缓存直连ICE候选（远程描述未设置）')
    }
    return
  }
  
  try {
    await s.directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    if (typeof window.log === 'function') window.log('直连ICE候选添加成功')
  } catch (error) {
    if (typeof window.log === 'function') window.log('添加直连ICE候选失败: ' + error.message)
  }
}

async function addDirectPendingIceCandidates() {
  if (s.pendingDirectIceCandidates.length === 0) return
  if (typeof window.log === 'function') window.log('添加缓存的直连ICE候选: ' + s.pendingDirectIceCandidates.length + ' 个')
  for (const candidate of s.pendingDirectIceCandidates) {
    try {
      await s.directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      if (typeof window.log === 'function') window.log('添加缓存直连ICE候选失败: ' + error.message)
    }
  }
  s.pendingDirectIceCandidates = []
}

async function handleRenegotiationOffer(offer) {
  const log = typeof window.log === 'function' ? window.log : console.log
  if (!offer || !s.directPeerConnection) {
    log('renegotiation offer无效')
    return
  }
  
  log('收到renegotiation offer（含视频），开始处理...')
  s.isWaitingRenegotiation = false
  
  try {
    await s.directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    log('renegotiation远程描述设置成功')
    
    const answer = await s.directPeerConnection.createAnswer()
    await s.directPeerConnection.setLocalDescription(answer)
    log('renegotiation answer创建成功')
    
    sendDirectMessage(s.currentDirectClientId, {
      type: 'answer',
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    
    log('renegotiation answer已发送，等待视频流...')
    if (typeof window.showToast === 'function') window.showToast('正在加载远程屏幕...')
    
    if (typeof window.showRemoteScreen === 'function') window.showRemoteScreen()
  } catch (error) {
    log('处理renegotiation offer失败: ' + error.message)
    console.error('renegotiation详细错误:', error)
  }
}

function setupDataChannel() {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  s.dataChannel.onopen = () => {
    log('[SIGNALING] 数据通道已打开 (control)')
    
    if (s.isDirectControllerMode) {
      if (typeof window.showToast === 'function') window.showToast('连接成功！正在加载远程屏幕...')
      
      // 直连模式：Windows被控端在初始answer中已包含视频流，无需renegotiation
      // 直接显示远程屏幕
      setTimeout(() => {
        if (typeof window.showRemoteScreen === 'function') window.showRemoteScreen()
      }, 500)
      
      // 发送分辨率请求（仅用于获取被控端实际分辨率信息，不触发renegotiation）
      const dpr = window.devicePixelRatio || 1
      const remoteScreen = document.getElementById('remoteScreen')
      let localCssWidth = window.innerWidth
      let localCssHeight = window.innerHeight
      if (remoteScreen && remoteScreen.clientWidth > 0) {
        localCssWidth = remoteScreen.clientWidth
        localCssHeight = remoteScreen.clientHeight
      }
      const localPhysicalWidth = Math.round(localCssWidth * dpr)
      const localPhysicalHeight = Math.round(localCssHeight * dpr)
      
      log('本地窗口: CSS=' + localCssWidth + 'x' + localCssHeight + ', 物理=' + localPhysicalWidth + 'x' + localPhysicalHeight + ', DPR=' + dpr)
      
      setTimeout(() => {
        if (s.dataChannel && s.dataChannel.readyState === 'open') {
          try {
            s.dataChannel.send(JSON.stringify({
              type: 'resolution-request',
              width: localPhysicalWidth,
              height: localPhysicalHeight,
              devicePixelRatio: dpr
            }))
            log('分辨率请求已发送: ' + localPhysicalWidth + 'x' + localPhysicalHeight)
          } catch (e) {
            log('发送分辨率请求失败: ' + e.message)
          }
        }
      }, 1000)
    } else {
      if (typeof window.showToast === 'function') window.showToast('连接成功！正在加载远程屏幕...')
      setTimeout(() => {
        if (typeof window.showRemoteScreen === 'function') window.showRemoteScreen()
      }, 500)
    }
  }

  s.dataChannel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      log('收到数据通道消息: ' + JSON.stringify(data).substring(0, 200))
      
      if (data.type === 'resolution-response') {
        log('收到分辨率响应: ' + data.width + 'x' + data.height)
        if (s.matrixTransformer) {
          s.matrixTransformer.setRemoteScreenSize(data.width, data.height)
          if (data.originalWidth && data.originalHeight) {
            log('原始屏幕尺寸: ' + data.originalWidth + 'x' + data.originalHeight)
          }
          // 更新 videoContainer 位置和尺寸以匹配新的分辨率
          if (typeof window.updateContainerSizeAfterVideoLoad === 'function') {
            window.updateContainerSizeAfterVideoLoad()
          }
        }
      } else if (data.type === 'screen-size') {
        log('收到屏幕尺寸: ' + data.width + 'x' + data.height + ', scaleFactor=' + data.scaleFactor)
        if (typeof window.updateScreenSize === 'function') window.updateScreenSize(data.width, data.height, data.scaleFactor, data.workArea)
      } else if (data.type === 'input') {
        handleReceivedInput(data)
      } else if (data.type === 'ping') {
        s.dataChannel.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }))
      } else if (data.type === 'unlock-state-changed') {
        log('[Android主控端] 收到被控端锁屏状态变更: isLocked=' + data.isLocked)
        if (typeof window.handleRemoteLockStateChanged === 'function') {
          window.handleRemoteLockStateChanged(data)
        } else {
          if (data.isLocked) {
            log('[Android主控端] 被控端已锁定')
            if (typeof window.showToast === 'function') window.showToast('被控端已锁定')
          } else {
            log('[Android主控端] 被控端已解锁')
            if (typeof window.showToast === 'function') window.showToast('被控端已解锁')
          }
        }
      }
    } catch (e) {
      log('解析数据通道消息失败: ' + e.message)
    }
  }

  s.dataChannel.onclose = () => {
    log('[SIGNALING] 数据通道已关闭 (control)')
    s.isWaitingRenegotiation = false
    s.isDirectControllerMode = false
    if (typeof window.hideRemoteScreen === 'function') window.hideRemoteScreen()
  }

  s.dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error)
    if (typeof window.showToast === 'function') window.showToast('数据通道错误')
  }
}

async function createPeerConnection() {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  if (!s.matrixTransformer) {
    s.matrixTransformer = new MatrixTransformer()
    log('提前初始化matrixTransformer完成')
  }
  
  s.peerConnection = new RTCPeerConnection(getIceConfig())

  s.peerConnection.onicecandidate = (event) => {
    if (event.candidate && s.socket) {
      wsSend('ice-candidate', {
        sessionId: s.currentSessionId,
        candidate: event.candidate,
        toDeviceId: s.incomingFromDeviceId
      })
    }
  }

  setupOnTrackHandler(s.peerConnection)

  s.peerConnection.onconnectionstatechange = () => {
    log('[SIGNALING] 连接状态: ' + s.peerConnection.connectionState)
    if (s.peerConnection.connectionState === 'connected') {
      s.isConnected = true
      if (s.isController) {
        if (typeof window.showToast === 'function') window.showToast('连接成功')
        if (typeof window.saveConnectedDevice === 'function' && s.incomingFromDeviceId) {
          window.saveConnectedDevice(s.incomingFromDeviceId)
        }
        // 信令模式主控端：连接成功后显示远程屏幕
        if (typeof window.showRemoteScreen === 'function') {
          setTimeout(() => {
            window.showRemoteScreen()
          }, 300)
        }
      } else {
        // 被控端连接成功
        if (typeof window.showToast === 'function') window.showToast('远程控制已连接')
      }
    } else if (s.peerConnection.connectionState === 'disconnected' || s.peerConnection.connectionState === 'failed') {
      s.isConnected = false
      if (s.isController) {
        if (typeof window.showToast === 'function') window.showToast('连接已断开')
        if (typeof window.hideRemoteScreen === 'function') window.hideRemoteScreen()
      } else {
        if (typeof window.showToast === 'function') window.showToast('连接已断开')
        stopScreenCaptureStream()
      }
    }
  }

  setupOnDataChannelHandler(s.peerConnection)

  if (s.isController) {
    // 主控端：接收远程视频流，发送输入
    s.peerConnection.addTransceiver('video', { direction: 'recvonly' })
    s.peerConnection.addTransceiver('audio', { direction: 'recvonly' })
    log('已添加视频和音频接收器')
    
    log('[SIGNALING] 创建数据通道（主控端）')
    s.dataChannel = s.peerConnection.createDataChannel('control', {
      ordered: true,
      maxRetransmits: 3
    })
    setupDataChannel()
    
    log('[SIGNALING] 创建输入数据通道（无序、不重传）')
    s.inputChannel = s.peerConnection.createDataChannel('input', {
      ordered: false,
      maxRetransmits: 0
    })
    s.inputChannel.binaryType = 'arraybuffer'
    s.inputChannelReady = false
    s.inputChannel.onopen = () => {
      s.inputChannelReady = true
      log('[SIGNALING] 输入数据通道已打开（无序、不重传）')
    }
    s.inputChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'input') {
          handleReceivedInput(data)
        }
      } catch (e) {
        log('输入通道消息解析失败: ' + e.message)
      }
    }
    s.inputChannel.onclose = () => {
      s.inputChannelReady = false
      log('[SIGNALING] 输入数据通道已关闭')
    }
    s.inputChannel.onerror = (error) => {
      s.inputChannelReady = false
      log('[SIGNALING] 输入数据通道错误: ' + error)
    }
  } else {
    // 被控端：发送屏幕视频流，接收输入
    s.peerConnection.addTransceiver('video', { direction: 'sendonly' })
    s.peerConnection.addTransceiver('audio', { direction: 'inactive' })
    log('被控端已添加视频发送器和音频（非激活）')
  }
}

async function startControllerConnection() {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('[SIGNALING] 开始主控端连接建立')
  log('[SIGNALING] currentSessionId=' + s.currentSessionId)
  log('[SIGNALING] incomingFromDeviceId=' + s.incomingFromDeviceId)
  log('[SIGNALING] isController=' + s.isController)
  await createPeerConnection()
  
  try {
    const offer = await s.peerConnection.createOffer()
    await s.peerConnection.setLocalDescription(offer)
    log('[SIGNALING] Offer创建成功, 发送到信令服务器')
    
    wsSend('offer', {
      sessionId: s.currentSessionId,
      offer: offer,
      toDeviceId: s.incomingFromDeviceId
    })
    log('[SIGNALING] Offer已发送, sessionId=' + s.currentSessionId + ', toDeviceId=' + s.incomingFromDeviceId)
  } catch (error) {
    log('[SIGNALING] 创建offer失败: ' + error.message)
    if (typeof window.showToast === 'function') window.showToast('连接失败')
  }
}

async function startControlledConnection() {
  if (typeof window.log === 'function') window.log('作为被控端建立连接')
  await createPeerConnection()
}

async function handleOffer(data) {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('[Android信令模式-被控端] 收到Offer，开始处理')
  s.incomingFromDeviceId = data.fromDeviceId || s.incomingFromDeviceId
  s.currentSessionId = data.sessionId
  s.isAndroidControlled = true
  s.isController = false
  
  if (!s.peerConnection) {
    log('[Android信令模式-被控端] PeerConnection不存在，先创建')
    await createPeerConnection()
  }
  
  try {
    const _InputExecutor = registerPlugin('InputExecutor')
    await _InputExecutor.setControlledMode({ enabled: true })
    log('[Android信令模式-被控端] InputExecutor被控模式已启用')
  } catch (e) {
    log('[Android信令模式-被控端] 设置InputExecutor模式失败: ' + e.message)
  }
  
  try {
    await s.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
    log('[Android信令模式-被控端] 远程描述设置成功')
    
    await addPendingIceCandidates()
    
    // 被控端：启动屏幕捕获并添加到WebRTC
    log('[Android信令模式-被控端] 开始捕获屏幕...')
    await startScreenCaptureForWebRTC(s.peerConnection)
    
    log('[Android信令模式-被控端] 创建Answer...')
    const answer = await s.peerConnection.createAnswer()
    await s.peerConnection.setLocalDescription(answer)
    log('[Android信令模式-被控端] 本地描述设置成功')
    
    log('[Android信令模式-被控端] 发送Answer到信令服务器')
    wsSend('answer', {
      sessionId: s.currentSessionId,
      answer: { type: answer.type, sdp: answer.sdp },
      toDeviceId: s.incomingFromDeviceId
    })
    log('[Android信令模式-被控端] Answer已发送')
  } catch (error) {
    log('[Android信令模式-被控端] 处理Offer失败: ' + error.message)
    console.error('[Android信令模式-被控端] 处理Offer详细错误:', error)
  }
}

// 屏幕捕获相关的 MediaStream 引用
let screenCaptureStream = null
let screenCaptureCanvas = null
let screenCaptureInterval = null

/**
 * 启动屏幕捕获并通过Canvas生成MediaStream添加到WebRTC连接
 * @param {RTCPeerConnection} pc - WebRTC连接
 */
async function startScreenCaptureForWebRTC(pc) {
  const log = typeof window.log === 'function' ? window.log : console.log
  try {
    // 请求屏幕录制权限
    const permResult = await ScreenCapture.requestPermission()
    if (!permResult.success) {
      log('[ScreenCapture] 屏幕录制权限被拒绝')
      if (typeof window.showToast === 'function') window.showToast('请授予屏幕录制权限')
      return
    }
    
    // 获取屏幕尺寸
    const sizeResult = await ScreenCapture.getDisplaySize()
    const screenWidth = sizeResult.success ? sizeResult.width : 1920
    const screenHeight = sizeResult.success ? sizeResult.height : 1080
    log('[ScreenCapture] 屏幕尺寸: ' + screenWidth + 'x' + screenHeight)
    
    // 创建或重用隐藏的Canvas用于捕获屏幕帧
    if (!screenCaptureCanvas) {
      screenCaptureCanvas = document.createElement('canvas')
      screenCaptureCanvas.width = screenWidth
      screenCaptureCanvas.height = screenHeight
      screenCaptureCanvas.style.display = 'none'
      document.body.appendChild(screenCaptureCanvas)
    }
    
    // 使用Canvas的captureStream生成MediaStream（10fps）
    screenCaptureStream = screenCaptureCanvas.captureStream(10)
    
    // 将视频track添加到WebRTC
    const videoTrack = screenCaptureStream.getVideoTracks()[0]
    if (videoTrack) {
      // 如果已有sendonly transceiver，替换track
      const senders = pc.getSenders()
      let videoSender = null
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          videoSender = sender
          break
        }
      }
      
      if (videoSender) {
        await videoSender.replaceTrack(videoTrack)
        log('[ScreenCapture] 视频track已替换到现有sender')
      } else {
        pc.addTrack(videoTrack, screenCaptureStream)
        log('[ScreenCapture] 视频track已添加到WebRTC')
      }
    }
    
    // 启动实际屏幕捕获
    const captureResult = await ScreenCapture.startCapture()
    if (captureResult.success) {
      log('[ScreenCapture] 屏幕捕获已启动: ' + captureResult.width + 'x' + captureResult.height)
      if (typeof window.showToast === 'function') window.showToast('屏幕捕获已启动')
      
      // 设置帧可用监听（用于在Canvas上绘制帧数据）
      setupFrameCaptureListener()
    } else {
      log('[ScreenCapture] 屏幕捕获启动失败: ' + captureResult.error)
      if (typeof window.showToast === 'function') window.showToast('屏幕捕获失败')
    }
  } catch (error) {
    log('[ScreenCapture] 屏幕捕获异常: ' + error.message)
    console.error('[ScreenCapture] 屏幕捕获详细错误:', error)
  }
}

/**
 * 设置屏幕帧捕获监听，将帧数据绘制到Canvas上
 */
function setupFrameCaptureListener() {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  // 监听来自原生插件的帧可用事件
  // ScreenCapturePlugin 通过 notifyListeners('frameAvailable', event) 通知
  ScreenCapture.addListener('frameAvailable', (event) => {
    if (!screenCaptureCanvas || !screenCaptureStream) return
    
    const { width, height, frameData } = event
    if (!frameData) return
    
    try {
      // 从base64数据创建Image并绘制到Canvas
      const img = new Image()
      img.onload = () => {
        if (screenCaptureCanvas) {
          const ctx = screenCaptureCanvas.getContext('2d')
          if (ctx) {
            // 更新Canvas尺寸以匹配实际帧
            if (screenCaptureCanvas.width !== width || screenCaptureCanvas.height !== height) {
              screenCaptureCanvas.width = width
              screenCaptureCanvas.height = height
            }
            ctx.drawImage(img, 0, 0, width, height)
          }
        }
      }
      img.src = 'data:image/jpeg;base64,' + frameData
    } catch (e) {
      // 忽略单帧错误，继续处理后续帧
    }
  }).catch(e => {
    log('[ScreenCapture] 帧监听器注册失败: ' + e.message)
  })
  
  log('[ScreenCapture] 帧捕获监听已设置')
}

/**
 * 停止屏幕捕获流
 */
function stopScreenCaptureStream() {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval)
    screenCaptureInterval = null
  }
  
  if (screenCaptureStream) {
    screenCaptureStream.getTracks().forEach(track => track.stop())
    screenCaptureStream = null
  }
  
  if (screenCaptureCanvas) {
    screenCaptureCanvas.remove()
    screenCaptureCanvas = null
  }
  
  // 停止原生屏幕捕获
  ScreenCapture.stopCapture().catch(e => {
    log('[ScreenCapture] 停止捕获失败: ' + e.message)
  })
  
  log('[ScreenCapture] 屏幕捕获流已停止')
}

async function startAndroidScreenCapture() {
  const log = typeof window.log === 'function' ? window.log : console.log
  try {
    log('[Android信令模式-被控端] 请求屏幕录制权限...')
    const permResult = await ScreenCapture.requestPermission()
    
    if (!permResult.success) {
      log('[Android信令模式-被控端] 屏幕录制权限被拒绝')
      if (typeof window.showToast === 'function') window.showToast('请授予屏幕录制权限')
      return
    }
    
    log('[Android信令模式-被控端] 权限已获取，开始屏幕捕获...')
    const captureResult = await ScreenCapture.startCapture()
    
    if (captureResult.success) {
      log('[Android信令模式-被控端] 屏幕捕获已启动')
      
      try {
        const sizeResult = await ScreenCapture.getDisplaySize()
        if (sizeResult.success) {
          log('[Android信令模式-被控端] 屏幕尺寸: ' + sizeResult.width + 'x' + sizeResult.height)
        }
      } catch (e) {
        log('[Android信令模式-被控端] 获取屏幕尺寸失败: ' + e.message)
      }
      
      if (typeof window.showToast === 'function') window.showToast('屏幕捕获已启动')
    } else {
      log('[Android信令模式-被控端] 屏幕捕获启动失败: ' + captureResult.error)
      if (typeof window.showToast === 'function') window.showToast('屏幕捕获失败')
    }
  } catch (error) {
    log('[Android信令模式-被控端] 屏幕捕获异常: ' + error.message)
    console.error('[Android信令模式-被控端] 屏幕捕获详细错误:', error)
  }
}

async function handleAnswer(data) {
  if (!data.answer) {
    if (typeof window.log === 'function') window.log('收到空 answer')
    return
  }
  try {
    if (data.fromDeviceId) {
      s.incomingFromDeviceId = data.fromDeviceId
    }
    await s.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
    if (typeof window.log === 'function') window.log('Answer设置成功')
    await addPendingIceCandidates()
  } catch (error) {
    if (typeof window.log === 'function') window.log('设置Answer失败: ' + error.message)
  }
}

async function addPendingIceCandidates() {
  if (s.pendingIceCandidates.length === 0) return
  if (typeof window.log === 'function') window.log('添加缓存的ICE候选: ' + s.pendingIceCandidates.length + ' 个')
  for (const candidate of s.pendingIceCandidates) {
    try {
      await s.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      if (typeof window.log === 'function') window.log('添加缓存ICE候选失败: ' + error.message)
    }
  }
  s.pendingIceCandidates = []
}

async function handleIceCandidate(data) {
  if (!data.candidate) return
  
  if (data.candidate.sdpMid === null && data.candidate.sdpMLineIndex === null) return
  
  if (!s.peerConnection || !s.peerConnection.remoteDescription) {
    if (s.pendingIceCandidates.length < 50) {
      s.pendingIceCandidates.push(data.candidate)
      if (typeof window.log === 'function') window.log('缓存 ICE 候选（远程描述未设置）')
    }
    return
  }
  
  try {
    await s.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
  } catch (error) {
    if (typeof window.log === 'function') window.log('添加ICE候选失败: ' + error.message)
  }
}

export {
  getIceConfig,
  startDirectControllerConnection,
  handleDirectOffer,
  handleDirectAnswer,
  handleRenegotiationAnswer,
  handleDirectIceCandidate,
  handleRenegotiationOffer,
  setupDataChannel,
  createPeerConnection,
  startControllerConnection,
  startControlledConnection,
  handleOffer,
  startAndroidScreenCapture,
  startScreenCaptureForWebRTC,
  stopScreenCaptureStream,
  handleAnswer,
  addPendingIceCandidates,
  handleIceCandidate,
  addDirectPendingIceCandidates
}

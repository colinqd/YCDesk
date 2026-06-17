class SignalingModeManager {
  constructor(options = {}) {
    this.signalingClient = new SignalingClient({
      log: options.log || console.log,
      maxReconnectAttempts: 5,
      reconnectDelay: 2000,
      onRegistered: (data) => {},
      onIncomingConnection: (data) => {
        this.incomingFromDeviceId = data.fromDeviceId
        this.currentSessionId = data.sessionId
        this.isController = false
        if (typeof this.onIncomingConnection === 'function') {
          this.onIncomingConnection(data.fromDeviceId)
        }
      },
      onConnectionResult: (data) => {
        if (data.accepted) {
          this.currentSessionId = data.sessionId
          this.incomingFromDeviceId = data.toDeviceId
          this.startControllerConnection()
        } else {
          alert('对方拒绝了连接请求')
        }
      },
      onConnectionFailed: (data) => {
        alert('连接失败: ' + (data.reason === 'device-offline' ? '目标设备不在线' : data.reason))
      },
      onOffer: (data) => {
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          this.logFn('[自连接] 收到自己的offer回环，转发给被控端')
          this.handleOffer(data)
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-offer', data)
        } else {
          this.handleOffer(data)
        }
      },
      onAnswer: (data) => {
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          this.logFn('[自连接] 收到自己的answer回环，转发给远程窗口')
          window.electronAPI.sendToRemoteWindow('signaling-answer', data)
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-answer', data)
        } else if (this.peerConnection) {
          this.handleAnswer(data.answer)
        }
      },
      onIceCandidate: (data) => {
        var candidateKey = ''
        if (data.candidate && data.candidate.candidate) {
          candidateKey = data.candidate.candidate
        }
        if (data.fromDeviceId && data.fromDeviceId === this.myDeviceId) {
          if (this.remoteWindowIceCandidateKeys.has(candidateKey)) {
            this.remoteWindowIceCandidateKeys.delete(candidateKey)
            this.logFn('[自连接] 收到远程窗口ICE候选回环，添加到被控端')
            if (this.peerConnection) {
              this.handleIceCandidate(data.candidate)
            }
          } else {
            this.logFn('[自连接] 收到被控端ICE候选回环，转发给远程窗口')
            window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
          }
        } else if (this.isController) {
          window.electronAPI.sendToRemoteWindow('signaling-ice-candidate', data)
        } else if (this.peerConnection) {
          this.handleIceCandidate(data.candidate)
        }
      },
      onConnected: () => {
        if (this.uiManager) {
          const mode = this.signalingClient.getNegotiatedMode()
          const label = mode === 'websocket' ? '已连接 (WebSocket)' : '已连接 (Socket.IO)'
          this.uiManager.updateServerStatus(label, 'connected')
        }
      },
      onDisconnected: () => {
        if (this.uiManager) {
          this.uiManager.updateServerStatus('已断开', 'disconnected')
        }
        if (typeof this.onDisconnectedCallback === 'function') {
          this.onDisconnectedCallback()
        }
        window.electronAPI.sendToRemoteWindow('signaling-disconnected', { reason: 'connection closed' })
      },
      onError: () => {
        if (this.uiManager) {
          this.uiManager.updateServerStatus('连接失败', 'error')
        }
      },
      onReconnecting: (info) => {
        this.logFn('信令服务器重连中... 第 ' + info.attempt + '/' + info.maxAttempts + ' 次')
        if (this.uiManager) {
          this.uiManager.updateServerStatus('重连中 (' + info.attempt + '/' + info.maxAttempts + ')', 'reconnecting')
        }
      },
      onRequestRenegotiate: (data) => {
        this.logFn('[信令模式] 收到重协商请求: ' + JSON.stringify(data))
        // 主控端收到被控端的重协商请求，通过远程窗口重新发起offer
        if (this.isController && window.electronAPI) {
          window.electronAPI.sendToRemoteWindow('signaling-renegotiate', {
            sessionId: this.currentSessionId,
            targetDeviceId: this.incomingFromDeviceId,
            deviceId: this.myDeviceId
          })
        }
      }
    })

    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.myDeviceId = ''
    this.logFn = options.log || console.log
    this.uiManager = options.uiManager
    this.config = options.config || {}
    this.onConnected = options.onConnected || null
    this.onDisconnectedCallback = options.onDisconnected || null
    this.onIncomingConnection = options.onIncomingConnection || null
    
    this.peerConnection = null
    this.dataChannelManager = null
    this.inputChannel = null
    this.inputChannelReady = false
    this.auxiliaryChannels = new Map()
    this.pendingIceCandidates = []
    this.pendingStartSignal = null
    this.serverUrl = ''
    this.role = ''
    this._fileTransferChunkSize = 16 * 1024
    this._activeFileTransfer = null
    this.selfConnection = false
    this.remoteWindowIceCandidateKeys = new Set()
    this.videoFrameTransmitter = null
    this.useOptimizedTransfer = options.useOptimizedTransfer !== false
    this.OPTIMIZED_VIDEO_CHANNEL = 'optimized-video'
    this.optimizedVideoChannel = null
    this.currentStream = null
    
    this._controlledIpcListenersSetup = false
    this._isDisconnecting = false
    this._iceRestartInProgress = false
    this._recoveryInProgress = false
    this._channelHealthTimer = null
    this._lastPongTime = 0

    this._setupRemoteWindowListeners()
  }

  _diagLog(message) {
    try {
      const fs = require('fs')
      const dir = 'C:\\ProgramData\\YCDesk'
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(dir + '\\diag_webrtc.log', '[' + new Date().toISOString() + '] ' + message + '\n', 'utf8')
    } catch (e) {}
  }

  setDeviceId(deviceId) {
    this.myDeviceId = deviceId
    this.signalingClient.setDeviceId(deviceId)
  }

  setConnectionMode(mode) {
    this.signalingClient.setConnectionMode(mode)
  }

  async connect(serverUrl, role) {
    this.serverUrl = serverUrl
    this.role = role
    this.isController = (role === 'controller')

    let normalizedUrl = serverUrl.trim()
    this.logFn('原始地址: ' + serverUrl)
    
    if (window.CONFIG && window.CONFIG.normalizeServerUrl) {
      normalizedUrl = window.CONFIG.normalizeServerUrl(normalizedUrl)
      this.logFn('normalize后: ' + normalizedUrl)
    }
    
    if (this.uiManager) {
      this.uiManager.updateServerStatus('连接中...', 'connecting')
    }

    this.signalingClient.connect(normalizedUrl)
  }

  disconnect() {
    this._isDisconnecting = true
    this._stopChannelHealthCheck()
    this.signalingClient.disconnect()
    if (this.uiManager) {
      this.uiManager.updateServerStatus('已断开', 'disconnected')
    }
  }

  connectDevice(targetDeviceId) {
    if (!targetDeviceId) {
      alert('请输入设备 ID')
      return false
    }
    if (targetDeviceId.length < 6 || targetDeviceId.length > 16) {
      alert('设备 ID 格式不正确（需要 6-16 位字符）')
      return false
    }
    if (!this.signalingClient.isConnected()) {
      alert('未连接到信令服务器，请先连接服务器')
      return false
    }

    this.incomingFromDeviceId = targetDeviceId
    this.selfConnection = (targetDeviceId === this.myDeviceId)
    this.signalingClient.send('connect-request', {
      fromDeviceId: this.myDeviceId,
      toDeviceId: targetDeviceId
    })

    alert('连接请求已发送，请等待对方确认...')
    return true
  }

  acceptConnection() {
    if (!this.signalingClient.isConnected()) return
    this.signalingClient.send('connection-response', {
      sessionId: this.currentSessionId,
      accepted: true,
      fromDeviceId: this.incomingFromDeviceId,
      toDeviceId: this.myDeviceId
    })
    
    this.logFn('已接受连接，作为被控端在主窗口建立WebRTC连接')
    this.selfConnection = (this.incomingFromDeviceId === this.myDeviceId)
    this.isController = false
    this.startControlledConnection()
  }

  rejectConnection() {
    if (!this.signalingClient.isConnected()) return
    this.signalingClient.send('connection-response', {
      sessionId: this.currentSessionId,
      accepted: false,
      fromDeviceId: this.incomingFromDeviceId,
      toDeviceId: this.myDeviceId
    })
  }

  async startControllerConnection() {
    this.logFn('作为主控端建立连接，打开远程窗口')
    this.isController = true
    window.electronAPI.openRemoteWindow()
    
    this.pendingStartSignal = {
      mode: 'controller',
      role: 'controller',
      sessionId: this.currentSessionId,
      targetDeviceId: this.incomingFromDeviceId,
      deviceId: this.myDeviceId
    }
    this.logFn('保存启动信号，等待远程窗口准备就绪: ' + JSON.stringify(this.pendingStartSignal))
  }

  async startControlledConnection() {
    this.role = 'controlled'
    this.logFn('作为被控端建立连接，在主窗口创建PeerConnection')
    this.isController = false
    await this.createPeerConnection()
    
    // 添加锁屏状态监听，发送给主控端
    if (!this._controlledIpcListenersSetup && window.electronAPI) {
      this._controlledIpcListenersSetup = true
      window.electronAPI.on('unlock-state-changed', (data) => {
        console.log('[SignalingModeManager] 收到IPC锁屏状态变更: ' + JSON.stringify(data))
        this.logFn('收到本地锁屏状态变更: ' + JSON.stringify(data))
        if (this.dataChannelManager) {
          console.log('[SignalingModeManager] 正在通过数据通道发送...')
          this.dataChannelManager.send({
            type: 'unlock-state-changed',
            ...data
          })
          console.log('[SignalingModeManager] 数据通道 send() 调用完成')
        } else {
          console.log('[SignalingModeManager] dataChannelManager 不存在，跳过')
        }
      })
      
      window.electronAPI.on('screen-capture-control', (data) => {
        console.log('[SignalingModeManager] 收到屏幕捕获控制: ' + JSON.stringify(data))
        this.logFn('收到屏幕捕获控制: ' + data.action)
        if (data.action === 'stop') {
          this.logFn('[信令模式] 停止屏幕捕获')
          this.stopScreenCapture()
        } else if (data.action === 'start') {
          this.logFn('[信令模式] 恢复屏幕捕获')
          this.refreshVideoStream()
        }
      })
    }
    
    this.logFn('被控端 PeerConnection 已创建，等待接收Offer...')
  }

  _setupRemoteWindowListeners() {
    window.electronAPI.on('send-signaling-offer', (data) => {
      this.logFn('从远程窗口收到 offer，发送到信令服务器')
      this.signalingClient.send('offer', {
        sessionId: data.sessionId || this.currentSessionId,
        offer: data.offer,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })

    window.electronAPI.on('send-signaling-answer', (data) => {
      this.logFn('从远程窗口收到 answer，发送到信令服务器')
      this.signalingClient.send('answer', {
        sessionId: data.sessionId || this.currentSessionId,
        answer: data.answer,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })

    window.electronAPI.on('send-signaling-ice-candidate', (data) => {
      this.logFn('从远程窗口收到 ICE candidate，发送到信令服务器')
      if (data.candidate && data.candidate.candidate) {
        this.remoteWindowIceCandidateKeys.add(data.candidate.candidate)
      }
      this.signalingClient.send('ice-candidate', {
        sessionId: data.sessionId || this.currentSessionId,
        candidate: data.candidate,
        toDeviceId: data.targetDeviceId || this.incomingFromDeviceId
      })
    })
  }

  async createPeerConnection() {
    this.logFn('[信令模式] 创建 PeerConnection')
    this.peerConnection = new RTCPeerConnection(this.config.getIceConfig ? this.config.getIceConfig() : { iceServers: [] })
    
    this.dataChannelManager = new DataChannelManager({
      logger: { log: this.logFn.bind(this), error: console.error }
    })

    this.dataChannelManager.setOnOpen(() => {
      this.logFn('[信令模式] 数据通道已打开')
    })

    this.dataChannelManager.setOnMessage((data) => {
      if (data.type === 'input' || data.inputType) {
        if (data.inputType === 'lock_screen' || data.inputType === 'unlock_screen') {
          this.logFn('[信令模式] 收到特殊命令: ' + data.inputType + ', 完整数据: ' + JSON.stringify(data))
        } else {
          this.logFn('[信令模式] DIAG dataChannelManager收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y + ', button=' + data.button)
        }
        this._diagLog('信令DataChannelManager收到: type=' + data.type + ' inputType=' + data.inputType + (data.inputType === 'text_input' ? ' text=' + (data.text || '').substring(0, 30) : ''))
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'pong') {
        this._lastPongTime = Date.now()
      } else if (data.type === 'screen-size') {
        this.logFn('[信令模式] 收到屏幕尺寸: ' + data.width + 'x' + data.height)
      } else if (data.type === 'resolution-request') {
        this.logFn('[信令模式] 收到分辨率请求: ' + data.width + 'x' + data.height)
        const screenW = this.config.screenCapture?.maxWidth || 1920
        const screenH = this.config.screenCapture?.maxHeight || 1080
        this.dataChannelManager.send({
          type: 'resolution-response',
          width: screenW,
          height: screenH
        })
      } else if (data.type === 'resolution-change') {
        this.logFn('[信令模式] 收到分辨率变更请求: ' + data.width + 'x' + data.height)
      } else if (data.type === 'video-refresh-request') {
        this.logFn('[信令模式] 收到视频刷新请求，重新初始化屏幕捕获...')
        this.refreshVideoStream()
      }
    })

    this.dataChannelManager.setOnClose(() => {
      this.logFn('[信令模式] 数据通道已关闭')
      // 如果不是主动断开，且 PeerConnection 仍存在，尝试数据通道恢复
      if (!this._isDisconnecting && this.peerConnection &&
          this.peerConnection.connectionState === 'connected' &&
          !this._recoveryInProgress) {
        this.logFn('[信令模式] 检测到数据通道意外关闭（PeerConnection仍连接），尝试恢复...')
        this._attemptDataChannelRecovery()
      }
    })

    this.dataChannelManager.setOnError((error) => {
      console.error('[信令模式] 数据通道错误:', error)
    })

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.logFn('[信令模式] 发送ICE候选')
        this.signalingClient.send('ice-candidate', {
          sessionId: this.currentSessionId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          },
          toDeviceId: this.incomingFromDeviceId
        })
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState
      this.logFn('[信令模式] ICE连接状态: ' + state)
      this._handleIceStateChange(state)
    }

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState
      this.logFn('[信令模式] 连接状态: ' + state)
      this._handleConnectionStateChange(state)
      if (state === 'connected') {
        this.logFn('[信令模式] WebRTC连接已建立')
        // 连接成功后重置数据通道恢复计数
        this._dcRecoveryAttempts = 0
        if (typeof this.onWebRTCConnected === 'function') {
          this.onWebRTCConnected(this.incomingFromDeviceId, this.serverUrl)
        }
        // 连接建立后启动通道健康检查
        this._startChannelHealthCheck()
      } else if (state === 'failed') {
        this.logFn('[信令模式] WebRTC连接失败')
      }
    }

    this.peerConnection.ondatachannel = (event) => {
      const label = event.channel.label
      this.logFn('[信令模式] DIAG: ondatachannel收到数据通道: ' + label + ', readyState=' + event.channel.readyState)
      
      if (label === 'control') {
        this.dataChannelManager.setDataChannel(event.channel)
      } else if (label === 'input') {
        this.inputChannel = event.channel
        this.inputChannelReady = true
        this.logFn('[信令模式] DIAG: 输入数据通道已就绪, readyState=' + event.channel.readyState)
        let inputMsgCount = 0
        this.inputChannel.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data)
            inputMsgCount++
            
            if (data.inputType === 'lock_screen' || data.inputType === 'unlock_screen') {
              this.logFn('[信令模式] 收到特殊命令: ' + data.inputType + ', 完整数据: ' + JSON.stringify(data))
            } else if (inputMsgCount <= 3 || inputMsgCount % 50 === 0) {
              this.logFn('[信令模式] DIAG: 收到第' + inputMsgCount + '条输入消息: type=' + data.type + ', inputType=' + data.inputType + ', x=' + data.x + ', y=' + data.y)
            }
            
            if (data.type === 'input' || data.inputType) {
              this._diagLog('信令input通道收到: type=' + data.type + ' inputType=' + data.inputType + (data.inputType === 'text_input' ? ' text=' + (data.text || '').substring(0, 30) : ''))
              window.electronAPI.send('remote-input', data)
            }
          } catch (e) {
            this.logFn('[信令模式] DIAG: 输入通道消息解析失败: ' + e.message)
            console.error('[signaling-mode] input parse error:', e, 'raw data type:', typeof evt.data, 'len:', typeof evt.data === 'string' ? evt.data.length : 'n/a')
          }
        }
        this.inputChannel.onclose = () => {
          this.inputChannelReady = false
          this.logFn('[信令模式] 输入数据通道已关闭, 共接收 ' + inputMsgCount + ' 条消息')
        }
        this.inputChannel.onerror = (error) => {
          this.inputChannelReady = false
          this.logFn('[信令模式] 输入数据通道错误: ' + error)
        }
      } else if (label.startsWith('aux-')) {
        const channelName = label.replace('aux-', '')
        this.auxiliaryChannels.set(channelName, event.channel)
        this.logFn('[信令模式] 辅助通道 ' + channelName + ' 已打开')
        this._setupAuxChannel(channelName, event.channel)
      } else if (label === this.OPTIMIZED_VIDEO_CHANNEL) {
        this.logFn('[信令模式] 收到优化视频通道')
        this.optimizedVideoChannel = event.channel
      }
    }
    
    this.peerConnection.ontrack = (event) => {
      this.logFn('[信令模式] 收到远程媒体流，track数量: ' + event.tracks.length)
    }

    if (this.useOptimizedTransfer) {
      this.videoFrameTransmitter = new VideoFrameTransmitter({
        logger: { log: this.logFn.bind(this), error: console.error }
      })

      this.videoFrameTransmitter.onStatsUpdate = (stats) => {
        this.logFn('[信令模式][传输统计] 帧:' + stats.framesSent +
          ' 关键帧:' + stats.keyFramesSent +
          ' 差异帧:' + stats.deltaFramesSent +
          ' 平均脏区域:' + stats.avgDirtyRegions.toFixed(1))
      }

      this.videoFrameTransmitter.onFallbackToStandard = () => {
        this.logFn('[信令模式] 优化传输回退到标准模式')
      }

      this.logFn('[信令模式] 优化视频传输模式已初始化')
    }

    this.setupInputEventListeners()
  }

  async handleOffer(data) {
    if (!data.offer) {
      this.logFn('[信令模式] 错误: offer为空')
      return
    }

    this.logFn('[信令模式] 收到offer')

    try {
      if (!this.peerConnection) {
        await this.createPeerConnection()
      } else {
        this.logFn('[信令模式] 复用已有PeerConnection')
      }
      
      this.logFn('[信令模式] 设置远程描述...')
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
      this.logFn('[信令模式] 远程描述设置成功')

      await this.addPendingIceCandidates()

      this.logFn('[信令模式] 开始捕获屏幕...')
      await this.startScreenCapture()

      this.logFn('[信令模式] 创建answer...')
      const answer = await this.peerConnection.createAnswer()
      await this.peerConnection.setLocalDescription(answer)
      this.logFn('[信令模式] 本地描述设置成功')

      this.signalingClient.send('answer', {
        sessionId: data.sessionId || this.currentSessionId,
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        toDeviceId: data.fromDeviceId || this.incomingFromDeviceId
      })

      this.logFn('[信令模式] 已发送answer')
    } catch (error) {
      this.logFn('[信令模式] 处理offer失败: ' + error.message)
      console.error('[信令模式] 处理offer详细错误:', error)
    }
  }

  async handleAnswer(answer) {
    if (!answer) {
      this.logFn('[信令模式] 错误: answer为空')
      return
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      this.logFn('[信令模式] answer设置成功')
      await this.addPendingIceCandidates()
    } catch (error) {
      this.logFn('[信令模式] 设置answer失败: ' + error.message)
    }
  }

  async handleIceCandidate(candidate) {
    if (!candidate) return

    try {
      if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) return

      if (!this.peerConnection || !this.peerConnection.remoteDescription) {
        const MAX_ICE_CANDIDATES = 50
        if (this.pendingIceCandidates.length >= MAX_ICE_CANDIDATES) {
          this.pendingIceCandidates.shift()
        }
        this.logFn('[信令模式] 缓存 ICE 候选（远程描述未设置）')
        this.pendingIceCandidates.push(candidate)
        return
      }

      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      this.logFn('[信令模式] ICE候选添加成功')
    } catch (error) {
      this.logFn('[信令模式] 添加ICE候选失败: ' + error.message)
    }
  }

  async addPendingIceCandidates() {
    this.logFn('[信令模式] 添加缓存的ICE候选: ' + this.pendingIceCandidates.length + ' 个')
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        this.logFn('[信令模式] 添加缓存ICE候选失败: ' + error.message)
      }
    }
    this.pendingIceCandidates = []
  }

  async startScreenCapture() {
    try {
      var selectedSourceId = window.getSelectedSourceId ? window.getSelectedSourceId() : null
      const sources = await window.electronAPI.getSources()
      this.logFn('[信令模式] 可用屏幕源: ' + sources.length + ' 个')
      if (!selectedSourceId) {
        selectedSourceId = sources.find(function(s) { return s.id && s.id.startsWith('screen:') })?.id || (sources.length > 0 ? sources[0].id : null)
      }
      this.logFn('[信令模式] 选定捕获源: ' + (selectedSourceId || '无'))

      var maxWidth = this.config.screenCapture?.maxWidth || 1920
      var maxHeight = this.config.screenCapture?.maxHeight || 1080

      var useServiceCapture = false
      try { useServiceCapture = localStorage.getItem('ycdesk_use_service_capture') === 'true' } catch(e) {}
      if (useServiceCapture && window.electronAPI && window.electronAPI.serviceStartCapture) {
        this.logFn('[信令模式] 尝试使用服务级捕获（绕过反截屏保护）')
        try {
          await window.electronAPI.serviceStartCapture({
            fps: 30,
            jpegQuality: 70,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
            desktopTarget: 'auto'
          })
          this.logFn('[信令模式] 服务级捕获已启动')
          this._setupServiceFrameReceiver()
          return
        } catch (e) {
          this.logFn('[信令模式] 服务捕获启动失败: ' + e.message + '，回退到标准模式')
        }
      }

      if (selectedSourceId) {

        if (this.useOptimizedTransfer && this.videoFrameTransmitter && this.optimizedVideoChannel && this.optimizedVideoChannel.readyState === 'open') {
          this.logFn('[信令模式] 使用优化传输模式捕获屏幕')
          this.videoFrameTransmitter.initialize(this.optimizedVideoChannel, maxWidth, maxHeight)
          // 启动带宽估算（用于自适应参数调整）
          if (this.peerConnection) {
            this.videoFrameTransmitter.setPeerConnection(this.peerConnection)
          }
          var resolution = await this.videoFrameTransmitter.start(selectedSourceId, maxWidth, maxHeight)
          if (resolution) {
            this.logFn('[信令模式] 优化屏幕捕获成功，分辨率: ' + resolution.width + 'x' + resolution.height)
            return
          }
          this.logFn('[信令模式] 优化传输启动失败，回退到标准模式')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
              maxWidth: maxWidth,
              maxHeight: maxHeight,
              maxFrameRate: this.config.screenCapture?.maxFrameRate || 30,
              minFrameRate: this.config.screenCapture?.minFrameRate || 15
            }
          }
        })

        const tracks = stream.getTracks()
        this.logFn('[信令模式] 获取到 ' + tracks.length + ' 个媒体轨道')

        tracks.forEach(track => {
          var sender = this.peerConnection.addTrack(track, stream)
          this.logFn('[信令模式] 已添加媒体轨道: ' + track.kind + ', label: ' + track.label)

          try {
            var parameters = sender.getParameters()
            if (!parameters.encodings || parameters.encodings.length === 0) {
              parameters.encodings = [{}]
            }
            parameters.encodings[0].maxBitrate = 8000000
            parameters.encodings[0].maxFramerate = 30
            sender.setParameters(parameters)
            this.logFn('[信令模式] 已设置视频编码参数: maxBitrate=8Mbps, maxFramerate=30')
          } catch (e) {
            this.logFn('[信令模式] 设置视频编码参数失败: ' + e.message)
          }
        })

        this.logFn('[信令模式] 屏幕捕获成功，分辨率: ' + 
          stream.getVideoTracks()[0].getSettings().width + 'x' + 
          stream.getVideoTracks()[0].getSettings().height)
        this.currentStream = stream
      } else {
        this.logFn('[信令模式] 没有找到可用的屏幕源')
      }
    } catch (error) {
      this.logFn('[信令模式] 屏幕捕获失败: ' + error.message)
      console.error('[信令模式] 屏幕捕获详细错误:', error)
    }
  }

  stopScreenCapture() {
    if (this.videoFrameTransmitter) {
      this.videoFrameTransmitter.stop()
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => {
        track.stop()
      })
      this.currentStream = null
    }

    if (this.peerConnection) {
      const senders = this.peerConnection.getSenders()
      senders.forEach(sender => {
        if (sender.track) {
          try { this.peerConnection.removeTrack(sender) } catch (e) {}
        }
      })
    }
  }

  _setupServiceFrameReceiver() {
    var self = this
    window.electronAPI.onServiceFrame(function(frameData) {
      // 优先使用优化视频通道，仅在其不可用时回退到数据通道
      if (self.optimizedVideoChannel && self.optimizedVideoChannel.readyState === 'open') {
        self.videoFrameTransmitter.sendEncodedFrame(frameData.jpeg, frameData.width, frameData.height)
      } else if (self.dataChannelManager && self.dataChannelManager.isOpen()) {
        self.dataChannelManager.send({
          type: 'service-video-frame',
          width: frameData.width,
          height: frameData.height,
          jpeg: frameData.jpeg,
          timestamp: frameData.timestamp
        })
      }
    })
    this.logFn('[信令模式] 服务帧接收器已就绪')
  }

  async refreshVideoStream(targetWidth, targetHeight) {
    this.logFn('[信令模式] 开始刷新视频流...')
    try {
      const sources = await window.electronAPI.getSources()
      this.logFn('[信令模式] 找到 ' + sources.length + ' 个屏幕源')

      if (sources.length === 0) {
        this.logFn('[信令模式] 未找到屏幕源，刷新失败')
        return
      }

      const maxWidth = targetWidth || this.config.screenCapture?.maxWidth || 1920
      const maxHeight = targetHeight || this.config.screenCapture?.maxHeight || 1080

      var selectedSourceId = window.getSelectedSourceId ? window.getSelectedSourceId() : null
      if (!selectedSourceId) {
        selectedSourceId = sources.find(function(s) { return s.id && s.id.startsWith('screen:') })?.id || (sources.length > 0 ? sources[0].id : null)
      }
      this.logFn('[信令模式] 刷新使用捕获源: ' + (selectedSourceId || '无') + ', 目标分辨率: ' + maxWidth + 'x' + maxHeight)

      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
            maxFrameRate: this.config.screenCapture?.maxFrameRate || 30
          }
        }
      })

      this.logFn('[信令模式] 屏幕捕获成功，获取到 ' + newStream.getVideoTracks().length + ' 个视频轨道')

      const newTracks = newStream.getVideoTracks()
      const senders = this.peerConnection.getSenders()
      const videoSender = senders.find(s => s.track && s.track.kind === 'video')

      if (videoSender && newTracks.length > 0) {
        // 先替换轨道，再停止旧流 —— 避免发送端出现无视频帧的空隙
        this.logFn('[信令模式] 使用 replaceTrack 替换视频轨道...')
        const oldStream = this.currentStream
        await videoSender.replaceTrack(newTracks[0])
        this.currentStream = newStream

        // 替换成功后，安全停止旧的流
        if (oldStream) {
          oldStream.getTracks().forEach(track => track.stop())
        }
        this.logFn('[信令模式] 视频轨道已替换，无需重新协商')
      } else {
        // 没有 sender 时回退到 addTrack 方式
        this.logFn('[信令模式] 未找到视频 sender，使用 addTrack 方式...')
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop())
        }
        this.currentStream = newStream
        newTracks.forEach(track => {
          this.logFn('[信令模式] 添加视频轨道: ' + track.label)
          const sender = this.peerConnection.addTrack(track, this.currentStream)
          try {
            const parameters = sender.getParameters()
            if (!parameters.encodings || parameters.encodings.length === 0) {
              parameters.encodings = [{}]
            }
            parameters.encodings[0].maxBitrate = 8000000
            parameters.encodings[0].maxFramerate = 30
            sender.setParameters(parameters)
          } catch (e) {
            this.logFn('[信令模式] 设置编码参数失败: ' + e.message)
          }
        })

        this.logFn('[信令模式] 视频流已刷新，发起重新协商...')
        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)

        this.signalingClient.send('offer', {
          sessionId: this.currentSessionId,
          offer: {
            type: offer.type,
            sdp: offer.sdp
          },
          toDeviceId: this.incomingFromDeviceId
        })

        this.logFn('[信令模式] 重新协商 offer 已发送')
      }
    } catch (error) {
      this.logFn('[信令模式] 刷新视频流失败: ' + error.message)
      console.error('[信令模式] 刷新视频流详细错误:', error)
    }
  }

  setupInputEventListeners() {
    window.electronAPI.on('remote-input', (data) => {
      if (this.videoFrameTransmitter && data.x !== undefined && data.y !== undefined) {
        var inputType = data.type || data.inputType || 'unknown'
        this.videoFrameTransmitter.markInputRegion(data.x, data.y, inputType)
      }
    })
  }

  // ========== 连接恢复机制 ==========

  _handleIceStateChange(state) {
    if (state === 'failed' && !this._iceRestartInProgress && !this._isDisconnecting) {
      this.logFn('[信令模式] ICE连接失败，尝试 ICE restart...')
      this._attemptIceRestart()
    }
  }

  _handleConnectionStateChange(state) {
    if (state === 'failed' && !this._iceRestartInProgress && !this._isDisconnecting) {
      this.logFn('[信令模式] WebRTC连接失败，尝试 ICE restart...')
      this._attemptIceRestart()
    } else if (state === 'disconnected') {
      this.logFn('[信令模式] WebRTC连接断开，等待自动恢复...')
    }
  }

  async _attemptIceRestart() {
    if (this._iceRestartInProgress) return
    this._iceRestartInProgress = true

    try {
      this.logFn('[信令模式] 开始 ICE restart...')

      // 仅主控端发起 ICE restart（被控端不主动发起）
      if (!this.isController) {
        this.logFn('[信令模式] 被控端不主动发起 ICE restart，等待主控端')
        this._iceRestartInProgress = false
        return
      }

      const offer = await this.peerConnection.createOffer({ iceRestart: true })
      await this.peerConnection.setLocalDescription(offer)

      this.signalingClient.send('offer', {
        sessionId: this.currentSessionId,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        toDeviceId: this.incomingFromDeviceId
      })

      this.logFn('[信令模式] ICE restart offer 已发送')

      // 等待 ICE restart 完成（最多10秒）
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logFn('[信令模式] ICE restart 超时')
          resolve()
        }, 10000)

        const originalHandler = this.peerConnection.oniceconnectionstatechange
        this.peerConnection.oniceconnectionstatechange = () => {
          const iceState = this.peerConnection.iceConnectionState
          this.logFn('[信令模式] ICE restart 中 ICE 状态: ' + iceState)
          if (iceState === 'connected' || iceState === 'completed') {
            clearTimeout(timeout)
            this.logFn('[信令模式] ICE restart 成功')
            // 恢复ICE状态处理
            this.peerConnection.oniceconnectionstatechange = () => {
              this._handleIceStateChange(this.peerConnection.iceConnectionState)
            }
            resolve()
          } else if (iceState === 'failed') {
            clearTimeout(timeout)
            this.peerConnection.oniceconnectionstatechange = () => {
              this._handleIceStateChange(this.peerConnection.iceConnectionState)
            }
            resolve()
          }
        }
      })
    } catch (error) {
      this.logFn('[信令模式] ICE restart 失败: ' + error.message)
    } finally {
      this._iceRestartInProgress = false
    }
  }

  async _attemptDataChannelRecovery() {
    const MAX_DC_RECOVERY_ATTEMPTS = 3
    if (this._recoveryInProgress || this._isDisconnecting) return

    // 初始化或检查次数限制
    if (!this._dcRecoveryAttempts) this._dcRecoveryAttempts = 0
    if (this._dcRecoveryAttempts >= MAX_DC_RECOVERY_ATTEMPTS) {
      this.logFn('[信令模式] 数据通道恢复次数已达上限(' + MAX_DC_RECOVERY_ATTEMPTS + ')，停止尝试')
      return
    }

    this._recoveryInProgress = true
    this._dcRecoveryAttempts++
    this.logFn('[信令模式] 开始数据通道恢复... (第' + this._dcRecoveryAttempts + '/' + MAX_DC_RECOVERY_ATTEMPTS + '次)')

    try {
      // 清理旧的数据通道状态
      if (this.inputChannel) {
        try { this.inputChannel.close() } catch (e) {}
        this.inputChannel = null
        this.inputChannelReady = false
      }

      // 通过信令服务器通知主控端重新发起重协商
      this.signalingClient.send('request-renegotiate', {
        sessionId: this.currentSessionId,
        fromDeviceId: this.myDeviceId,
        toDeviceId: this.incomingFromDeviceId
      })
      this.logFn('[信令模式] 已发送重协商请求到主控端')

      // 等待主控端重新发送 offer（最多30秒）
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logFn('[信令模式] 等待重协商offer超时')
          resolve()
        }, 30000)

        const originalOnOffer = this.signalingClient.config.onOffer || this.signalingClient._callbacks?.onOffer
        const checkOffer = (data) => {
          if (this._recoveryInProgress && data && data.fromDeviceId === this.incomingFromDeviceId) {
            clearTimeout(timeout)
            this.logFn('[信令模式] 收到重协商offer，数据通道恢复中...')
            resolve()
          }
        }
        // 临时监听
        this._recoveryOfferHandler = checkOffer

        // 30秒后清理
        setTimeout(() => {
          this._recoveryOfferHandler = null
        }, 31000)
      })

      this.logFn('[信令模式] 数据通道恢复完成')
    } catch (error) {
      this.logFn('[信令模式] 数据通道恢复失败: ' + error.message)
    } finally {
      this._recoveryInProgress = false
    }
  }

  _startChannelHealthCheck() {
    this._stopChannelHealthCheck()
    this._lastPongTime = Date.now()
    const PING_INTERVAL = 5000   // 每5秒ping一次
    const PONG_TIMEOUT = 15000   // 15秒没收到pong认为异常

    this._channelHealthTimer = setInterval(() => {
      if (!this.dataChannelManager || !this.dataChannelManager.isOpen()) {
        return
      }
      if (this._isDisconnecting || this._recoveryInProgress) {
        return
      }

      // 直接检查底层 DataChannel 的 readyState，避免 isOpen() 假正常
      if (this.dataChannelManager.dataChannel && this.dataChannelManager.dataChannel.readyState !== 'open') {
        this.logFn('[信令模式] 数据通道 readyState 异常: ' + this.dataChannelManager.dataChannel.readyState + '，触发恢复')
        this._attemptDataChannelRecovery()
        return
      }

      // 检查上次pong的时间
      const elapsed = Date.now() - this._lastPongTime
      if (elapsed > PONG_TIMEOUT) {
        this.logFn('[信令模式] 数据通道心跳超时（' + elapsed + 'ms），开始恢复...')
        this._attemptDataChannelRecovery()
        return
      }

      // 发送ping
      try {
        this.dataChannelManager.send({ type: 'ping', timestamp: Date.now() })
      } catch (e) {
        this.logFn('[信令模式] 心跳ping发送失败: ' + e.message)
      }
    }, PING_INTERVAL)

    this.logFn('[信令模式] 数据通道心跳监测已启动（间隔=' + PING_INTERVAL + 'ms, 超时=' + PONG_TIMEOUT + 'ms）')
  }

  _stopChannelHealthCheck() {
    if (this._channelHealthTimer) {
      clearInterval(this._channelHealthTimer)
      this._channelHealthTimer = null
      this.logFn('[信令模式] 数据通道心跳监测已停止')
    }
  }

  _setupAuxChannel(channelType, channel) {
    var self = this
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        self._handleAuxMessage(channelType, data)
      } catch (e) {
        self.logFn('[信令模式] 辅助通道消息解析错误: ' + e.message)
      }
    }

    channel.onclose = () => {
      self.logFn('[信令模式] 辅助通道关闭: ' + channelType)
      self.auxiliaryChannels.delete(channelType)
    }
  }

  _handleAuxMessage(channelType, data) {
    if (channelType === 'clipboard') {
      if (data.action === 'sync' && data.content) {
        navigator.clipboard.writeText(data.content).then(() => {
          this.logFn('[信令模式] 剪贴板已同步')
        }).catch(err => {
          this.logFn('[信令模式] 剪贴板同步失败: ' + err.message)
        })
      }
    } else if (channelType === 'file-transfer') {
      this._handleFileTransferMessage(data)
    }
  }

  _handleFileTransferMessage(data) {
    if (!data || !data.action) return

    switch (data.action) {
      case 'file-request':
        this._handleFileRequest()
        break
      case 'file-accept':
        this._handleFileAccept(data)
        break
      case 'file-reject':
        this._activeFileTransfer = null
        break
    }
  }

  async _handleFileRequest() {
    try {
      const result = await window.electronAPI.fileTransferSelectFiles()
      if (result.canceled || !result.files || result.files.length === 0) return

      const file = result.files[0]
      const fileInfo = {
        id: 'ft_' + Date.now(),
        name: file.name,
        path: file.path,
        size: file.size,
        totalChunks: Math.ceil(file.size / this._fileTransferChunkSize)
      }
      this._activeFileTransfer = fileInfo

      const channel = this.auxiliaryChannels.get('file-transfer')
      if (!channel || channel.readyState !== 'open') {
        this.logFn('[信令模式] 文件传输通道不可用')
        return
      }

      channel.send(JSON.stringify({
        action: 'file-offer',
        fileId: fileInfo.id,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        totalChunks: fileInfo.totalChunks,
        chunkSize: this._fileTransferChunkSize
      }))

      this.logFn('[信令模式] 已发送文件传输请求: ' + fileInfo.name)
    } catch (e) {
      this.logFn('[信令模式] 文件选择失败: ' + e.message)
    }
  }

  _handleFileAccept(data) {
    if (!this._activeFileTransfer || this._activeFileTransfer.id !== data.fileId) return
    this._sendFileChunks(this._activeFileTransfer, 0)
  }

  async _sendFileChunks(file, startChunk) {
    var self = this
    var chunkIndex = startChunk || 0
    var totalChunks = file.totalChunks
    var CHUNK_SIZE = this._fileTransferChunkSize

    const channel = this.auxiliaryChannels.get('file-transfer')

    async function sendNext() {
      if (chunkIndex >= totalChunks) {
        if (channel && channel.readyState === 'open') {
          channel.send(JSON.stringify({
            action: 'file-complete',
            fileId: file.id,
            totalChunks: totalChunks
          }))
        }
        self._activeFileTransfer = null
        return
      }

      var offset = chunkIndex * CHUNK_SIZE
      var size = Math.min(CHUNK_SIZE, file.size - offset)

      try {
        var result = await window.electronAPI.fileTransferReadChunk(file.path, offset, size)
        if (channel && channel.readyState === 'open') {
          channel.send(JSON.stringify({
            action: 'file-chunk',
            fileId: file.id,
            chunkIndex: chunkIndex,
            data: result.data,
            bytesRead: result.bytesRead
          }))
        }
        chunkIndex++
        setTimeout(sendNext, 0)
      } catch (e) {
        self.logFn('[信令模式] 文件读取失败: ' + e.message)
        self._activeFileTransfer = null
      }
    }

    sendNext()
  }

  reset() {
    this._isDisconnecting = true
    this._stopChannelHealthCheck()
    this._iceRestartInProgress = false
    this._recoveryInProgress = false
    this._recoveryOfferHandler = null

    this.currentSessionId = null
    this.incomingFromDeviceId = null
    this.isController = false
    this.pendingIceCandidates = []

    this.stopScreenCapture()

    this.auxiliaryChannels.forEach((channel) => {
      try { channel.close() } catch (e) {}
    })
    this.auxiliaryChannels.clear()
    this._activeFileTransfer = null

    if (this.videoFrameTransmitter) {
      this.videoFrameTransmitter.reset()
      this.videoFrameTransmitter = null
    }

    if (this.dataChannelManager) {
      try {
        this.dataChannelManager.close()
      } catch (e) {
        this.logFn('[信令模式] 关闭数据通道管理器时出错:', e)
      }
      this.dataChannelManager = null
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close()
      } catch (e) {
        this.logFn('[信令模式] 关闭 PeerConnection 时出错:', e)
      }
      this.peerConnection = null
    }

    this._controlledIpcListenersSetup = false

    if (window.electronAPI && window.electronAPI.removeAllListeners) {
      window.electronAPI.removeAllListeners('remote-input')
    }

    this.logFn('信令模式管理器已重置')
  }
}

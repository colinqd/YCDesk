class DirectModeManager {
  constructor(options = {}) {
    this.currentDirectClientId = null
    this.directPeerConnection = null
    this.isDirectController = false
    this.dataChannelManager = null
    this.pendingIceCandidates = []
    this.pendingStartSignal = null
    this.myDeviceId = ''
    this.logFn = options.log || console.log
    this.uiManager = options.uiManager
    this.config = options.config || {}
    this.onMessage = options.onMessage || null
    this.auxiliaryChannels = new Map()
    this.currentStream = null
    this.videoFrameTransmitter = null
    this._controlledIpcListenersSetup = false
    this.useOptimizedTransfer = options.useOptimizedTransfer !== false
    this.OPTIMIZED_VIDEO_CHANNEL = 'optimized-video'
    this.optimizedVideoChannel = null
    this._fileTransferChunkSize = 16 * 1024
    this._activeFileTransfer = null
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
  }

  async startListening(port) {
    this.logFn('startListening 被调用，端口: ' + port)
    try {
      this.logFn('正在调用 window.electronAPI.startDirectServer...')
      const result = await window.electronAPI.startDirectServer(port)
      this.logFn('startDirectServer 返回结果: ' + JSON.stringify(result))
      if (result && result.success) {
        this.logFn('开始监听端口 ' + port + '，等待连接...')
        if (this.uiManager) {
          this.uiManager.updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
        }
        return true
      } else {
        const errorMsg = result?.error || '未知错误'
        this.logFn('启动监听失败: ' + errorMsg)
        alert('监听失败: ' + errorMsg)
        return false
      }
    } catch (error) {
      this.logFn('启动监听失败: ' + error.message)
      console.error('startListening 错误:', error)
      alert('启动监听失败: ' + error.message)
      return false
    }
  }

  async stopListening() {
    try {
      await window.electronAPI.stopDirectServer()
      this.logFn('已停止监听')
      // 清理 WebRTC 连接、屏幕捕获等所有资源
      this.reset()
      if (this.uiManager) {
        this.uiManager.updateServerStatus('就绪', 'disconnected')
      }
      return true
    } catch (error) {
      this.logFn('停止监听失败: ' + error.message)
      return false
    }
  }

  async connect(host, port) {
    if (!host) {
      alert('请输入对方IP地址')
      return false
    }

    this.logFn('正在连接到 ' + host + ':' + port + '...')

    try {
      const result = await window.electronAPI.connectDirectClient(host, port)
      if (result && result.success) {
        this.logFn('已连接到 ' + host + ':' + port)
        this.currentDirectClientId = result.clientId
        this.isDirectController = true
        await this.startControllerConnection(result.clientId)
        return true
      } else {
        const errorMsg = result?.error || '连接失败'
        this.logFn('连接失败: ' + errorMsg)
        alert('连接失败: ' + errorMsg)
        return false
      }
    } catch (error) {
      this.logFn('连接失败: ' + error.message)
      alert('连接失败: ' + error.message)
      return false
    }
  }

  async sendMessage(message) {
    if (!this.currentDirectClientId) {
      this.logFn('无法发送消息：未连接')
      return false
    }

    try {
      const result = await window.electronAPI.sendDirectMessage(this.currentDirectClientId, message)
      if (!result || !result.success) {
        this.logFn('发送消息失败: ' + (result?.error || '未知错误'))
        return false
      }
      return true
    } catch (e) {
      this.logFn('发送消息失败: ' + e.message)
      return false
    }
  }

  async handleMessage(clientId, message) {
    try {
      switch (message.type) {
        case 'offer':
          if (this.isDirectController) {
            this.logFn('主控端收到 offer，转发给远程窗口')
            await window.electronAPI.sendToRemoteWindow('webrtc-offer', { offer: message.offer })
          } else {
            await this.handleOffer(clientId, message.offer)
          }
          break
        case 'answer':
          if (this.isDirectController) {
            this.logFn('主控端收到 answer，转发给远程窗口')
            await window.electronAPI.sendToRemoteWindow('webrtc-answer', { answer: message.answer })
          } else {
            await this.handleAnswer(clientId, message.answer)
          }
          break
        case 'ice-candidate':
          if (this.isDirectController) {
            this.logFn('主控端收到 ICE 候选，转发给远程窗口')
            await window.electronAPI.sendToRemoteWindow('webrtc-ice-candidate', { candidate: message.candidate })
          } else {
            await this.handleIceCandidate(clientId, message.candidate)
          }
          break
        case 'screen-lock-state':
          this.logFn('主控端通过TCP收到被控端锁屏状态: ' + JSON.stringify(message))
          if (this.isDirectController && window.electronAPI) {
            window.electronAPI.sendToRemoteWindow('unlock-state-changed', {
              isLocked: message.isLocked,
              autoUnlockEnabled: message.autoUnlockEnabled
            })
          }
          break
      }
    } catch (error) {
      console.error('处理消息详细错误:', error)
    }
  }

  async startControllerConnection(clientId) {
    this.logFn('作为主控端建立直连，打开远程窗口')
    window.electronAPI.openRemoteWindow()
    
    // 保存启动信号，等待远程窗口准备好
    this.pendingStartSignal = {
      mode: 'controller',
      clientId: clientId
    }
    this.logFn('保存启动信号，等待远程窗口准备就绪: ' + JSON.stringify(this.pendingStartSignal))
  }

  async startControlledConnection(clientId) {
    this.logFn('作为被控端建立直连')
    this.currentDirectClientId = clientId
    this.isDirectController = false
    await this.createPeerConnection(clientId)
    
    // 添加锁屏状态监听，发送给主控端
    if (!this._controlledIpcListenersSetup && window.electronAPI) {
      this._controlledIpcListenersSetup = true
      window.electronAPI.on('unlock-state-changed', (data) => {
        console.log('[DirectModeManager] 收到IPC锁屏状态变更: ' + JSON.stringify(data))
        this.logFn('收到本地锁屏状态变更: ' + JSON.stringify(data))
        if (this.dataChannelManager) {
          console.log('[DirectModeManager] 正在通过数据通道发送...')
          this.dataChannelManager.send({
            type: 'unlock-state-changed',
            ...data
          })
          console.log('[DirectModeManager] 数据通道 send() 调用完成')
        } else {
          console.log('[DirectModeManager] dataChannelManager 不存在，跳过')
        }
      })
    }
    
    this.logFn('被控端: 等待主控端发送 offer...')
  }

  async createAndSendOffer() {
    this.logFn('创建 offer...')
    const offer = await this.directPeerConnection.createOffer()
    await this.directPeerConnection.setLocalDescription(offer)
    
    this.logFn('发送 offer 给主控端')
    await this.sendMessage({
      type: 'offer',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
  }

  async createPeerConnection(clientId) {
    this.directPeerConnection = new RTCPeerConnection({ iceServers: [] })

    this.dataChannelManager = new DataChannelManager({
      logger: { log: this.logFn.bind(this), error: console.error }
    })

    this.dataChannelManager.setOnOpen(() => {
      this.logFn('数据通道已打开')
    })

    this.dataChannelManager.setOnMessage((data) => {
      if (data.type === 'input' || data.inputType) {
        this._diagLog('DataChannelManager收到: type=' + data.type + ' inputType=' + data.inputType + (data.inputType === 'text_input' ? ' text=' + (data.text || '').substring(0, 30) : ''))
        this.logFn('收到输入，转发到主进程: ' + JSON.stringify(data))
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'video-refresh-request') {
        this.logFn('收到视频刷新请求，重新初始化屏幕捕获...')
        this.refreshVideoStream()
      } else if (data.type === 'resolution-change') {
        this.logFn('收到分辨率变更请求: ' + data.width + 'x' + data.height)
        this.refreshVideoStream(data.width, data.height)
      } else if (data.type === 'resolution-request') {
        this.logFn('收到分辨率请求: ' + data.width + 'x' + data.height)
        this.dataChannelManager.send({
          type: 'resolution-response',
          width: this.config.screenCapture?.maxWidth || 1920,
          height: this.config.screenCapture?.maxHeight || 1080
        })
      }
    })

    this.dataChannelManager.setOnClose(() => {
      this.logFn('数据通道已关闭')
    })

    this.dataChannelManager.setOnError((error) => {
      console.error('数据通道错误:', error)
    })

    this.directPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.logFn('发送ICE候选')
        this.sendMessage({
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }
        })
      }
    }

    this.directPeerConnection.oniceconnectionstatechange = () => {
      this.logFn('ICE连接状态: ' + this.directPeerConnection.iceConnectionState)
    }

    this.directPeerConnection.onconnectionstatechange = () => {
      this.logFn('直连状态: ' + this.directPeerConnection.connectionState)

      if (this.directPeerConnection.connectionState === 'connected') {
        this.logFn('WebRTC连接已建立')
      } else if (this.directPeerConnection.connectionState === 'failed' || 
                 this.directPeerConnection.connectionState === 'disconnected' ||
                 this.directPeerConnection.connectionState === 'closed') {
      }
    }

    this.directPeerConnection.ondatachannel = (event) => {
      const channel = event.channel
      this.logFn('收到数据通道: ' + channel.label)
      
      if (channel.label === 'control') {
        this.dataChannelManager.setDataChannel(channel)
      } else if (channel.label === this.OPTIMIZED_VIDEO_CHANNEL) {
        this.logFn('收到优化视频通道')
        this.optimizedVideoChannel = channel
      } else if (channel.label === 'input') {
        channel.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (data.type === 'input' || data.inputType) {
              this._diagLog('input通道收到: type=' + data.type + ' inputType=' + data.inputType + (data.inputType === 'text_input' ? ' text=' + (data.text || '').substring(0, 30) : ''))
              this.logFn('input通道收到输入: type=' + data.inputType + ' inputType=' + data.inputType)
              window.electronAPI.send('remote-input', data)
            }
          } catch (err) {
            this._diagLog('input通道解析失败: ' + err.message)
            this.logFn('input通道消息解析失败: ' + err.message)
          }
        }
        channel.onopen = () => {
          this.logFn('input数据通道已打开')
        }
        channel.onerror = (err) => {
          this.logFn('input数据通道错误: ' + (err.message || err))
        }
      } else if (channel.label.startsWith('aux-')) {
        const channelType = channel.label.replace('aux-', '')
        this.setupAuxiliaryChannel(channelType, channel)
      }
    }

    if (this.useOptimizedTransfer) {
      this.videoFrameTransmitter = new VideoFrameTransmitter({
        logger: { log: this.logFn.bind(this), error: console.error }
      })

      this.videoFrameTransmitter.onStatsUpdate = (stats) => {
        this.logFn('[传输统计] 帧:' + stats.framesSent +
          ' 关键帧:' + stats.keyFramesSent +
          ' 差异帧:' + stats.deltaFramesSent +
          ' 平均脏区域:' + stats.avgDirtyRegions.toFixed(1))
      }

      this.videoFrameTransmitter.onFallbackToStandard = () => {
        this.logFn('优化传输回退到标准模式')
      }

      this.logFn('优化视频传输模式已初始化')
    }

    this.setupInputEventListeners()
  }

  async handleOffer(clientId, offer) {
    if (!offer) {
      this.logFn('错误: offer为空')
      return
    }

    this.logFn('收到offer')

    try {
      this.logFn('设置远程描述...')
      await this.directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      this.logFn('远程描述设置成功')

      await this.addPendingIceCandidates()

      // 先捕获屏幕，再创建包含视频轨道的 answer（与信令模式一致）
      this.logFn('开始捕获屏幕...')
      const maxWidth = this.config.screenCapture?.maxWidth || 1920
      const maxHeight = this.config.screenCapture?.maxHeight || 1080
      const actualResolution = await this.startScreenCapture(maxWidth, maxHeight)
      this.logFn('屏幕捕获完成，分辨率: ' + actualResolution.width + 'x' + actualResolution.height)

      this.logFn('创建answer（含视频）...')
      const answer = await this.directPeerConnection.createAnswer()
      await this.directPeerConnection.setLocalDescription(answer)
      this.logFn('本地描述设置成功')

      await this.sendMessage({
        type: 'answer',
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      })

      this.logFn('已发送answer（含视频），等待数据通道打开...')

      await this.waitForDataChannelOpen()

      this.logFn('数据通道已打开，等待分辨率请求...')
      const resolution = await this.waitForResolutionRequest()
      this.logFn('收到分辨率请求: ' + resolution.width + 'x' + resolution.height)

      this.dataChannelManager.send({
        type: 'resolution-response',
        width: actualResolution.width,
        height: actualResolution.height
      })

      this.logFn('直连被控端连接建立完成: ' + actualResolution.width + 'x' + actualResolution.height)
    } catch (error) {
      this.logFn('处理offer失败: ' + error.message)
      console.error('处理offer详细错误:', error)
    }
  }
  
  waitForDataChannelOpen() {
    return new Promise((resolve, reject) => {
      if (this.dataChannelManager && this.dataChannelManager.isOpen()) {
        this.logFn('数据通道已经打开')
        resolve()
        return
      }

      let checkInterval = null
      const timeout = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval)
        reject(new Error('等待数据通道打开超时'))
      }, 15000)

      checkInterval = setInterval(() => {
        if (this.dataChannelManager && this.dataChannelManager.isOpen()) {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
    })
  }
  
  waitForResolutionRequest() {
    return new Promise((resolve, reject) => {
      const originalOnMessage = this.dataChannelManager.callbacks ? this.dataChannelManager.callbacks.onMessage : null
      const timeout = setTimeout(() => {
        this.dataChannelManager.setOnMessage(originalOnMessage)
        reject(new Error('等待分辨率请求超时'))
      }, 15000)

      this.dataChannelManager.setOnMessage((data) => {
        if (data.type === 'resolution-request') {
          clearTimeout(timeout)
          this.dataChannelManager.setOnMessage(originalOnMessage)
          resolve(data)
        } else if (originalOnMessage) {
          originalOnMessage(data)
        }
      })
    })
  }
  
  handleResolutionRequest(data) {
    this.logFn('收到分辨率请求: ' + data.width + 'x' + data.height)
    this.logFn('根据客户端窗口尺寸调整虚拟显示器分辨率...')
    
    this.dataChannelManager.send({
      type: 'resolution-response',
      width: this.config.screenCapture?.maxWidth || 1920,
      height: this.config.screenCapture?.maxHeight || 1080
    })
    
    this.logFn('已发送分辨率响应')
  }

  async handleAnswer(clientId, answer) {
    if (!answer) {
      this.logFn('错误: answer为空')
      return
    }

    try {
      await this.directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      this.logFn('answer设置成功')
      await this.addPendingIceCandidates()
    } catch (error) {
      this.logFn('设置answer失败: ' + error.message)
    }
  }

  async handleIceCandidate(clientId, candidate) {
    if (!candidate) {
      return
    }

    try {
      if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) {
        return
      }

      if (!this.directPeerConnection || !this.directPeerConnection.remoteDescription) {
        // 限制 ICE 候选缓存数量，防止内存泄漏
        const MAX_ICE_CANDIDATES = 50
        if (this.pendingIceCandidates.length >= MAX_ICE_CANDIDATES) {
          this.logFn('ICE 候选缓存已满，丢弃最早的候选')
          this.pendingIceCandidates.shift() // 移除最早的候选
        }
        this.logFn('缓存 ICE 候选（远程描述未设置）')
        this.pendingIceCandidates.push(candidate)
        return
      }

      await this.directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      this.logFn('ICE候选添加成功')
    } catch (error) {
      this.logFn('添加ICE候选失败: ' + error.message)
    }
  }

  async addPendingIceCandidates() {
    this.logFn('添加缓存的ICE候选: ' + this.pendingIceCandidates.length + ' 个')
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        this.logFn('添加缓存ICE候选失败: ' + error.message)
      }
    }
    this.pendingIceCandidates = []
  }

  async startScreenCapture(targetWidth, targetHeight) {
    try {
      this.stopScreenCapture()

      var selectedSourceId = window.getSelectedSourceId ? window.getSelectedSourceId() : null
      const sources = await window.electronAPI.getSources()
      this.logFn('可用屏幕源: ' + sources.length + ' 个')
      if (!selectedSourceId) {
        selectedSourceId = sources.find(function(s) { return s.id && s.id.startsWith('screen:') })?.id || (sources.length > 0 ? sources[0].id : null)
      }

      if (!selectedSourceId) {
        this.logFn('【错误】没有找到可用的屏幕源，无法捕获屏幕')
        // 仍然发送重协商 offer（可能不含视频），但返回空分辨率让上层知晓
        this.logFn('警告: 将发送不含视频的 renegotiation offer')
        return { width: 0, height: 0, noSource: true }
      }
      this.logFn('选定捕获源: ' + selectedSourceId)

      var maxWidth = targetWidth || 1920
      var maxHeight = targetHeight || 1080

      var useServiceCapture = false
      try { useServiceCapture = localStorage.getItem('ycdesk_use_service_capture') === 'true' } catch(e) {}
      if (useServiceCapture && window.electronAPI && window.electronAPI.serviceStartCapture) {
        this.logFn('尝试使用服务级捕获（绕过反截屏保护）')
        try {
          await window.electronAPI.serviceStartCapture({
            fps: 30,
            jpegQuality: 70,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
            desktopTarget: 'auto'
          })
          this.logFn('服务级捕获已启动')
          this._setupServiceFrameReceiver()
          return { width: maxWidth || 1920, height: maxHeight || 1080 }
        } catch (e) {
          this.logFn('服务捕获启动失败: ' + e.message + '，回退到标准模式')
        }
      }

      if (selectedSourceId) {

        if (this.useOptimizedTransfer && this.videoFrameTransmitter && this.optimizedVideoChannel && this.optimizedVideoChannel.readyState === 'open') {
          this.logFn('使用优化传输模式捕获屏幕')
          this.videoFrameTransmitter.initialize(this.optimizedVideoChannel, maxWidth, maxHeight)
          const resolution = await this.videoFrameTransmitter.start(selectedSourceId, maxWidth, maxHeight)
          if (resolution) {
            this.logFn('优化屏幕捕获成功，分辨率: ' + resolution.width + 'x' + resolution.height)
            return resolution
          }
          this.logFn('优化传输启动失败，回退到标准模式')
        }

        this.currentStream = await navigator.mediaDevices.getUserMedia({
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

        const tracks = this.currentStream.getVideoTracks()
        this.logFn('获取到 ' + tracks.length + ' 个媒体轨道')

        if (tracks.length === 0) {
          this.logFn('【错误】获取到0个视频轨道，屏幕捕获可能失败')
          return { width: 0, height: 0, noSource: true }
        }

        tracks.forEach(track => {
          const sender = this.directPeerConnection.addTrack(track, this.currentStream)
          this.logFn('已添加媒体轨道: ' + track.kind + ', label: ' + track.label)

          try {
            const parameters = sender.getParameters()
            if (!parameters.encodings || parameters.encodings.length === 0) {
              parameters.encodings = [{}]
            }
            parameters.encodings[0].maxBitrate = 8000000
            parameters.encodings[0].maxFramerate = 30
            sender.setParameters(parameters)
            this.logFn('已设置视频编码参数: maxBitrate=8Mbps, maxFramerate=30')
          } catch (e) {
            this.logFn('设置视频编码参数失败: ' + e.message)
          }
        })

        const settings = tracks[0].getSettings()
        const actualResolution = {
          width: settings.width || maxWidth,
          height: settings.height || maxHeight
        }

        this.logFn('屏幕捕获成功，分辨率: ' + actualResolution.width + 'x' + actualResolution.height)
        return actualResolution
      } else {
        this.logFn('没有找到可用的屏幕源')
        return { width: 0, height: 0, noSource: true }
      }
    } catch (error) {
      this.logFn('屏幕捕获失败: ' + error.message)
      console.error('屏幕捕获详细错误:', error)
      return { width: 0, height: 0, noSource: true }
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
    
    if (this.directPeerConnection) {
      const senders = this.directPeerConnection.getSenders()
      senders.forEach(sender => {
        if (sender.track) {
          try { this.directPeerConnection.removeTrack(sender) } catch (e) {}
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
    this.logFn('服务帧接收器已就绪')
  }

  async refreshVideoStream(targetWidth, targetHeight) {
    this.logFn('开始刷新视频流...')
    try {
      const sources = await window.electronAPI.getSources()
      if (sources.length === 0) {
        this.logFn('未找到屏幕源，刷新失败')
        return
      }

      const maxWidth = targetWidth || this.config.screenCapture?.maxWidth || 1920
      const maxHeight = targetHeight || this.config.screenCapture?.maxHeight || 1080

      var selectedSourceId = window.getSelectedSourceId ? window.getSelectedSourceId() : null
      if (!selectedSourceId) {
        selectedSourceId = sources.find(function(s) { return s.id && s.id.startsWith('screen:') })?.id || (sources.length > 0 ? sources[0].id : null)
      }
      this.logFn('刷新使用捕获源: ' + (selectedSourceId || '无') + ', 目标分辨率: ' + maxWidth + 'x' + maxHeight)

      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
            maxFrameRate: 30
          }
        }
      })

      const newTracks = newStream.getVideoTracks()
      const senders = this.directPeerConnection.getSenders()
      const videoSender = senders.find(s => s.track && s.track.kind === 'video')

      if (videoSender && newTracks.length > 0) {
        // 先替换轨道，再停止旧流 —— 避免发送端出现无视频帧的空隙
        this.logFn('使用 replaceTrack 替换视频轨道...')
        const oldStream = this.currentStream
        await videoSender.replaceTrack(newTracks[0])
        this.currentStream = newStream

        // 替换成功后，安全停止旧的流
        if (oldStream) {
          oldStream.getTracks().forEach(track => track.stop())
        }
        this.logFn('视频轨道已替换，无需重新协商')
      } else {
        // 没有 sender 时回退到 addTrack 方式
        this.logFn('未找到视频 sender，使用 addTrack 方式...')
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop())
        }
        this.currentStream = newStream
        newTracks.forEach(track => {
          const sender = this.directPeerConnection.addTrack(track, this.currentStream)
          try {
            const parameters = sender.getParameters()
            if (!parameters.encodings || parameters.encodings.length === 0) {
              parameters.encodings = [{}]
            }
            parameters.encodings[0].maxBitrate = 8000000
            parameters.encodings[0].maxFramerate = 30
            sender.setParameters(parameters)
          } catch (e) {}
        })

        this.logFn('视频流已刷新，发起重新协商...')
        const offer = await this.directPeerConnection.createOffer()
        await this.directPeerConnection.setLocalDescription(offer)

        await this.sendMessage({
          type: 'offer',
          offer: {
            type: offer.type,
            sdp: offer.sdp
          }
        })

        this.logFn('重新协商 offer 已发送')
      }
    } catch (error) {
      this.logFn('刷新视频流失败: ' + error.message)
    }
  }

  setupAuxiliaryChannel(channelType, channel) {
    this.logFn('设置辅助通道: ' + channelType)
    this.auxiliaryChannels.set(channelType, channel)
    
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.handleAuxiliaryMessage(channelType, data)
      } catch (e) {
        this.logFn('辅助通道消息解析错误: ' + e.message)
      }
    }
    
    channel.onclose = () => {
      this.logFn('辅助通道关闭: ' + channelType)
      this.auxiliaryChannels.delete(channelType)
    }
  }
  
  handleAuxiliaryMessage(channelType, data) {
    if (channelType === 'clipboard') {
      if (data.action === 'sync' && data.content) {
        navigator.clipboard.writeText(data.content).then(() => {
          this.logFn('剪贴板内容已同步到本地')
        }).catch(err => {
          this.logFn('剪贴板同步失败: ' + err.message)
        })
      } else if (data.action === 'request') {
        navigator.clipboard.readText().then(content => {
          const channel = this.auxiliaryChannels.get('clipboard')
          if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify({
              action: 'sync',
              content: content || '',
              timestamp: Date.now()
            }))
          }
        }).catch(err => {
          this.logFn('读取剪贴板失败: ' + err.message)
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
        this.logFn('文件传输通道不可用')
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

      this.logFn('已发送文件传输请求: ' + fileInfo.name)
    } catch (e) {
      this.logFn('文件选择失败: ' + e.message)
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
        self.logFn('文件读取失败: ' + e.message)
        self._activeFileTransfer = null
      }
    }

    sendNext()
  }
  
  setupInputEventListeners() {
    window.electronAPI.on('remote-input', (data) => {
      if (this.videoFrameTransmitter && data.x !== undefined && data.y !== undefined) {
        var inputType = data.type || data.inputType || 'unknown'
        this.videoFrameTransmitter.markInputRegion(data.x, data.y, inputType)
      }
    })
  }

  reset() {
    this.currentDirectClientId = null
    this.isDirectController = false
    this.pendingIceCandidates = []
    
    this.stopScreenCapture()

    if (this.videoFrameTransmitter) {
      this.videoFrameTransmitter.reset()
      this.videoFrameTransmitter = null
    }
    
    this.auxiliaryChannels.forEach((channel) => {
      try { channel.close() } catch (e) {}
    })
    this.auxiliaryChannels.clear()

    if (this.dataChannelManager) {
      try {
        this.dataChannelManager.close()
      } catch (e) {
        this.logFn('关闭数据通道管理器时出错:', e)
      }
      this.dataChannelManager = null
    }

    if (this.directPeerConnection) {
      try {
        this.directPeerConnection.close()
      } catch (e) {
        this.logFn('关闭直连 PeerConnection 时出错:', e)
      }
      this.directPeerConnection = null
    }

    this._controlledIpcListenersSetup = false

    if (window.electronAPI && window.electronAPI.removeAllListeners) {
      window.electronAPI.removeAllListeners('remote-input')
    }

    this.logFn('直连模式管理器已重置')
  }
}

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
            window.electronAPI.sendToRemoteWindow('webrtc-offer', { offer: message.offer })
          } else {
            await this.handleOffer(clientId, message.offer)
          }
          break
        case 'answer':
          if (this.isDirectController) {
            this.logFn('主控端收到 answer，转发给远程窗口')
            window.electronAPI.sendToRemoteWindow('webrtc-answer', { answer: message.answer })
          } else {
            await this.handleAnswer(clientId, message.answer)
          }
          break
        case 'ice-candidate':
          if (this.isDirectController) {
            this.logFn('主控端收到 ICE 候选，转发给远程窗口')
            window.electronAPI.sendToRemoteWindow('webrtc-ice-candidate', { candidate: message.candidate })
          } else {
            await this.handleIceCandidate(clientId, message.candidate)
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
    
    this.logFn('被控端: 等待主控端发送 offer...')
  }

  async createAndSendOffer() {
    this.logFn('创建 offer...')
    const offer = await this.directPeerConnection.createOffer()
    await this.directPeerConnection.setLocalDescription(offer)
    
    this.logFn('发送 offer 给主控端')
    this.sendMessage({
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
      if (data.type === 'input') {
        this.logFn('收到输入，转发到主进程: ' + JSON.stringify(data))
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'hide-cursor') {
        if (data.hide) {
          window.electronAPI.hideCursor()
        } else {
          window.electronAPI.showCursor()
        }
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
        if (!this.isDirectController) {
          window.electronAPI.showCursor().catch(e => {
            console.error('显示光标失败:', e)
          })
        }
      }
    }

    this.directPeerConnection.ondatachannel = (event) => {
      const channel = event.channel
      this.logFn('收到数据通道: ' + channel.label)
      
      if (channel.label === 'control') {
        this.dataChannelManager.setDataChannel(channel)
      } else if (channel.label.startsWith('aux-')) {
        const channelType = channel.label.replace('aux-', '')
        this.setupAuxiliaryChannel(channelType, channel)
      }
    }
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

      this.logFn('创建初始answer（不含视频）...')
      const answer = await this.directPeerConnection.createAnswer()
      await this.directPeerConnection.setLocalDescription(answer)
      this.logFn('本地描述设置成功')

      this.sendMessage({
        type: 'answer',
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      })

      this.logFn('已发送初始answer，等待数据通道打开...')
      
      await this.waitForDataChannelOpen()
      
      this.logFn('数据通道已打开，等待分辨率请求...')
      const resolution = await this.waitForResolutionRequest()
      
      this.logFn('收到分辨率请求: ' + resolution.width + 'x' + resolution.height)
      this.logFn('根据客户端窗口尺寸调整虚拟显示器分辨率...')
      
      const targetWidth = Math.min(resolution.width, this.config.screenCapture?.maxWidth || 1920)
      const targetHeight = Math.min(resolution.height, this.config.screenCapture?.maxHeight || 1080)
      
      this.logFn('目标捕获分辨率: ' + targetWidth + 'x' + targetHeight)
      
      this.logFn('开始捕获屏幕...')
      const actualResolution = await this.startScreenCapture(targetWidth, targetHeight)
      
      this.logFn('创建renegotiation offer（含视频）...')
      const renegotiateOffer = await this.directPeerConnection.createOffer()
      await this.directPeerConnection.setLocalDescription(renegotiateOffer)
      
      this.sendMessage({
        type: 'offer',
        offer: {
          type: renegotiateOffer.type,
          sdp: renegotiateOffer.sdp
        }
      })
      
      this.dataChannelManager.send({
        type: 'resolution-response',
        width: actualResolution.width,
        height: actualResolution.height
      })
      
      this.logFn('已发送renegotiation offer和分辨率响应: ' + actualResolution.width + 'x' + actualResolution.height)
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
      
      const timeout = setTimeout(() => {
        reject(new Error('等待数据通道打开超时'))
      }, 15000)
      
      const checkInterval = setInterval(() => {
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
      const timeout = setTimeout(() => {
        reject(new Error('等待分辨率请求超时'))
      }, 15000)
      
      const originalOnMessage = this.dataChannelManager.callbacks ? this.dataChannelManager.callbacks.onMessage : null
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
      
      const sources = await window.electronAPI.getSources()
      this.logFn('可用屏幕源: ' + sources.length + ' 个')

      if (sources.length > 0) {
        const maxWidth = targetWidth || this.config.screenCapture?.maxWidth || 1920
        const maxHeight = targetHeight || this.config.screenCapture?.maxHeight || 1080
        
        this.currentStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id,
              maxWidth: maxWidth,
              maxHeight: maxHeight,
              maxFrameRate: this.config.screenCapture?.maxFrameRate || 30
            }
          }
        })

        const tracks = this.currentStream.getVideoTracks()
        this.logFn('获取到 ' + tracks.length + ' 个媒体轨道')

        tracks.forEach(track => {
          this.directPeerConnection.addTrack(track, this.currentStream)
          this.logFn('已添加媒体轨道: ' + track.kind + ', label: ' + track.label)
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
        return { width: 1920, height: 1080 }
      }
    } catch (error) {
      this.logFn('屏幕捕获失败: ' + error.message)
      console.error('屏幕捕获详细错误:', error)
      return { width: 1920, height: 1080 }
    }
  }

  stopScreenCapture() {
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
    }
  }
  
  reset() {
    this.currentDirectClientId = null
    this.isDirectController = false
    this.pendingIceCandidates = []
    
    this.stopScreenCapture()
    
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
    
    this.logFn('直连模式管理器已重置')
  }
}

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

    this.logFn('[直连模式] 正在连接到 ' + host + ':' + port + '...')

    try {
      const result = await window.electronAPI.connectDirectClient(host, port)
      this.logFn('[直连模式] connectDirectClient 返回: ' + JSON.stringify(result))
      
      if (result && result.success) {
        this.logFn('[直连模式] 已连接到 ' + host + ':' + port + ', clientId: ' + result.clientId)
        this.currentDirectClientId = result.clientId
        this.isDirectController = true
        this.logFn('[直连模式] isDirectController 已设置为: ' + this.isDirectController)
        this.logFn('[直连模式] 调用 startControllerConnection')
        await this.startControllerConnection(result.clientId)
        return true
      } else {
        const errorMsg = result?.error || '连接失败'
        this.logFn('[直连模式] 连接失败: ' + errorMsg)
        alert('连接失败: ' + errorMsg)
        return false
      }
    } catch (error) {
      this.logFn('[直连模式] 连接失败: ' + error.message)
      console.error('[直连模式] connect 详细错误:', error)
      alert('连接失败: ' + error.message)
      return false
    }
  }

  async sendMessage(message) {
    this.logFn('[直连模式] sendMessage 被调用, 消息类型: ' + message.type)
    this.logFn('[直连模式] 完整消息内容: ' + JSON.stringify(message).substring(0, 300))
    this.logFn('[直连模式] currentDirectClientId: ' + this.currentDirectClientId)
    
    if (!this.currentDirectClientId) {
      this.logFn('[直连模式] 无法发送消息：未连接')
      return false
    }

    try {
      this.logFn('[直连模式] 调用 window.electronAPI.sendDirectMessage')
      const result = await window.electronAPI.sendDirectMessage(this.currentDirectClientId, message)
      this.logFn('[直连模式] sendDirectMessage 返回: ' + JSON.stringify(result))
      if (!result || !result.success) {
        this.logFn('[直连模式] 发送消息失败: ' + (result?.error || '未知错误'))
        return false
      }
      this.logFn('[直连模式] 消息发送成功')
      return true
    } catch (e) {
      this.logFn('[直连模式] 发送消息失败: ' + e.message)
      console.error('[直连模式] sendMessage 详细错误:', e)
      return false
    }
  }

  async handleMessage(clientId, message) {
    this.logFn('[直连模式] 收到消息: ' + message.type + ', 完整内容: ' + JSON.stringify(message).substring(0, 300))
    this.logFn('[直连模式] currentDirectClientId: ' + this.currentDirectClientId)
    this.logFn('[直连模式] isDirectController: ' + this.isDirectController)

    try {
      switch (message.type) {
        case 'offer':
          this.logFn('[直连模式] offer内容: ' + (message.offer ? '存在' : '为空'))
          await this.handleOffer(clientId, message.offer)
          break
        case 'answer':
          this.logFn('[直连模式] answer内容: ' + (message.answer ? '存在' : '为空'))
          if (!this.isDirectController) {
            this.logFn('[直连模式] 是被控端，处理answer')
            await this.handleAnswer(clientId, message.answer)
          } else {
            this.logFn('[直连模式] 是主控端，answer将由app.js转发到远程窗口')
          }
          break
        case 'ice-candidate':
          this.logFn('[直连模式] 收到ICE候选')
          if (!this.isDirectController) {
            this.logFn('[直连模式] 是被控端，处理ICE候选')
            await this.handleIceCandidate(clientId, message.candidate)
          } else {
            this.logFn('[直连模式] 是主控端，ICE候选将由app.js转发到远程窗口')
          }
          break
      }
    } catch (error) {
      this.logFn('[直连模式] 处理消息失败: ' + error.message)
      console.error('[直连模式] 处理消息详细错误:', error)
    }
  }

  async startControllerConnection(clientId) {
    this.logFn('[直连模式] 作为主控端建立直连，打开远程窗口')
    this.logFn('[直连模式] 调用 window.electronAPI.openRemoteWindow()')
    window.electronAPI.openRemoteWindow()
    
    // 保存启动信号，等待远程窗口准备好
    this.pendingStartSignal = {
      mode: 'controller',
      clientId: clientId
    }
    this.logFn('[直连模式] 保存启动信号，等待远程窗口准备就绪: ' + JSON.stringify(this.pendingStartSignal))
  }

  async startControlledConnection(clientId) {
    this.logFn('[直连模式] 作为被控端建立直连')
    this.currentDirectClientId = clientId
    this.isDirectController = false
    await this.createPeerConnection(clientId)
    // 先不添加 transceiver，等收到 offer 后再处理
    this.logFn('[直连模式] 被控端等待接收 offer...')
  }

  async createPeerConnection(clientId) {
    this.logFn('[直连模式] 创建 PeerConnection, clientId: ' + clientId)
    this.directPeerConnection = new RTCPeerConnection({ iceServers: [] })

    this.dataChannelManager = new DataChannelManager({
      logger: { log: this.logFn.bind(this), error: console.error }
    })

    this.dataChannelManager.setOnOpen(() => {
      this.logFn('[直连模式] 数据通道已打开')
    })

    this.dataChannelManager.setOnMessage((data) => {
      if (data.type === 'input') {
        this.logFn('[直连模式] 收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y)
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'screen-size') {
        this.logFn('[直连模式] 收到屏幕尺寸: ' + data.width + 'x' + data.height)
      }
    })

    this.dataChannelManager.setOnClose(() => {
      this.logFn('[直连模式] 数据通道已关闭')
    })

    this.dataChannelManager.setOnError((error) => {
      console.error('[直连模式] 数据通道错误:', error)
    })

    this.directPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.logFn('[直连模式] 发送ICE候选')
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
      this.logFn('[直连模式] ICE连接状态: ' + this.directPeerConnection.iceConnectionState)
    }

    this.directPeerConnection.onconnectionstatechange = () => {
      this.logFn('[直连模式] 直连状态: ' + this.directPeerConnection.connectionState)

      if (this.directPeerConnection.connectionState === 'connected') {
        this.logFn('[直连模式] WebRTC连接已建立')
        const senders = this.directPeerConnection.getSenders()
        this.logFn('[直连模式] 连接建立时的发送者数量: ' + senders.length)
        senders.forEach((sender, i) => {
          if (sender.track) {
            this.logFn('[直连模式] 发送者 ' + i + ': ' + sender.track.kind + ', 启用: ' + sender.track.enabled)
          }
        })
      } else if (this.directPeerConnection.connectionState === 'failed') {
        this.logFn('[直连模式] WebRTC连接失败')
      } else if (this.directPeerConnection.connectionState === 'disconnected') {
        this.logFn('[直连模式] WebRTC连接断开')
      } else if (this.directPeerConnection.connectionState === 'closed') {
        this.logFn('[直连模式] WebRTC连接关闭')
      }
    }

    this.directPeerConnection.ontrack = (event) => {
      this.logFn('[直连模式] 收到媒体轨道: ' + event.track.kind)
    }

    this.directPeerConnection.ondatachannel = (event) => {
      this.logFn('[直连模式] 收到数据通道')
      this.dataChannelManager.setDataChannel(event.channel)
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

      // 检查 transceivers
      const transceivers = this.directPeerConnection.getTransceivers()
      this.logFn('收到 offer 后的 transceiver 数量: ' + transceivers.length)
      transceivers.forEach((t, i) => {
        this.logFn('  Transceiver ' + i + ': mid=' + t.mid + ', direction=' + t.direction + ', currentDirection=' + t.currentDirection)
      })

      await this.addPendingIceCandidates()

      this.logFn('开始捕获屏幕...')
      await this.startScreenCapture()

      this.logFn('创建answer...')
      const answer = await this.directPeerConnection.createAnswer()
      await this.directPeerConnection.setLocalDescription(answer)
      this.logFn('本地描述设置成功')

      // 检查 senders
      const senders = this.directPeerConnection.getSenders()
      this.logFn('发送 answer 前的 senders 数量: ' + senders.length)
      senders.forEach((sender, i) => {
        if (sender.track) {
          this.logFn('  Sender ' + i + ': ' + sender.track.kind + ', enabled=' + sender.track.enabled)
        }
      })

      this.sendMessage({
        type: 'answer',
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      })

      this.logFn('已发送answer')
    } catch (error) {
      this.logFn('处理offer失败: ' + error.message)
      console.error('处理offer详细错误:', error)
    }
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

  async startScreenCapture() {
    try {
      const sources = await window.electronAPI.getSources()
      this.logFn('[直连模式] 可用屏幕源: ' + sources.length + ' 个')

      if (sources.length > 0) {
        this.logFn('[直连模式] 选择第一个屏幕源: ' + sources[0].name + ', ID: ' + sources[0].id)
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id
            },
            optional: [
              { maxWidth: this.config.screenCapture?.maxWidth || 1920 },
              { maxHeight: this.config.screenCapture?.maxHeight || 1080 },
              { maxFrameRate: this.config.screenCapture?.maxFrameRate || 30 }
            ]
          }
        })

        const tracks = stream.getTracks()
        this.logFn('[直连模式] 获取到 ' + tracks.length + ' 个媒体轨道')
        tracks.forEach((track, i) => {
          this.logFn('  Track ' + i + ': kind=' + track.kind + ', id=' + track.id + ', enabled=' + track.enabled + ', readyState=' + track.readyState)
        })

        // 检查是否已经有 transceiver
        const transceivers = this.directPeerConnection.getTransceivers()
        this.logFn('[直连模式] 现有的 transceiver 数量: ' + transceivers.length)
        
        let videoTrack = null
        tracks.forEach(track => {
          if (track.kind === 'video') {
            videoTrack = track
            
            // 简单直接地添加轨道
            this.logFn('[直连模式] 添加视频轨道到 PeerConnection')
            this.directPeerConnection.addTrack(track, stream)
            this.logFn('[直连模式] 视频轨道已添加')
          }
        })

        // 检查添加后的 senders
        const senders = this.directPeerConnection.getSenders()
        this.logFn('[直连模式] 添加轨道后的 senders 数量: ' + senders.length)
        senders.forEach((sender, i) => {
          if (sender.track) {
            this.logFn('  Sender ' + i + ': kind=' + sender.track.kind + ', id=' + sender.track.id + ', enabled=' + sender.track.enabled)
          }
        })

        if (videoTrack) {
          const settings = videoTrack.getSettings()
          this.logFn('[直连模式] 屏幕捕获成功，分辨率: ' + (settings.width || '?') + 'x' + (settings.height || '?'))
        }
      } else {
        this.logFn('[直连模式] 没有找到可用的屏幕源')
      }
    } catch (error) {
      this.logFn('[直连模式] 屏幕捕获失败: ' + error.message)
      console.error('[直连模式] 屏幕捕获详细错误:', error)
    }
  }

  reset() {
    this.currentDirectClientId = null
    this.isDirectController = false
    this.pendingIceCandidates = []

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

class DirectModeManager {
  constructor(options = {}) {
    this.currentDirectClientId = null
    this.directPeerConnection = null
    this.isDirectController = false
    this.dataChannelManager = null
    this.pendingIceCandidates = []
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
    try {
      const result = await window.electronAPI.startDirectServer(port)
      if (result.success) {
        this.logFn('开始监听端口 ' + port + '，等待连接...')
        if (this.uiManager) {
          this.uiManager.updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
        }
        return true
      } else {
        this.logFn('启动监听失败: ' + result.error)
        alert('监听失败: ' + result.error)
        return false
      }
    } catch (error) {
      this.logFn('启动监听失败: ' + error.message)
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
      if (result.success) {
        this.logFn('已连接到 ' + host + ':' + port)
        this.currentDirectClientId = result.clientId
        this.isDirectController = true
        await this.startControllerConnection(result.clientId)
        return true
      } else {
        this.logFn('连接失败: ' + result.error)
        alert('连接失败: ' + result.error)
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
      await window.electronAPI.sendDirectMessage(this.currentDirectClientId, message)
      return true
    } catch (e) {
      this.logFn('发送消息失败: ' + e.message)
      return false
    }
  }

  async handleMessage(clientId, message) {
    this.logFn('收到消息: ' + message.type + ', 内容: ' + JSON.stringify(message).substring(0, 200))

    try {
      switch (message.type) {
        case 'offer':
          this.logFn('offer内容: ' + (message.offer ? '存在' : '为空'))
          await this.handleOffer(clientId, message.offer)
          break
        case 'answer':
          this.logFn('answer内容: ' + (message.answer ? '存在' : '为空'))
          if (this.isDirectController) {
            this.logFn('转发answer到远程窗口')
            window.electronAPI.sendToRemoteWindow('webrtc-answer', { answer: message.answer })
          } else {
            await this.handleAnswer(clientId, message.answer)
          }
          break
        case 'ice-candidate':
          if (this.isDirectController) {
            this.logFn('转发ICE候选到远程窗口')
            window.electronAPI.sendToRemoteWindow('webrtc-ice-candidate', { candidate: message.candidate })
          } else {
            await this.handleIceCandidate(clientId, message.candidate)
          }
          break
      }
    } catch (error) {
      this.logFn('处理消息失败: ' + error.message)
      console.error('处理消息详细错误:', error)
    }
  }

  async startControllerConnection(clientId) {
    this.logFn('作为主控端建立直连，打开远程窗口')
    window.electronAPI.openRemoteWindow()
  }

  async startControlledConnection(clientId) {
    this.logFn('作为被控端建立直连')
    this.currentDirectClientId = clientId
    this.isDirectController = false
    await this.createPeerConnection(clientId)
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
        this.logFn('收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y)
        window.electronAPI.send('remote-input', data)
      } else if (data.type === 'ping') {
        this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
      } else if (data.type === 'screen-size') {
        this.logFn('收到屏幕尺寸: ' + data.width + 'x' + data.height)
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
      } else if (this.directPeerConnection.connectionState === 'failed') {
        this.logFn('WebRTC连接失败')
      }
    }

    this.directPeerConnection.ondatachannel = (event) => {
      this.logFn('收到数据通道')
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

      await this.addPendingIceCandidates()

      this.logFn('开始捕获屏幕...')
      await this.startScreenCapture()

      this.logFn('创建answer...')
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
        this.logFn('缓存ICE候选（远程描述未设置）')
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
      this.logFn('可用屏幕源: ' + sources.length + ' 个')

      if (sources.length > 0) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id,
              maxWidth: this.config.screenCapture?.maxWidth || 1920,
              maxHeight: this.config.screenCapture?.maxHeight || 1080,
              maxFrameRate: this.config.screenCapture?.maxFrameRate || 30
            }
          }
        })

        const tracks = stream.getTracks()
        this.logFn('获取到 ' + tracks.length + ' 个媒体轨道')

        tracks.forEach(track => {
          this.directPeerConnection.addTrack(track, stream)
          this.logFn('已添加媒体轨道: ' + track.kind + ', label: ' + track.label)
        })

        this.logFn('屏幕捕获成功，分辨率: ' + stream.getVideoTracks()[0].getSettings().width + 'x' + stream.getVideoTracks()[0].getSettings().height)
      } else {
        this.logFn('没有找到可用的屏幕源')
      }
    } catch (error) {
      this.logFn('屏幕捕获失败: ' + error.message)
      console.error('屏幕捕获详细错误:', error)
    }
  }

  reset() {
    this.currentDirectClientId = null
    this.isDirectController = false
    this.pendingIceCandidates = []

    if (this.dataChannelManager) {
      this.dataChannelManager.close()
      this.dataChannelManager = null
    }

    if (this.directPeerConnection) {
      this.directPeerConnection.close()
      this.directPeerConnection = null
    }
  }
}

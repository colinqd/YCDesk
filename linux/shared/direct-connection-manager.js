class DirectConnectionManager extends BaseConnectionManager {
    constructor(options = {}) {
        super(options)
        this.targetWindowId = null
        this.isController = false
        this.isConnectionStarted = false
        this.modeData = null
        this.offerReceived = false
        this.offerResolve = null
        this.answerResolve = null
        this.renegotiateResolve = null
        this.iceServers = []
        this._iceRestartInProgress = false
        this._ipcListeners = []
        this._pendingTimers = []
    }

    _trackTimer(timer) {
        this._pendingTimers.push(timer)
        return timer
    }

    _clearPendingTimers() {
        for (const timer of this._pendingTimers) {
            clearTimeout(timer)
        }
        this._pendingTimers = []
    }

    setModeData(data) {
        this.modeData = data
        this.targetWindowId = data.targetWindowId
        this.isController = data.mode === 'controller'
        this.isConnectionStarted = true
        this.log('setModeData 完成, isController=' + this.isController)
    }

    async establishSignaling(config) {
        this.log('直连模式: 使用IPC作为信令通道')
        
        this._removeIpcListeners()

        const answerHandler = async (data) => {
            this.handleAnswer(data.answer)
        }
        window.electronAPI.on('webrtc-answer', answerHandler)
        this._ipcListeners.push({ event: 'webrtc-answer', handler: answerHandler })

        const iceHandler = async (data) => {
            this.handleIceCandidate(data.candidate)
        }
        window.electronAPI.on('webrtc-ice-candidate', iceHandler)
        this._ipcListeners.push({ event: 'webrtc-ice-candidate', handler: iceHandler })
        
        const offerHandler = async (data) => {
            this.log('收到 webrtc-offer 事件')
            if (this.isController) {
                await this.handleSignalingOffer(data)
            }
        }
        window.electronAPI.on('webrtc-offer', offerHandler)
        this._ipcListeners.push({ event: 'webrtc-offer', handler: offerHandler })
        
        if (this.modeData) {
            this.log(`直连模式: 使用预设的模式数据 mode=${this.modeData.mode}`)
            return
        }
        
        const modeStartHandler = async (data) => {
            if (this.isConnectionStarted) return
            
            this.isConnectionStarted = true
            this.targetWindowId = data.targetWindowId
            this.isController = data.mode === 'controller'
            
            this.log(`直连模式启动: mode=${data.mode}, targetWindowId=${data.targetWindowId}`)
            
            this.emit('direct-mode-start', data)
        }
        window.electronAPI.on('direct-mode-start', modeStartHandler)
        this._ipcListeners.push({ event: 'direct-mode-start', handler: modeStartHandler })
        
        return new Promise((resolve, reject) => {
            const timeout = this._trackTimer(setTimeout(() => {
                reject(new Error('等待直连模式启动超时'))
            }, 10000))
            
            this.on('direct-mode-start', () => {
                clearTimeout(timeout)
                resolve()
            })
        })
    }

    async authenticate(credentials) {
        this.log('直连模式: 跳过身份验证')
        return { success: true }
    }

    async negotiateCapabilities() {
        this.log('直连模式: 能力协商')
        
        const capabilities = {
            video: true,
            audio: false,
            clipboard: true,
            fileTransfer: false
        }
        
        return capabilities
    }

    async sendSignalingMessage(message) {
        switch (message.type) {
            case 'offer':
                await window.electronAPI.sendToMainWindow('webrtc-offer', {
                    offer: message.offer
                })
                break
            case 'answer':
                await window.electronAPI.sendToMainWindow('webrtc-answer', {
                    answer: message.answer
                })
                break
            case 'ice-candidate':
                await window.electronAPI.sendToMainWindow('webrtc-ice-candidate', {
                    candidate: message.candidate
                })
                break
            case 'renegotiate':
                await window.electronAPI.sendToMainWindow('webrtc-renegotiate', {
                    offer: message.offer
                })
                break
            default:
                await window.electronAPI.sendToMainWindow('webrtc-signaling', message)
        }
    }

    async connect(config) {
        this.log('connect() 方法开始执行')
        this.config = config
        this.stateMachine.transition(ConnectionState.CONNECTING)
        this.log('状态已转换为 CONNECTING')
        
        try {
            this.log('第一阶段：控制流（串行）开始')
            
            await this.establishSignaling(config)
            this.log('establishSignaling 完成')
            this.stateMachine.transition(ConnectionState.AUTHENTICATING)
            
            await this.authenticate(config.credentials || {})
            this.stateMachine.transition(ConnectionState.NEGOTIATING)
            
            const capabilities = await this.negotiateCapabilities()
            this.stateMachine.transition(ConnectionState.CREATING_CHANNEL)
            
            this.log('第二阶段：核心通道（优先）开始')
            
            await this.createPeerConnection(capabilities)
            
            if (this.isController) {
                await this.connectAsController()
            } else {
                await this.connectAsControlled()
            }
            
            this.stateMachine.transition(ConnectionState.CONNECTED)
            this.log('连接建立完成')

            // 连接建立后设置断连恢复监控
            this._setupConnectionRecovery()

            return { success: true }
            
        } catch (error) {
            this.error('连接失败:', error)
            this.stateMachine.transition(ConnectionState.ERROR, { error: error.message })
            throw error
        }
    }

    async connectAsController() {
        this.log('主控端连接流程开始')

        await this.createDataChannel()

        // 添加 recvonly 视频收发器，以便接收被控端的视频轨道
        this.log('添加视频收发器（recvonly）...')
        this.peerConnection.addTransceiver('video', {
            direction: 'recvonly'
        })

        this.log('创建 offer（含视频收发器）...')
        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)

        await this.sendSignalingMessage({
            type: 'offer',
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        })

        this.log('等待被控端发送 answer（含视频）...')
        await this.waitForAnswer()

        this.log('收到 answer，数据通道应该已打开')

        await this.waitForDataChannelOpen()

        this.log('数据通道已打开，发送分辨率请求...')
        this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING)
        const displaySize = await this.negotiateResolution()
        this.adjustVideoContainer(displaySize)

        this.log('分辨率协商完成，等待视频轨道...')
        this.stateMachine.transition(ConnectionState.WAITING_VIDEO)

        // 等待首帧，但如果超时或没有视频轨道，不阻塞连接
        try {
            await this.waitForFirstFrame()
            this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
            this.log('首帧显示成功')
        } catch (error) {
            this.log('首帧等待未完成（可能无视频轨道或屏幕捕获失败）: ' + error.message)
            this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
        }

        this.stateMachine.transition(ConnectionState.LOADING_AUXILIARY)
        this.loadAuxiliaryChannelsParallel()
    }

    async waitForAnswer() {
        return new Promise((resolve, reject) => {
            const timeout = this._trackTimer(setTimeout(() => {
                reject(new Error('等待 answer 超时'))
            }, 30000))
            
            this.answerResolve = () => {
                clearTimeout(timeout)
                resolve()
            }
        })
    }

    async waitForRenegotiationOffer() {
        return new Promise((resolve, reject) => {
            const timeout = this._trackTimer(setTimeout(() => {
                reject(new Error('等待 renegotiation offer 超时'))
            }, 30000))
            
            this.renegotiateResolve = () => {
                clearTimeout(timeout)
                resolve()
            }
        })
    }

    async connectAsControlled() {
        this.log('被控端连接流程开始')
        
        await this.createDataChannel()
        await this.waitForDataChannelOpen()
        
        this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING)
        
        const displaySize = await this.negotiateResolution()
        this.adjustVideoContainer(displaySize)
        
        this.stateMachine.transition(ConnectionState.WAITING_VIDEO)
        
        await this.startScreenCapture()
        await this.createAndSendOffer()
        
        await this.waitForFirstFrame()
        
        this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
        this.log('首帧显示成功')
        
        this.stateMachine.transition(ConnectionState.LOADING_AUXILIARY)
        this.loadAuxiliaryChannelsParallel()
    }

    async waitForOffer() {
        return new Promise((resolve, reject) => {
            const timeout = this._trackTimer(setTimeout(() => {
                reject(new Error('等待 offer 超时'))
            }, 30000))
            
            this.offerResolve = () => {
                clearTimeout(timeout)
                resolve()
            }
        })
    }

    async createAndSendOffer() {
        this.log('创建并发送 offer')

        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)

        await this.sendSignalingMessage({
            type: 'offer',
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        })

        this.log('offer 已发送')
    }

    async startScreenCapture() {
        this.log('直连模式: 开始屏幕捕获')
        
        try {
            const sources = await window.electronAPI.getSources()
            
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
                    const sender = this.peerConnection.addTrack(track, stream)
                    // 配置编码参数以优化性能
                    if (sender && sender.getParameters) {
                        try {
                            const params = sender.getParameters()
                            if (params && params.encodings && params.encodings.length > 0) {
                                params.encodings[0].maxBitrate = 2500000
                                params.encodings[0].maxFramerate = 30
                                params.encodings[0].scaleResolutionDownBy = 1
                                params.encodings[0].networkPriority = 'high'
                                params.degradationPreference = 'maintain-framerate'
                                sender.setParameters(params).catch(() => {})
                            }
                        } catch (e) {}
                    }
                })

                // 设置编码器偏好：优先 H.264 硬件编码
                try {
                    const transceivers = this.peerConnection.getTransceivers()
                    for (const transceiver of transceivers) {
                        if (transceiver.sender && transceiver.sender.track
                            && transceiver.sender.track.kind === 'video') {
                            const codecs = RTCRtpSender.getCapabilities
                                ? RTCRtpSender.getCapabilities('video')
                                : null
                            if (codecs && codecs.codecs) {
                                const preferred = ['H264', 'H.264', 'VP8', 'VP9']
                                const sorted = codecs.codecs.filter(c =>
                                    preferred.some(p => c.mimeType.indexOf(p) !== -1))
                                if (sorted.length > 0) {
                                    transceiver.setCodecPreferences(sorted)
                                }
                            }
                        }
                    }
                } catch (e) {}
                
                this.log('屏幕捕获成功 (H.264 优先, 2.5Mbps)')
            }
        } catch (error) {
            this.error('屏幕捕获失败:', error)
            throw error
        }
    }

    async handleSignalingOffer(data) {
        this.log('直连模式: 收到 offer')
        
        if (!this.isController) {
            this.log('被控端收到 offer，这是初始连接')
            return
        }
        
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
            await this.addPendingIceCandidates()
            
            this.log('创建 renegotiation answer...')
            const answer = await this.peerConnection.createAnswer()
            await this.peerConnection.setLocalDescription(answer)

            await this.sendSignalingMessage({
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            })
            
            this.log('直连模式: renegotiation answer 已发送')
            
            if (this.renegotiateResolve) {
                this.renegotiateResolve()
            }
            
        } catch (error) {
            this.error('处理 offer 失败:', error)
        }
    }

    handleAnswer(answer) {
        if (!answer) return
        
        this.log('收到 answer')
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
                this.log('设置远程描述成功')
                this.addPendingIceCandidates()
                
                if (this.answerResolve) {
                    this.answerResolve()
                }
            })
            .catch(error => {
                this.error('设置远程描述失败:', error)
            })
    }

    _setupConnectionRecovery() {
        if (!this.peerConnection) return

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState
            this.log('ICE连接状态: ' + state)
            this.emit('ice-state-change', state)

            if (state === 'failed' && !this._iceRestartInProgress) {
                this.log('ICE连接失败，尝试 ICE restart...')
                this._attemptIceRestart()
            }
        }

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState
            this.log('连接状态: ' + state)
            this.emit('connection-state-change', state)

            if (state === 'failed' && !this._iceRestartInProgress) {
                this.log('WebRTC连接失败，尝试 ICE restart...')
                this._attemptIceRestart()
            } else if (state === 'disconnected') {
                this.log('WebRTC连接断开，等待自动恢复...')
            }
        }
    }

    async _attemptIceRestart() {
        if (this._iceRestartInProgress) return
        this._iceRestartInProgress = true

        try {
            this.log('开始 ICE restart...')

            // 仅主控端发起 ICE restart（避免双方同时发起）
            if (!this.isController) {
                this.log('被控端不主动发起 ICE restart，等待主控端')
                this._iceRestartInProgress = false
                return
            }

            const offer = await this.peerConnection.createOffer({ iceRestart: true })
            await this.peerConnection.setLocalDescription(offer)

            await this.sendSignalingMessage({
                type: 'offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                }
            })

            this.log('ICE restart offer 已发送')

            // 等待 ICE restart 完成（最多10秒）
            await new Promise((resolve) => {
                const timeout = this._trackTimer(setTimeout(() => {
                    this.log('ICE restart 超时')
                    resolve()
                }, 10000))

                const checkState = () => {
                    if (this.peerConnection &&
                        (this.peerConnection.iceConnectionState === 'connected' ||
                         this.peerConnection.iceConnectionState === 'completed')) {
                        clearTimeout(timeout)
                        this.log('ICE restart 成功')
                        resolve()
                    }
                }

                this.peerConnection.oniceconnectionstatechange = () => {
                    checkState()
                    // 恢复正常的连接状态监控
                    if (this.peerConnection.iceConnectionState === 'connected' ||
                        this.peerConnection.iceConnectionState === 'completed' ||
                        this.peerConnection.iceConnectionState === 'failed') {
                        this._setupConnectionRecovery()
                    }
                }
            })
        } catch (error) {
            this.error('ICE restart 失败:', error)
        } finally {
            this._iceRestartInProgress = false
        }
    }

    _removeIpcListeners() {
        if (!window.electronAPI) return
        for (const { event, handler } of this._ipcListeners) {
            try {
                window.electronAPI.removeListener(event, handler)
            } catch (e) {
                this.log('移除IPC监听器失败: ' + e.message)
            }
        }
        this._ipcListeners = []
    }

    disconnect() {
        this._clearPendingTimers()
        this._removeIpcListeners()
        this.isConnectionStarted = false
        this.offerReceived = false
        this.offerResolve = null
        this.answerResolve = null
        this.renegotiateResolve = null
        return super.disconnect()
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DirectConnectionManager }
} else {
    window.DirectConnectionManager = DirectConnectionManager
}

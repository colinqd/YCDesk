class SignalingConnectionManager extends BaseConnectionManager {
    constructor(options = {}) {
        super(options)
        this.sessionId = null
        this.deviceId = null
        this.targetDeviceId = null
        this.isController = false
    }

    async establishSignaling(config) {
        this.log('信令模式: 使用IPC信令通道')
        return Promise.resolve()
    }

    async authenticate(credentials) {
        this.log('信令模式: 身份验证')
        this.deviceId = credentials.deviceId
        this.sessionId = credentials.sessionId
        return Promise.resolve({ success: true, sessionId: this.sessionId })
    }

    async negotiateCapabilities() {
        this.log('信令模式: 能力协商')
        return Promise.resolve({
            video: true,
            audio: false,
            clipboard: true
        })
    }

    sendSignalingMessage(message) {
        switch (message.type) {
            case 'webrtc-offer':
                window.electronAPI.send('send-signaling-offer', {
                    sessionId: this.sessionId,
                    offer: message.offer,
                    targetDeviceId: this.targetDeviceId
                })
                break
            case 'webrtc-answer':
                window.electronAPI.send('send-signaling-answer', {
                    sessionId: this.sessionId,
                    answer: message.answer,
                    targetDeviceId: this.targetDeviceId
                })
                break
            case 'ice-candidate':
                window.electronAPI.send('send-signaling-ice-candidate', {
                    sessionId: this.sessionId,
                    candidate: message.candidate,
                    targetDeviceId: this.targetDeviceId
                })
                break
        }
    }

    async connect(config) {
        this.config = config
        this.stateMachine.transition(ConnectionState.CONNECTING)
        
        try {
            this.log('第一阶段：控制流（串行）开始')
            
            await this.establishSignaling(config)
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
            
            return { success: true }
            
        } catch (error) {
            this.error('连接失败:', error)
            this.stateMachine.transition(ConnectionState.ERROR, { error: error.message })
            throw error
        }
    }

    async connectAsController() {
        this.log('主控端连接流程开始')
        
        this.peerConnection.addTransceiver('video', {
            direction: 'recvonly'
        })
        this.log('已添加视频收发器(recvonly)')
        
        await this.createDataChannel()
        
        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)
        
        this.sendSignalingMessage({
            type: 'webrtc-offer',
            offer: { type: offer.type, sdp: offer.sdp }
        })
        
        this.log('已发送初始offer(含视频)，等待answer...')
        
        await this.waitForDataChannelOpen()
        this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING)
        
        const displaySize = await this.negotiateResolution()
        this.adjustVideoContainer(displaySize)
        
        this.stateMachine.transition(ConnectionState.WAITING_VIDEO)
        
        await this.waitForFirstFrame()
        
        this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
        this.log('首帧显示成功')
        
        this.stateMachine.transition(ConnectionState.LOADING_AUXILIARY)
        this.loadAuxiliaryChannelsParallel()
        
        this.stateMachine.transition(ConnectionState.CONNECTED)
        this.log('连接建立完成')
    }

    async connectAsControlled() {
        this.log('被控端连接流程开始')
        
        await this.waitForRemoteOffer()
        
        this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING)
        
        this.dataChannelManager.setOnMessage((data) => {
            this.handleControlledDataChannelMessage(data)
        })
        
        await this.waitForResolutionRequest()
        
        await this.startScreenCapture()
        
        const renegotiationOffer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(renegotiationOffer)
        
        this.sendSignalingMessage({
            type: 'webrtc-offer',
            offer: { type: renegotiationOffer.type, sdp: renegotiationOffer.sdp }
        })
        
        this.stateMachine.transition(ConnectionState.CONNECTED)
        this.log('被控端连接建立完成')
    }

    waitForRemoteOffer() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('等待远程offer超时'))
            }, this.connectionTimeout)
            
            this.on('signaling-offer-received', () => {
                clearTimeout(timeout)
                resolve()
            })
        })
    }

    async handleSignalingOffer(data) {
        this.log('信令模式: 收到offer')
        this.targetDeviceId = data.fromDeviceId || data.targetDeviceId
        
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
            await this.addPendingIceCandidates()
            
            const answer = await this.peerConnection.createAnswer()
            await this.peerConnection.setLocalDescription(answer)
            
            this.sendSignalingMessage({
                type: 'webrtc-answer',
                answer: { type: answer.type, sdp: answer.sdp },
                targetDeviceId: this.targetDeviceId
            })
            
            this.log('信令模式: answer已发送')
            this.emit('signaling-offer-received')
            
        } catch (error) {
            this.error('处理offer失败:', error)
        }
    }

    handleControlledDataChannelMessage(data) {
        if (data.type === 'resolution-request') {
            this.handleResolutionRequest(data)
        } else if (data.type === 'input') {
            if (window.electronAPI) {
                window.electronAPI.send('remote-input', data)
            }
        } else if (data.type === 'ping') {
            this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
        } else if (data.type === 'hide-cursor') {
            if (data.hide) {
                window.electronAPI.hideCursor()
            } else {
                window.electronAPI.showCursor()
            }
        }
    }

    async waitForResolutionRequest() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('等待分辨率请求超时'))
            }, this.resolutionTimeout)
            
            this.on('resolution-request-received', () => {
                clearTimeout(timeout)
                resolve()
            })
        })
    }

    handleResolutionRequest(data) {
        this.log(`收到分辨率请求: ${data.width}x${data.height}`)
        
        this.targetResolution = {
            width: data.width,
            height: data.height
        }
        
        this.emit('resolution-request-received')
    }

    async startScreenCapture() {
        this.log('信令模式: 开始屏幕捕获')
        
        try {
            const targetRes = this.targetResolution || { width: 1920, height: 1080 }
            
            const sources = await window.electronAPI.getSources()
            
            if (sources && sources.length > 0) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sources[0].id,
                            maxWidth: targetRes.width,
                            maxHeight: targetRes.height,
                            maxFrameRate: 30
                        }
                    }
                })
                
                stream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, stream)
                })
                
                this.log(`屏幕捕获成功，分辨率: ${targetRes.width}x${targetRes.height}`)
                
                if (this.dataChannelManager && this.dataChannelManager.isOpen()) {
                    this.dataChannelManager.send({
                        type: 'resolution-response',
                        width: targetRes.width,
                        height: targetRes.height
                    })
                }
            }
        } catch (error) {
            this.error('屏幕捕获失败:', error)
            throw error
        }
    }

    disconnect() {
        return super.disconnect()
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SignalingConnectionManager }
} else {
    window.SignalingConnectionManager = SignalingConnectionManager
}

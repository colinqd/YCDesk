class BaseConnectionManager {
    constructor(options = {}) {
        this.eventListeners = new Map()
        this.stateMachine = new ConnectionStateMachine({ logger: this })
        this.peerConnection = null
        this.dataChannelManager = null
        this.resolutionNegotiator = null
        this.auxiliaryChannels = new Map()
        this.config = null
        this.videoElement = null
        this.videoContainer = null
        this.videoWrapper = null
        this.remoteScreenEl = null
        this.matrixTransformer = null
        this.pendingIceCandidates = []
        this.frameCount = 0
        this.lastFpsTime = performance.now()
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
        this.connectionTimeout = 30000
        this.resolutionTimeout = 5000
        this.firstFrameTimeout = 10000
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString()
        console.log(`[${timestamp}] ${message}`)
        this.emit('log', message)
    }

    error(message, errorObj) {
        console.error(message, errorObj)
        this.emit('error', { message, error: errorObj })
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set())
        }
        this.eventListeners.get(event).add(callback)
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback)
        }
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data)
                } catch (e) {
                    console.error('事件监听器错误:', e)
                }
            })
        }
    }

    setVideoElements(videoElement, videoContainer, videoWrapper, remoteScreenEl) {
        this.videoElement = videoElement
        this.videoContainer = videoContainer
        this.videoWrapper = videoWrapper
        this.remoteScreenEl = remoteScreenEl
    }

    setMatrixTransformer(matrixTransformer) {
        this.matrixTransformer = matrixTransformer
    }

    async establishSignaling(config) {
        throw new Error('子类必须实现 establishSignaling')
    }

    async authenticate(credentials) {
        throw new Error('子类必须实现 authenticate')
    }

    async negotiateCapabilities() {
        throw new Error('子类必须实现 negotiateCapabilities')
    }

    sendSignalingMessage(message) {
        throw new Error('子类必须实现 sendSignalingMessage')
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
            await this.createDataChannel()
            await this.waitForDataChannelOpen()
            
            this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING)
            
            const displaySize = await this.negotiateResolution()
            this.adjustVideoContainer(displaySize)
            
            this.stateMachine.transition(ConnectionState.WAITING_VIDEO)
            
            await this.addVideoTrack()
            await this.waitForFirstFrame()
            
            this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
            this.log('首帧显示成功')
            
            this.stateMachine.transition(ConnectionState.LOADING_AUXILIARY)
            this.loadAuxiliaryChannelsParallel()
            
            this.stateMachine.transition(ConnectionState.CONNECTED)
            this.log('连接建立完成')
            
            return { success: true }
            
        } catch (error) {
            this.error('连接失败:', error)
            this.stateMachine.transition(ConnectionState.ERROR, { error: error.message })
            throw error
        }
    }

    async createPeerConnection(capabilities) {
        this.log('创建 PeerConnection')
        
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        })
        
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    }
                })
            }
        }
        
        this.peerConnection.oniceconnectionstatechange = () => {
            this.log('ICE连接状态: ' + this.peerConnection.iceConnectionState)
            this.emit('ice-state-change', this.peerConnection.iceConnectionState)
        }
        
        this.peerConnection.onconnectionstatechange = () => {
            this.log('连接状态: ' + this.peerConnection.connectionState)
            this.emit('connection-state-change', this.peerConnection.connectionState)
        }
        
        this.peerConnection.ondatachannel = (event) => {
            this.log('收到数据通道: ' + event.channel.label)
            if (event.channel.label === 'control') {
                this.dataChannelManager.setDataChannel(event.channel)
            } else if (event.channel.label.startsWith('aux-')) {
                const channelName = event.channel.label.replace('aux-', '')
                this.auxiliaryChannels.set(channelName, event.channel)
                this.emit('auxiliary-channel-open', { name: channelName })
            }
        }
        
        this.peerConnection.ontrack = (event) => {
            this.log('收到远程媒体流')
            this.handleVideoTrack(event)
        }
    }

    async createDataChannel() {
        this.log('创建数据通道')
        
        this.dataChannelManager = new DataChannelManager({ logger: this })
        
        const channel = this.peerConnection.createDataChannel('control', {
            ordered: true,
            maxRetransmits: 3
        })
        
        this.dataChannelManager.setDataChannel(channel)
        
        this.dataChannelManager.setOnOpen(() => {
            this.log('数据通道已打开')
            this.emit('data-channel-open')
        })
        
        this.dataChannelManager.setOnMessage((data) => {
            this.handleDataChannelMessage(data)
        })
        
        this.dataChannelManager.setOnClose(() => {
            this.log('数据通道已关闭')
            this.emit('data-channel-close')
        })
        
        this.dataChannelManager.setOnError((error) => {
            this.error('数据通道错误:', error)
            this.emit('data-channel-error', error)
        })
    }

    async waitForDataChannelOpen() {
        return new Promise((resolve, reject) => {
            if (this.dataChannelManager.isOpen()) {
                resolve()
                return
            }
            
            const timeout = setTimeout(() => {
                reject(new Error('数据通道打开超时'))
            }, this.connectionTimeout)
            
            this.dataChannelManager.setOnOpen(() => {
                clearTimeout(timeout)
                resolve()
            })
        })
    }

    async negotiateResolution() {
        this.log('开始分辨率协商')
        
        const localWindowSize = this.getLocalWindowSize()
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('分辨率协商超时'))
            }, this.resolutionTimeout)
            
            const originalOnMessage = this.dataChannelManager.callbacks.onMessage
            
            this.dataChannelManager.setOnMessage((data) => {
                if (data.type === 'resolution-response') {
                    clearTimeout(timeout)
                    this.dataChannelManager.setOnMessage(originalOnMessage)
                    
                    const displaySize = this.calculateOptimalSize(
                        localWindowSize,
                        data
                    )
                    
                    if (this.matrixTransformer) {
                        this.matrixTransformer.setRemoteScreenSize(data.width, data.height)
                    }
                    
                    this.log(`分辨率协商完成: ${data.width}x${data.height}`)
                    resolve(displaySize)
                } else if (originalOnMessage) {
                    originalOnMessage(data)
                }
            })
            
            this.dataChannelManager.send({
                type: 'resolution-request',
                width: localWindowSize.width,
                height: localWindowSize.height,
                devicePixelRatio: window.devicePixelRatio
            }, true)
        })
    }

    getLocalWindowSize() {
        let width, height
        
        if (this.videoWrapper && this.videoWrapper.clientWidth > 0) {
            width = this.videoWrapper.clientWidth
            height = this.videoWrapper.clientHeight
        } else if (this.remoteScreenEl && this.remoteScreenEl.clientWidth > 0) {
            width = this.remoteScreenEl.clientWidth
            height = this.remoteScreenEl.clientHeight
        } else {
            width = window.innerWidth - 40
            height = window.innerHeight - 120
        }
        
        this.log(`本地窗口尺寸: ${width}x${height}`)
        return { width, height }
    }

    calculateOptimalSize(local, remote) {
        const localRatio = local.width / local.height
        const remoteRatio = remote.width / remote.height
        
        let displayWidth, displayHeight, scale
        
        if (remoteRatio > localRatio) {
            displayWidth = local.width
            displayHeight = local.width / remoteRatio
            scale = local.width / remote.width
        } else {
            displayHeight = local.height
            displayWidth = local.height * remoteRatio
            scale = local.height / remote.height
        }
        
        return {
            width: displayWidth,
            height: displayHeight,
            scale: scale,
            remoteWidth: remote.width,
            remoteHeight: remote.height
        }
    }

    adjustVideoContainer(displaySize) {
        if (!this.videoContainer) return
        
        this.videoContainer.style.width = displaySize.width + 'px'
        this.videoContainer.style.height = displaySize.height + 'px'
        
        if (this.matrixTransformer) {
            this.matrixTransformer.setRemoteScreenSize(displaySize.remoteWidth, displaySize.remoteHeight)
        }
        
        this.log(`视频容器尺寸调整: ${displaySize.width}x${displaySize.height}, 远程分辨率: ${displaySize.remoteWidth}x${displaySize.remoteHeight}`)
    }

    async addVideoTrack() {
        this.log('添加视频轨道')
        
        this.peerConnection.addTransceiver('video', {
            direction: 'recvonly'
        })
        
        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)
        
        this.sendSignalingMessage({
            type: 'offer',
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        })
    }

    handleVideoTrack(event) {
        let stream = event.streams[0]
        if (!stream) {
            stream = new MediaStream([event.track])
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = stream
            this.videoElement.muted = true
            this.videoElement.playsInline = true
            this.videoElement.autoplay = true
            
            this.videoElement.onloadedmetadata = () => {
                this.onVideoMetadataLoaded()
            }
        }
    }

    onVideoMetadataLoaded() {
        if (this.videoElement) {
            this.log(`视频元数据加载完成: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`)
            
            this.videoElement.style.width = this.videoElement.videoWidth + 'px'
            this.videoElement.style.height = this.videoElement.videoHeight + 'px'
            
            this.emit('video-metadata', {
                width: this.videoElement.videoWidth,
                height: this.videoElement.videoHeight
            })
            
            this.emit('video-ready')
        }
    }

    async waitForFirstFrame() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('等待首帧超时'))
            }, this.firstFrameTimeout)
            
            const handler = () => {
                clearTimeout(timeout)
                this.off('video-ready', handler)
                resolve()
            }
            
            this.on('video-ready', handler)
            
            if (this.videoElement && this.videoElement.srcObject) {
                this.videoElement.play()
                    .then(() => {
                        this.emit('video-ready')
                    })
                    .catch(reject)
            }
        })
    }

    loadAuxiliaryChannelsParallel() {
        this.log('第三阶段：辅助通道（并行）开始')
        
        const channels = [
            { name: 'clipboard', ordered: true }
        ]
        
        channels.forEach(config => {
            this.loadAuxiliaryChannel(config)
                .then(channel => {
                    this.auxiliaryChannels.set(config.name, channel)
                    this.log(`辅助通道 ${config.name} 加载成功`)
                    this.emit('auxiliary-channel-ready', { name: config.name })
                })
                .catch(error => {
                    this.log(`辅助通道 ${config.name} 加载失败: ${error.message}`)
                    this.emit('auxiliary-channel-error', { name: config.name, error })
                })
        })
    }

    async loadAuxiliaryChannel(config) {
        const channelName = `aux-${config.name}`
        const channel = this.peerConnection.createDataChannel(channelName, {
            ordered: config.ordered !== false
        })
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('辅助通道建立超时'))
            }, 10000)
            
            channel.onopen = () => {
                clearTimeout(timeout)
                resolve(channel)
            }
            
            channel.onerror = (error) => {
                clearTimeout(timeout)
                reject(error)
            }
        })
    }

    handleDataChannelMessage(data) {
        switch (data.type) {
            case 'resolution-response':
                this.emit('message', data)
                break
            case 'pong':
                this.handlePong(data)
                break
            case 'ping':
                this.dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
                break
            case 'input':
                if (window.electronAPI) {
                    window.electronAPI.send('remote-input', data)
                }
                break
            default:
                this.emit('message', data)
        }
    }

    handlePong(data) {
        const latency = Math.round(performance.now() - data.timestamp)
        this.emit('latency', latency)
    }

    handleAnswer(answer) {
        if (!answer) return
        
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
                this.log('设置远程描述成功')
                this.addPendingIceCandidates()
            })
            .catch(error => {
                this.error('设置远程描述失败:', error)
            })
    }

    handleIceCandidate(candidate) {
        if (!candidate) return
        
        if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) {
            return
        }
        
        if (!this.peerConnection || !this.peerConnection.remoteDescription) {
            this.pendingIceCandidates.push(candidate)
            return
        }
        
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                this.error('添加ICE候选失败:', error)
            })
    }

    async addPendingIceCandidates() {
        for (const candidate of this.pendingIceCandidates) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            } catch (error) {
                this.error('添加缓存ICE候选失败:', error)
            }
        }
        this.pendingIceCandidates = []
    }

    sendInput(eventData) {
        if (this.dataChannelManager && this.dataChannelManager.isOpen()) {
            this.dataChannelManager.send({
                type: 'input',
                ...eventData
            }, false)
        }
    }

    startLatencyCheck(interval = 2000) {
        this.latencyCheckInterval = setInterval(() => {
            if (this.dataChannelManager && this.dataChannelManager.isOpen()) {
                this.dataChannelManager.send({
                    type: 'ping',
                    timestamp: performance.now()
                })
            }
        }, interval)
    }

    stopLatencyCheck() {
        if (this.latencyCheckInterval) {
            clearInterval(this.latencyCheckInterval)
            this.latencyCheckInterval = null
        }
    }

    async disconnect() {
        this.stateMachine.transition(ConnectionState.DISCONNECTING)
        
        this.stopLatencyCheck()
        
        this.auxiliaryChannels.forEach((channel, name) => {
            try {
                channel.close()
            } catch (e) {
                this.error(`关闭辅助通道 ${name} 失败:`, e)
            }
        })
        this.auxiliaryChannels.clear()
        
        if (this.dataChannelManager) {
            this.dataChannelManager.close()
        }
        
        if (this.peerConnection) {
            this.peerConnection.close()
        }
        
        this.stateMachine.transition(ConnectionState.IDLE)
        this.log('连接已断开')
    }

    getState() {
        return this.stateMachine.getState()
    }

    isConnected() {
        return this.stateMachine.isConnected()
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BaseConnectionManager }
} else {
    window.BaseConnectionManager = BaseConnectionManager
}

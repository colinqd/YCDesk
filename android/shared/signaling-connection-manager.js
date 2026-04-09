class SignalingConnectionManager extends BaseConnectionManager {
    constructor(options = {}) {
        super(options)
        this.websocket = null
        this.sessionId = null
        this.deviceId = null
        this.targetDeviceId = null
        this.isController = false
        this.messageIdCounter = 0
        this.pendingRequests = new Map()
        this.reconnectAttempts = 0
        this.maxReconnectAttempts = 5
        this.reconnectDelay = 1000
    }

    async establishSignaling(config) {
        this.log('信令模式: 连接WebSocket服务器')
        
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(config.signalingUrl)
                
                this.websocket.onopen = () => {
                    this.log('WebSocket连接成功')
                    this.reconnectAttempts = 0
                    resolve()
                }
                
                this.websocket.onerror = (error) => {
                    this.error('WebSocket连接错误:', error)
                    reject(new Error('WebSocket连接失败'))
                }
                
                this.websocket.onclose = (event) => {
                    this.log(`WebSocket连接关闭: code=${event.code}, reason=${event.reason}`)
                    this.handleWebSocketClose(event)
                }
                
                this.websocket.onmessage = (event) => {
                    this.handleWebSocketMessage(JSON.parse(event.data))
                }
                
            } catch (error) {
                reject(error)
            }
        })
    }

    async authenticate(credentials) {
        this.log('信令模式: 身份验证')
        
        return this.sendRequest('authenticate', {
            token: credentials.token,
            deviceId: credentials.deviceId
        }).then(response => {
            if (response.success) {
                this.sessionId = response.sessionId
                this.deviceId = credentials.deviceId
                this.log(`身份验证成功, sessionId=${this.sessionId}`)
                return response
            } else {
                throw new Error(response.error || '身份验证失败')
            }
        })
    }

    async negotiateCapabilities() {
        this.log('信令模式: 能力协商')
        
        return this.sendRequest('negotiate-capabilities', {
            capabilities: {
                video: true,
                audio: false,
                clipboard: true,
                fileTransfer: false
            }
        }).then(response => {
            this.log('能力协商完成')
            return response.capabilities
        })
    }

    sendSignalingMessage(message) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            this.log('WebSocket未连接，消息加入队列')
            return
        }
        
        const payload = {
            ...message,
            sessionId: this.sessionId,
            deviceId: this.deviceId,
            targetDeviceId: this.targetDeviceId,
            timestamp: Date.now()
        }
        
        this.websocket.send(JSON.stringify(payload))
    }

    sendRequest(type, data, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const requestId = ++this.messageIdCounter
            
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId)
                reject(new Error(`请求超时: ${type}`))
            }, timeout)
            
            this.pendingRequests.set(requestId, { resolve, reject, timer })
            
            const payload = {
                type,
                requestId,
                ...data,
                sessionId: this.sessionId,
                deviceId: this.deviceId
            }
            
            this.websocket.send(JSON.stringify(payload))
        })
    }

    handleWebSocketMessage(data) {
        if (data.requestId && this.pendingRequests.has(data.requestId)) {
            const pending = this.pendingRequests.get(data.requestId)
            clearTimeout(pending.timer)
            this.pendingRequests.delete(data.requestId)
            
            if (data.error) {
                pending.reject(new Error(data.error))
            } else {
                pending.resolve(data)
            }
            return
        }
        
        switch (data.type) {
            case 'webrtc-answer':
                this.handleAnswer(data.answer)
                break
                
            case 'webrtc-ice-candidate':
                this.handleIceCandidate(data.candidate)
                break
                
            case 'webrtc-offer':
                this.handleSignalingOffer(data)
                break
                
            case 'connection-request':
                this.handleConnectionRequest(data)
                break
                
            case 'connection-established':
                this.onP2PEstablished()
                break
                
            case 'device-disconnected':
                this.handleDeviceDisconnected(data)
                break
                
            case 'error':
                this.error('服务器错误:', data.message)
                this.emit('signaling-error', data)
                break
                
            default:
                this.log(`未知消息类型: ${data.type}`)
        }
    }

    handleWebSocketClose(event) {
        if (this.stateMachine.isConnected()) {
            this.log('P2P连接已建立，WebSocket关闭不影响')
            return
        }
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            this.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
            
            setTimeout(() => {
                this.establishSignaling({ signalingUrl: this.config.signalingUrl })
                    .then(() => this.authenticate({ token: this.config.credentials.token, deviceId: this.deviceId }))
                    .then(() => this.emit('reconnected'))
                    .catch(error => this.error('重连失败:', error))
            }, this.reconnectDelay * this.reconnectAttempts)
        } else {
            this.emit('connection-failed', { reason: 'WebSocket连接失败' })
        }
    }

    async handleSignalingOffer(data) {
        this.log('信令模式: 收到offer')
        this.targetDeviceId = data.fromDeviceId
        
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
            await this.addPendingIceCandidates()
            
            if (!this.isController) {
                await this.startScreenCapture()
            }
            
            const answer = await this.peerConnection.createAnswer()
            await this.peerConnection.setLocalDescription(answer)
            
            this.sendSignalingMessage({
                type: 'webrtc-answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                targetDeviceId: data.fromDeviceId
            })
            
            this.log('信令模式: answer已发送')
        } catch (error) {
            this.error('处理offer失败:', error)
        }
    }

    handleConnectionRequest(data) {
        this.log(`收到连接请求: from=${data.fromDeviceId}`)
        this.emit('connection-request', data)
    }

    acceptConnection(targetDeviceId) {
        this.targetDeviceId = targetDeviceId
        this.sendSignalingMessage({
            type: 'accept-connection',
            targetDeviceId
        })
    }

    rejectConnection(targetDeviceId, reason) {
        this.sendSignalingMessage({
            type: 'reject-connection',
            targetDeviceId,
            reason
        })
    }

    requestConnection(targetDeviceId) {
        this.targetDeviceId = targetDeviceId
        this.isController = true
        
        return this.sendRequest('request-connection', {
            targetDeviceId
        })
    }

    onP2PEstablished() {
        this.log('P2P连接已建立')
        
        this.emit('p2p-established')
    }

    handleDeviceDisconnected(data) {
        this.log(`设备断开连接: ${data.deviceId}`)
        
        if (data.deviceId === this.targetDeviceId) {
            this.emit('peer-disconnected', data)
        }
    }

    async startScreenCapture() {
        this.log('信令模式: 开始屏幕捕获')
        
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
                    this.peerConnection.addTrack(track, stream)
                })
                
                this.log('屏幕捕获成功')
            }
        } catch (error) {
            this.error('屏幕捕获失败:', error)
            throw error
        }
    }

    async connect(config) {
        this.log('信令模式: 开始连接')
        return super.connect(config)
    }

    disconnect() {
        if (this.websocket) {
            this.websocket.close()
            this.websocket = null
        }
        
        this.pendingRequests.forEach(({ timer }) => clearTimeout(timer))
        this.pendingRequests.clear()
        
        return super.disconnect()
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SignalingConnectionManager }
} else {
    window.SignalingConnectionManager = SignalingConnectionManager
}

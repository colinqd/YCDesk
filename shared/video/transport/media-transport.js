/**
 * YCDesk 媒体流传输管理器
 * 
 * 负责通过 WebRTC PeerConnection 传输视频流
 * 提供统一的连接管理、ICE 交换、媒体流处理等功能
 * 
 * @module shared/video/transport/media-transport
 */

/**
 * 媒体流传输管理器
 */
export class MediaTransport {
    /**
     * 创建媒体传输实例
     * 
     * @param {Object} options - 配置选项
     * @param {Array} [options.iceServers=[]] - ICE 服务器列表
     * @param {Function} [options.onConnected] - 连接成功回调
     * @param {Function} [options.onDisconnected] - 连接断开回调
     * @param {Function} [options.onError] - 错误回调
     * @param {Function} [options.onIceCandidate] - ICE 候选回调
     * @param {Function} [options.onTrack] - 收到媒体流轨道回调
     */
    constructor(options = {}) {
        this.peerConnection = null
        this.localStream = null
        this.remoteStream = null
        
        this.config = {
            iceServers: options.iceServers || [],
            iceCandidatePoolSize: options.iceCandidatePoolSize || 10,
            ...options
        }
        
        // 回调函数
        this.onConnected = options.onConnected || null
        this.onDisconnected = options.onDisconnected || null
        this.onError = options.onError || null
        this.onIceCandidate = options.onIceCandidate || null
        this.onTrack = options.onTrack || null
        this.onDataChannel = options.onDataChannel || null
        
        // 状态
        this.isOffering = false
        this.pendingIceCandidates = []
        
        // 日志
        this.logger = options.logger || console
    }
    
    /**
     * 创建 PeerConnection
     * 
     * @returns {Promise<void>}
     */
    async createPeerConnection() {
        try {
            this.logger.log('[MediaTransport] 创建 PeerConnection')
            
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.config.iceServers,
                iceCandidatePoolSize: this.config.iceCandidatePoolSize
            })
            
            this._setupPeerConnectionListeners()
            
            this.logger.log('[MediaTransport] PeerConnection 创建成功')
        } catch (error) {
            this.logger.error('[MediaTransport] 创建 PeerConnection 失败:', error)
            throw error
        }
    }
    
    /**
     * 设置 PeerConnection 监听器
     * 
     * @private
     */
    _setupPeerConnectionListeners() {
        // 连接状态变化
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState
            this.logger.log('[MediaTransport] 连接状态变化:', state)
            
            switch (state) {
                case 'connected':
                    if (this.onConnected) {
                        this.onConnected()
                    }
                    break
                case 'disconnected':
                case 'closed':
                case 'failed':
                    if (this.onDisconnected) {
                        this.onDisconnected()
                    }
                    break
            }
            
            if (state === 'failed' && this.onError) {
                this.onError(new Error('WebRTC 连接失败'))
            }
        }
        
        // ICE 候选
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.logger.log('[MediaTransport] ICE 候选:', event.candidate.candidate)
                if (this.onIceCandidate) {
                    this.onIceCandidate(event.candidate)
                }
            }
        }
        
        // 收到媒体流轨道
        this.peerConnection.ontrack = (event) => {
            this.logger.log('[MediaTransport] 收到媒体流轨道:', event.track.kind)
            
            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0]
                
                if (this.onTrack) {
                    this.onTrack(this.remoteStream, event.track, event.receiver)
                }
            }
        }
        
        // 数据通道（被控端接收）
        this.peerConnection.ondatachannel = (event) => {
            this.logger.log('[MediaTransport] 收到数据通道:', event.channel.label)
            
            if (this.onDataChannel) {
                this.onDataChannel(event.channel)
            }
        }
        
        // ICE 连接状态变化
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState
            this.logger.log('[MediaTransport] ICE 状态变化:', state)
        }
    }
    
    /**
     * 添加本地媒体流
     * 
     * @param {MediaStream} stream - 媒体流
     * @returns {void}
     */
    addStream(stream) {
        if (!this.peerConnection) {
            throw new Error('必须先创建 PeerConnection')
        }
        
        this.logger.log('[MediaTransport] 添加本地媒体流')
        
        this.localStream = stream
        
        // 添加所有轨道
        stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream)
            this.logger.log('[MediaTransport] 添加轨道:', track.kind, track.label)
        })
    }
    
    /**
     * 添加单个轨道
     * 
     * @param {MediaStreamTrack} track - 媒体轨道
     * @param {MediaStream} stream - 所属媒体流
     * @returns {void}
     */
    addTrack(track, stream) {
        if (!this.peerConnection) {
            throw new Error('必须先创建 PeerConnection')
        }
        
        this.peerConnection.addTrack(track, stream)
    }
    
    /**
     * 移除轨道
     * 
     * @param {MediaStreamTrack} track - 要移除的轨道
     * @returns {void}
     */
    removeTrack(track) {
        const sender = this.peerConnection.getSenders().find(
            s => s.track === track
        )
        
        if (sender) {
            this.peerConnection.removeTrack(sender)
        }
    }
    
    /**
     * 创建 Offer（主控端）
     * 
     * @param {Object} [options] - 创建选项
     * @param {boolean} [options.offerToReceiveVideo=true] - 是否接收视频
     * @param {boolean} [options.offerToReceiveAudio=true] - 是否接收音频
     * @returns {Promise<RTCSessionDescription>} Offer 描述
     */
    async createOffer(options = {}) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 不存在')
        }
        
        this.logger.log('[MediaTransport] 创建 Offer')
        this.isOffering = true
        
        try {
            const offer = await this.peerConnection.createOffer({
                offerToReceiveVideo: options.offerToReceiveVideo ?? true,
                offerToReceiveAudio: options.offerToReceiveAudio ?? true
            })
            
            await this.peerConnection.setLocalDescription(offer)
            
            this.logger.log('[MediaTransport] Offer 创建并设置成功')
            
            return offer
        } catch (error) {
            this.logger.error('[MediaTransport] 创建 Offer 失败:', error)
            throw error
        }
    }
    
    /**
     * 创建 Answer（被控端）
     * 
     * @param {RTCSessionDescription} offer - 收到的 Offer
     * @returns {Promise<RTCSessionDescription>} Answer 描述
     */
    async createAnswer(offer) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 不存在')
        }
        
        this.logger.log('[MediaTransport] 收到 Offer，创建 Answer')
        
        try {
            // 设置远程描述
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(offer)
            )
            
            // 创建 Answer
            const answer = await this.peerConnection.createAnswer()
            
            // 设置本地描述
            await this.peerConnection.setLocalDescription(answer)
            
            this.logger.log('[MediaTransport] Answer 创建并设置成功')
            
            return answer
        } catch (error) {
            this.logger.error('[MediaTransport] 创建 Answer 失败:', error)
            throw error
        }
    }
    
    /**
     * 设置远程描述
     * 
     * @param {RTCSessionDescriptionInit} description - 远程描述（Offer/Answer）
     * @returns {Promise<void>}
     */
    async setRemoteDescription(description) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 不存在')
        }
        
        this.logger.log('[MediaTransport] 设置远程描述:', description.type)
        
        try {
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(description)
            )
            
            // 处理待处理的 ICE 候选
            await this._processPendingIceCandidates()
        } catch (error) {
            this.logger.error('[MediaTransport] 设置远程描述失败:', error)
            throw error
        }
    }
    
    /**
     * 添加 ICE 候选
     * 
     * @param {RTCIceCandidateInit} candidate - ICE 候选
     * @returns {Promise<void>}
     */
    async addIceCandidate(candidate) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 不存在')
        }
        
        try {
            await this.peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            )
        } catch (error) {
            // 如果 PeerConnection 还没准备好，缓存 ICE 候选
            this.pendingIceCandidates.push(candidate)
            this.logger.log('[MediaTransport] ICE 候选已缓存，等待连接建立')
        }
    }
    
    /**
     * 处理待处理的 ICE 候选
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _processPendingIceCandidates() {
        if (this.pendingIceCandidates.length === 0) {
            return
        }
        
        this.logger.log('[MediaTransport] 处理待处理的 ICE 候选:', this.pendingIceCandidates.length)
        
        for (const candidate of this.pendingIceCandidates) {
            try {
                await this.peerConnection.addIceCandidate(
                    new RTCIceCandidate(candidate)
                )
            } catch (error) {
                this.logger.error('[MediaTransport] 添加 ICE 候选失败:', error)
            }
        }
        
        this.pendingIceCandidates = []
    }
    
    /**
     * 获取本地描述
     * 
     * @returns {RTCSessionDescription|null} 本地描述
     */
    getLocalDescription() {
        return this.peerConnection?.localDescription || null
    }
    
    /**
     * 获取远程描述
     * 
     * @returns {RTCSessionDescription|null} 远程描述
     */
    getRemoteDescription() {
        return this.peerConnection?.remoteDescription || null
    }
    
    /**
     * 获取连接状态
     * 
     * @returns {string} 连接状态
     */
    getConnectionState() {
        return this.peerConnection?.connectionState || 'closed'
    }
    
    /**
     * 获取 ICE 连接状态
     * 
     * @returns {string} ICE 连接状态
     */
    getIceConnectionState() {
        return this.peerConnection?.iceConnectionState || 'closed'
    }
    
    /**
     * 获取信令状态
     * 
     * @returns {string} 信令状态
     */
    getSignalingState() {
        return this.peerConnection?.signalingState || 'closed'
    }
    
    /**
     * 检查是否已连接
     * 
     * @returns {boolean} 是否已连接
     */
    isConnected() {
        return this.peerConnection?.connectionState === 'connected'
    }
    
    /**
     * 获取本地媒体流
     * 
     * @returns {MediaStream|null} 本地媒体流
     */
    getLocalStream() {
        return this.localStream
    }
    
    /**
     * 获取远程媒体流
     * 
     * @returns {MediaStream|null} 远程媒体流
     */
    getRemoteStream() {
        return this.remoteStream
    }
    
    /**
     * 创建数据通道（主控端）
     * 
     * @param {string} label - 通道标签
     * @param {Object} [options] - 通道选项
     * @returns {RTCDataChannel} 数据通道
     */
    createDataChannel(label, options = {}) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 不存在')
        }
        
        const channel = this.peerConnection.createDataChannel(label, {
            ordered: options.ordered ?? true,
            maxRetransmits: options.maxRetransmits,
            protocol: options.protocol || ''
        })
        
        this.logger.log('[MediaTransport] 创建数据通道:', label)
        
        return channel
    }
    
    /**
     * 获取发送器列表
     * 
     * @returns {Array<RTCRtpSender>} 发送器列表
     */
    getSenders() {
        return this.peerConnection?.getSenders() || []
    }
    
    /**
     * 获取接收器列表
     * 
     * @returns {Array<RTCRtpReceiver>} 接收器列表
     */
    getReceivers() {
        return this.peerConnection?.getReceivers() || []
    }
    
    /**
     * 获取收发器列表
     * 
     * @returns {Array<RTCRtpTransceiver>} 收发器列表
     */
    getTransceivers() {
        return this.peerConnection?.getTransceivers() || []
    }
    
    /**
     * 关闭连接
     * 
     * @returns {void}
     */
    close() {
        if (this.peerConnection) {
            this.logger.log('[MediaTransport] 关闭 PeerConnection')
            
            // 停止所有轨道
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop())
                this.localStream = null
            }
            
            this.peerConnection.close()
            this.peerConnection = null
        }
        
        this.remoteStream = null
        this.pendingIceCandidates = []
    }
    
    /**
     * 重启 PeerConnection
     * 
     * @returns {Promise<void>}
     */
    async restart() {
        this.logger.log('[MediaTransport] 重启 PeerConnection')
        
        this.close()
        await this.createPeerConnection()
    }
    
    /**
     * 获取统计信息
     * 
     * @returns {Promise<Object>} 统计信息
     */
    async getStats() {
        if (!this.peerConnection) {
            return {}
        }
        
        const stats = await this.peerConnection.getStats()
        const result = {}
        
        stats.forEach(report => {
            result[report.id] = {
                type: report.type,
                ...report
            }
        })
        
        return result
    }
}

export default MediaTransport

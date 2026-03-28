/**
 * YCDesk 连接管理器
 * 
 * 统一管理 WebRTC 连接、信令服务器连接、数据通道等
 * 支持直连模式和信令服务器模式
 * 
 * @module shared/managers/connection-manager
 */

import { Logger, createLogger, LogLevel } from '../utils/logger.js'
import { YCError, ErrorCode, ErrorHandler, RetryHandler } from '../utils/error-handler.js'
import { MediaTransport } from '../video/transport/media-transport.js'

/**
 * 连接模式枚举
 */
export const ConnectionMode = {
    /** 直连模式 */
    DIRECT: 'direct',
    /** 信令服务器模式 */
    SIGNALING: 'signaling',
    /** 混合模式 */
    HYBRID: 'hybrid'
}

/**
 * 连接角色枚举
 */
export const ConnectionRole = {
    /** 主控端 */
    CONTROLLER: 'controller',
    /** 被控端 */
    CONTROLLED: 'controlled'
}

/**
 * 连接状态枚举
 */
export const ConnectionState = {
    /** 未连接 */
    DISCONNECTED: 'disconnected',
    /** 连接中 */
    CONNECTING: 'connecting',
    /** 已连接 */
    CONNECTED: 'connected',
    /** 断开中 */
    DISCONNECTING: 'disconnecting',
    /** 失败 */
    FAILED: 'failed'
}

/**
 * 连接管理器
 */
export class ConnectionManager {
    /**
     * 创建连接管理器实例
     * 
     * @param {Object} options - 配置选项
     * @param {ConnectionMode} [options.mode=ConnectionMode.SIGNALING] - 连接模式
     * @param {ConnectionRole} [options.role=null] - 连接角色
     * @param {Object} [options.iceServers] - ICE 服务器配置
     * @param {string} [options.signalingServerUrl] - 信令服务器地址
     * @param {Object} [options.logger] - 日志对象
     * @param {Object} [options.errorHandler] - 错误处理器
     */
    constructor(options = {}) {
        this.mode = options.mode || ConnectionMode.SIGNALING
        this.role = options.role || null
        this.state = ConnectionState.DISCONNECTED
        
        // ICE 服务器配置
        this.iceServers = options.iceServers || [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
        
        // 信令服务器
        this.signalingServerUrl = options.signalingServerUrl
        this.signalingSocket = null
        
        // 连接相关
        this.targetDeviceId = null
        this.currentSessionId = null
        this.peerConnection = null
        this.dataChannel = null
        
        // 日志和错误处理
        this.logger = options.logger || createLogger({
            prefix: 'ConnectionManager',
            level: LogLevel.DEBUG
        })
        
        this.errorHandler = options.errorHandler || new ErrorHandler({
            logger: this.logger.createChild('ErrorHandler')
        })
        
        // 重试处理器
        this.retryHandler = new RetryHandler({
            maxRetries: 3,
            initialDelay: 1000
        })
        
        // 事件监听器
        this.listeners = {}
        
        // 统计信息
        this.stats = {
            connectedCount: 0,
            disconnectedCount: 0,
            lastConnectedTime: null,
            lastDisconnectedTime: null
        }
    }
    
    /**
     * 初始化连接管理器
     * 
     * @returns {Promise<void>}
     */
    async init() {
        this.logger.info('初始化连接管理器', {
            mode: this.mode,
            role: this.role
        })
        
        try {
            // 创建 PeerConnection
            await this._createPeerConnection()
            
            this.logger.info('连接管理器初始化完成')
        } catch (error) {
            const ycError = this.errorHandler.fromError(
                error,
                ErrorCode.INITIALIZATION_FAILED,
                '连接管理器初始化失败'
            )
            this.errorHandler.handleError(ycError)
            throw ycError
        }
    }
    
    /**
     * 创建 PeerConnection
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _createPeerConnection() {
        this.logger.debug('创建 PeerConnection')
        
        try {
            this.peerConnection = new MediaTransport({
                iceServers: this.iceServers,
                logger: this.logger.createChild('MediaTransport'),
                onConnected: () => this._onConnected(),
                onDisconnected: () => this._onDisconnected(),
                onError: (error) => this._onError(error),
                onIceCandidate: (candidate) => this._onIceCandidate(candidate),
                onTrack: (stream, track) => this._emit('track', { stream, track }),
                onDataChannel: (channel) => this._onDataChannel(channel)
            })
            
            await this.peerConnection.createPeerConnection()
            
            this.logger.info('PeerConnection 创建成功')
        } catch (error) {
            throw this.errorHandler.fromError(
                error,
                ErrorCode.WEBRTC_ERROR,
                '创建 PeerConnection 失败'
            )
        }
    }
    
    /**
     * 连接到目标设备
     * 
     * @param {Object} target - 目标设备信息
     * @param {string} target.deviceId - 目标设备 ID
     * @returns {Promise<void>}
     */
    async connect(target) {
        if (this.state === ConnectionState.CONNECTING ||
            this.state === ConnectionState.CONNECTED) {
            this.logger.warn('已在连接中或已连接')
            return
        }
        
        this.targetDeviceId = target.deviceId
        this._setState(ConnectionState.CONNECTING)
        
        this.logger.info('开始连接目标设备', {
            deviceId: target.deviceId,
            mode: this.mode
        })
        
        try {
            if (this.mode === ConnectionMode.DIRECT) {
                await this._connectDirect(target)
            } else if (this.mode === ConnectionMode.SIGNALING) {
                await this._connectViaSignaling(target)
            } else if (this.mode === ConnectionMode.HYBRID) {
                await this._connectHybrid(target)
            }
        } catch (error) {
            this._setState(ConnectionState.FAILED)
            const ycError = this.errorHandler.fromError(
                error,
                ErrorCode.CONNECTION_FAILED,
                '连接失败'
            )
            this.errorHandler.handleError(ycError)
            throw ycError
        }
    }
    
    /**
     * 直连模式连接
     * 
     * @private
     * @param {Object} target - 目标设备信息
     * @returns {Promise<void>}
     */
    async _connectDirect(target) {
        this.logger.info('使用直连模式连接')
        
        try {
            // 直连模式需要手动交换 SDP
            if (this.role === ConnectionRole.CONTROLLER) {
                // 主控端创建 Offer
                const offer = await this.peerConnection.createOffer()
                this._emit('offer', offer)
                
                // 等待 Answer（由外部调用 setRemoteDescription）
            } else {
                // 被控端等待 Offer（由外部调用 createAnswer）
            }
        } catch (error) {
            throw this.errorHandler.fromError(
                error,
                ErrorCode.CONNECTION_FAILED,
                '直连模式连接失败'
            )
        }
    }
    
    /**
     * 通过信令服务器连接
     * 
     * @private
     * @param {Object} target - 目标设备信息
     * @returns {Promise<void>}
     */
    async _connectViaSignaling(target) {
        this.logger.info('通过信令服务器连接')
        
        try {
            // 连接到信令服务器
            await this._connectToSignalingServer()
            
            // 发送连接请求
            await this._sendSignalingMessage({
                type: 'connect',
                targetDeviceId: target.deviceId,
                role: this.role
            })
            
            // 等待信令服务器响应
            // 主控端创建 Offer
            if (this.role === ConnectionRole.CONTROLLER) {
                const offer = await this.peerConnection.createOffer()
                await this._sendSignalingMessage({
                    type: 'offer',
                    offer: offer
                })
            }
        } catch (error) {
            throw this.errorHandler.fromError(
                error,
                ErrorCode.CONNECTION_FAILED,
                '信令服务器连接失败'
            )
        }
    }
    
    /**
     * 混合模式连接
     * 
     * @private
     * @param {Object} target - 目标设备信息
     * @returns {Promise<void>}
     */
    async _connectHybrid(target) {
        this.logger.info('使用混合模式连接')
        
        // 优先尝试直连，失败后使用信令服务器
        try {
            await this._connectDirect(target)
        } catch (directError) {
            this.logger.warn('直连失败，切换到信令服务器模式')
            await this._connectViaSignaling(target)
        }
    }
    
    /**
     * 连接到信令服务器
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _connectToSignalingServer() {
        if (!this.signalingServerUrl) {
            throw new YCError(
                ErrorCode.INVALID_ARGUMENT,
                '信令服务器地址未设置'
            )
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.signalingSocket = new WebSocket(this.signalingServerUrl)
                
                this.signalingSocket.onopen = () => {
                    this.logger.info('信令服务器连接成功')
                    resolve()
                }
                
                this.signalingSocket.onerror = (error) => {
                    reject(new YCError(
                        ErrorCode.WEBSOCKET_ERROR,
                        '信令服务器连接失败'
                    ))
                }
                
                this.signalingSocket.onmessage = (event) => {
                    this._handleSignalingMessage(JSON.parse(event.data))
                }
                
                this.signalingSocket.onclose = () => {
                    this.logger.info('信令服务器连接关闭')
                    this.signalingSocket = null
                }
            } catch (error) {
                reject(error)
            }
        })
    }
    
    /**
     * 处理信令消息
     * 
     * @private
     * @param {Object} message - 信令消息
     */
    async _handleSignalingMessage(message) {
        this.logger.debug('收到信令消息', { type: message.type })
        
        try {
            switch (message.type) {
                case 'offer':
                    await this._handleOffer(message.offer)
                    break
                case 'answer':
                    await this._handleAnswer(message.answer)
                    break
                case 'ice-candidate':
                    await this._handleIceCandidate(message.candidate)
                    break
                case 'connected':
                    this.currentSessionId = message.sessionId
                    break
                case 'error':
                    this._onError(new YCError(
                        ErrorCode.SIGNALING_ERROR,
                        message.error
                    ))
                    break
            }
        } catch (error) {
            this.logger.error('处理信令消息失败:', error)
        }
    }
    
    /**
     * 处理 Offer
     * 
     * @private
     * @param {RTCSessionDescription} offer - Offer
     * @returns {Promise<void>}
     */
    async _handleOffer(offer) {
        this.logger.info('收到 Offer，创建 Answer')
        
        const answer = await this.peerConnection.createAnswer(offer)
        
        if (this.signalingSocket) {
            await this._sendSignalingMessage({
                type: 'answer',
                answer: answer
            })
        }
    }
    
    /**
     * 处理 Answer
     * 
     * @private
     * @param {RTCSessionDescription} answer - Answer
     * @returns {Promise<void>}
     */
    async _handleAnswer(answer) {
        this.logger.info('收到 Answer，设置远程描述')
        
        await this.peerConnection.setRemoteDescription(answer)
    }
    
    /**
     * 处理 ICE 候选
     * 
     * @private
     * @param {RTCIceCandidate} candidate - ICE 候选
     * @returns {Promise<void>}
     */
    async _handleIceCandidate(candidate) {
        this.logger.debug('收到 ICE 候选')
        
        await this.peerConnection.addIceCandidate(candidate)
    }
    
    /**
     * 发送信令消息
     * 
     * @private
     * @param {Object} message - 消息
     * @returns {Promise<void>}
     */
    async _sendSignalingMessage(message) {
        if (!this.signalingSocket || this.signalingSocket.readyState !== WebSocket.OPEN) {
            throw new YCError(
                ErrorCode.WEBSOCKET_ERROR,
                '信令服务器未连接'
            )
        }
        
        this.signalingSocket.send(JSON.stringify(message))
    }
    
    /**
     * 创建数据通道
     * 
     * @param {string} label - 通道标签
     * @param {Object} [options] - 通道选项
     * @returns {RTCDataChannel} 数据通道
     */
    createDataChannel(label, options = {}) {
        if (!this.peerConnection) {
            throw new YCError(
                ErrorCode.WEBRTC_ERROR,
                'PeerConnection 未创建'
            )
        }
        
        this.dataChannel = this.peerConnection.createDataChannel(label, options)
        this._setupDataChannelListeners(this.dataChannel)
        
        this.logger.info('数据通道创建成功', { label })
        
        return this.dataChannel
    }
    
    /**
     * 设置数据通道监听器
     * 
     * @private
     * @param {RTCDataChannel} channel - 数据通道
     */
    _setupDataChannelListeners(channel) {
        channel.onopen = () => {
            this.logger.info('数据通道已打开')
            this._emit('dataChannelOpen', channel)
        }
        
        channel.onclose = () => {
            this.logger.info('数据通道已关闭')
            this._emit('dataChannelClose', channel)
        }
        
        channel.onerror = (error) => {
            this.logger.error('数据通道错误:', error)
            this._emit('dataChannelError', error)
        }
        
        channel.onmessage = (event) => {
            this._emit('dataChannelMessage', event)
        }
    }
    
    /**
     * 处理数据通道（被控端）
     * 
     * @private
     * @param {RTCDataChannel} channel - 数据通道
     */
    _onDataChannel(channel) {
        this.logger.info('收到数据通道', { label: channel.label })
        this.dataChannel = channel
        this._setupDataChannelListeners(channel)
        this._emit('dataChannel', channel)
    }
    
    /**
     * 连接成功处理
     * 
     * @private
     */
    _onConnected() {
        this.logger.info('连接已建立')
        this._setState(ConnectionState.CONNECTED)
        this.stats.connectedCount++
        this.stats.lastConnectedTime = new Date().toISOString()
        this._emit('connected')
    }
    
    /**
     * 连接断开处理
     * 
     * @private
     */
    _onDisconnected() {
        this.logger.info('连接已断开')
        this._setState(ConnectionState.DISCONNECTED)
        this.stats.disconnectedCount++
        this.stats.lastDisconnectedTime = new Date().toISOString()
        this._emit('disconnected')
    }
    
    /**
     * 错误处理
     * 
     * @private
     * @param {Error} error - 错误对象
     */
    _onError(error) {
        this.logger.error('连接错误:', error)
        this._emit('error', error)
    }
    
    /**
     * ICE 候选处理
     * 
     * @private
     * @param {RTCIceCandidate} candidate - ICE 候选
     */
    _onIceCandidate(candidate) {
        this.logger.debug('生成 ICE 候选')
        
        if (this.signalingSocket) {
            this._sendSignalingMessage({
                type: 'ice-candidate',
                candidate: candidate
            })
        } else {
            this._emit('iceCandidate', candidate)
        }
    }
    
    /**
     * 设置连接状态
     * 
     * @private
     * @param {ConnectionState} state - 状态
     */
    _setState(state) {
        const oldState = this.state
        this.state = state
        this._emit('stateChange', { oldState, newState: state })
    }
    
    /**
     * 断开连接
     * 
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.state === ConnectionState.DISCONNECTED) {
            this.logger.warn('已经断开连接')
            return
        }
        
        this._setState(ConnectionState.DISCONNECTING)
        this.logger.info('开始断开连接')
        
        try {
            // 关闭信令连接
            if (this.signalingSocket) {
                this.signalingSocket.close()
                this.signalingSocket = null
            }
            
            // 关闭 PeerConnection
            if (this.peerConnection) {
                this.peerConnection.close()
                this.peerConnection = null
            }
            
            // 关闭数据通道
            if (this.dataChannel) {
                this.dataChannel.close()
                this.dataChannel = null
            }
            
            this._setState(ConnectionState.DISCONNECTED)
            this.logger.info('连接已断开')
        } catch (error) {
            this.logger.error('断开连接失败:', error)
            throw error
        }
    }
    
    /**
     * 重新连接
     * 
     * @returns {Promise<void>}
     */
    async reconnect() {
        this.logger.info('重新连接')
        
        await this.disconnect()
        await this.init()
        
        if (this.targetDeviceId) {
            await this.connect({ deviceId: this.targetDeviceId })
        }
    }
    
    /**
     * 检查是否已连接
     * 
     * @returns {boolean} 是否已连接
     */
    isConnected() {
        return this.state === ConnectionState.CONNECTED
    }
    
    /**
     * 获取连接状态
     * 
     * @returns {ConnectionState} 连接状态
     */
    getState() {
        return this.state
    }
    
    /**
     * 获取统计信息
     * 
     * @returns {Object} 统计信息
     */
    getStats() {
        return { ...this.stats }
    }
    
    /**
     * 添加事件监听器
     * 
     * @param {string} event - 事件名称
     * @param {Function} listener - 监听器函数
     */
    on(event, listener) {
        if (!this.listeners[event]) {
            this.listeners[event] = []
        }
        this.listeners[event].push(listener)
    }
    
    /**
     * 移除事件监听器
     * 
     * @param {string} event - 事件名称
     * @param {Function} listener - 监听器函数
     */
    off(event, listener) {
        if (!this.listeners[event]) return
        
        this.listeners[event] = this.listeners[event].filter(
            l => l !== listener
        )
    }
    
    /**
     * 触发事件
     * 
     * @private
     * @param {string} event - 事件名称
     * @param {any} data - 事件数据
     */
    _emit(event, data) {
        if (!this.listeners[event]) return
        
        this.listeners[event].forEach(listener => {
            try {
                listener(data)
            } catch (error) {
                this.logger.error(`事件监听器错误 [${event}]:`, error)
            }
        })
    }
    
    /**
     * 销毁连接管理器
     * 
     * @returns {Promise<void>}
     */
    async destroy() {
        this.logger.info('销毁连接管理器')
        
        await this.disconnect()
        
        // 清空所有监听器
        this.listeners = {}
        
        // 重置统计
        this.stats = {
            connectedCount: 0,
            disconnectedCount: 0,
            lastConnectedTime: null,
            lastDisconnectedTime: null
        }
        
        this.logger.info('连接管理器已销毁')
    }
}

export default ConnectionManager

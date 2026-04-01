/**
 * YCDesk 应用核心类
 * 
 * 封装应用的主要逻辑和状态
 * 统一管理视频、输入、连接等模块
 * 
 * @module shared/core/app-core
 */

import { Logger, createLogger, LogLevel } from '../utils/logger.js'
import { ErrorHandler, ErrorCode } from '../utils/error-handler.js'
import { MatrixTransformer } from '../components/matrix-transformer.js'
import { ConnectionManager, ConnectionMode, ConnectionRole } from '../managers/connection-manager.js'
import { MediaTransport } from '../video/transport/media-transport.js'
import { BrowserCapture } from '../video/capture/browser-capture.js'
import { ElectronCapture } from '../video/capture/electron-capture.js'

/**
 * 应用角色枚举
 */
export const AppRole = {
    /** 未选择 */
    NONE: null,
    /** 主控端 */
    CONTROLLER: 'controller',
    /** 被控端 */
    CONTROLLED: 'controlled'
}

/**
 * 应用状态枚举
 */
export const AppState = {
    /** 未初始化 */
    UNINITIALIZED: 'uninitialized',
    /** 初始化中 */
    INITIALIZING: 'initializing',
    /** 已初始化 */
    INITIALIZED: 'initialized',
    /** 运行中 */
    RUNNING: 'running',
    /** 已销毁 */
    DESTROYED: 'destroyed'
}

/**
 * YCDesk 应用核心类
 */
export class AppCore {
    /**
     * 创建应用核心实例
     * 
     * @param {Object} options - 配置选项
     * @param {string} [options.deviceId] - 设备 ID
     * @param {string} [options.platform='web'] - 平台类型
     * @param {AppRole} [options.role=null] - 应用角色
     * @param {number} [options.logLevel=LogLevel.INFO] - 日志级别
     * @param {Object} [options.iceServers] - ICE 服务器配置
     * @param {string} [options.signalingServerUrl] - 信令服务器地址
     */
    constructor(options = {}) {
        this.deviceId = options.deviceId || null
        this.platform = options.platform || 'web'
        this.role = options.role || AppRole.NONE
        this.state = AppState.UNINITIALIZED
        
        // 配置
        this.config = {
            logLevel: options.logLevel ?? LogLevel.INFO,
            iceServers: options.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            signalingServerUrl: options.signalingServerUrl || null,
            connectionMode: options.connectionMode || ConnectionMode.SIGNALING,
            ...options
        }
        
        // 创建日志器
        this.logger = createLogger({
            level: this.config.logLevel,
            platform: this.platform,
            prefix: `AppCore[${this.platform}]`
        })
        
        // 创建错误处理器
        this.errorHandler = new ErrorHandler({
            logger: this.logger.createChild('ErrorHandler'),
            enableLogging: true,
            onFatal: (error) => this._handleFatalError(error)
        })
        
        // 初始化组件
        this.matrixTransformer = new MatrixTransformer({
            logger: this.logger.createChild('MatrixTransformer')
        })
        
        this.connectionManager = null
        this.mediaTransport = null
        this.videoCapturer = null
        
        // 状态
        this.isConnected = false
        this.isInitialized = false
        
        // 事件监听器
        this.listeners = {}
        
        this.logger.info('AppCore 创建成功', {
            deviceId: this.deviceId,
            platform: this.platform,
            role: this.role
        })
    }
    
    /**
     * 初始化应用
     * 
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) {
            this.logger.warn('应用已初始化，跳过')
            return
        }
        
        this._setState(AppState.INITIALIZING)
        
        try {
            this.logger.info('开始初始化应用')
            
            // 获取设备 ID（如果未提供）
            if (!this.deviceId) {
                this.deviceId = await this._generateDeviceId()
                this.logger.info('生成设备 ID:', this.deviceId)
            }
            
            // 初始化连接管理器
            await this._initConnectionManager()
            
            // 根据角色初始化不同组件
            if (this.role === AppRole.CONTROLLER) {
                await this._initController()
            } else if (this.role === AppRole.CONTROLLED) {
                await this._initControlled()
            }
            
            // 设置事件监听
            this._setupEventListeners()
            
            this.isInitialized = true
            this._setState(AppState.INITIALIZED)
            
            this.logger.info('应用初始化完成')
            
            this._emit('initialized')
        } catch (error) {
            this._setState(AppState.UNINITIALIZED)
            const ycError = this.errorHandler.fromError(
                error,
                ErrorCode.INITIALIZATION_FAILED,
                '应用初始化失败'
            )
            this.errorHandler.handleError(ycError)
            throw ycError
        }
    }
    
    /**
     * 初始化连接管理器
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _initConnectionManager() {
        this.logger.info('初始化连接管理器')
        
        this.connectionManager = new ConnectionManager({
            mode: this.config.connectionMode,
            role: this.role === AppRole.CONTROLLER ? ConnectionRole.CONTROLLER : ConnectionRole.CONTROLLED,
            iceServers: this.config.iceServers,
            signalingServerUrl: this.config.signalingServerUrl,
            logger: this.logger.createChild('ConnectionManager'),
            errorHandler: this.errorHandler
        })
        
        await this.connectionManager.init()
        
        this.logger.info('连接管理器初始化完成')
    }
    
    /**
     * 初始化主控端
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _initController() {
        this.logger.info('初始化主控端')
        
        // 创建媒体传输（用于接收视频）
        this.mediaTransport = new MediaTransport({
            iceServers: this.config.iceServers,
            logger: this.logger.createChild('MediaTransport'),
            onTrack: (stream) => this._onRemoteTrack(stream),
            onDataChannel: (channel) => this._onDataChannel(channel)
        })
        
        await this.mediaTransport.createPeerConnection()
        
        this.logger.info('主控端初始化完成')
    }
    
    /**
     * 初始化被控端
     * 
     * @private
     * @returns {Promise<void>}
     */
    async _initControlled() {
        this.logger.info('初始化被控端')
        
        // 创建视频捕获器
        if (this.platform === 'electron') {
            this.videoCapturer = new ElectronCapture({
                maxWidth: 1920,
                maxHeight: 1080,
                maxFrameRate: 30,
                logger: this.logger.createChild('ElectronCapture')
            })
        } else {
            this.videoCapturer = new BrowserCapture({
                maxWidth: 1920,
                maxHeight: 1080,
                maxFrameRate: 30,
                logger: this.logger.createChild('BrowserCapture')
            })
        }
        
        // 创建媒体传输（用于发送视频）
        this.mediaTransport = new MediaTransport({
            iceServers: this.config.iceServers,
            logger: this.logger.createChild('MediaTransport'),
            onConnected: () => this._onConnected(),
            onDisconnected: () => this._onDisconnected(),
            onError: (error) => this._onError(error)
        })
        
        await this.mediaTransport.createPeerConnection()
        
        this.logger.info('被控端初始化完成')
    }
    
    /**
     * 设置事件监听
     * 
     * @private
     */
    _setupEventListeners() {
        // 连接事件
        this.connectionManager.on('connected', () => {
            this.isConnected = true
            this._onConnected()
        })
        
        this.connectionManager.on('disconnected', () => {
            this.isConnected = false
            this._onDisconnected()
        })
        
        this.connectionManager.on('error', (error) => {
            this._onError(error)
        })
        
        this.connectionManager.on('stateChange', (data) => {
            this._emit('connectionStateChange', data)
        })
    }
    
    /**
     * 连接到目标设备
     * 
     * @param {Object} target - 目标设备信息
     * @param {string} target.deviceId - 目标设备 ID
     * @returns {Promise<void>}
     */
    async connect(target) {
        if (!this.isInitialized) {
            throw this.errorHandler.createError(
                ErrorCode.INVALID_STATE,
                '应用未初始化'
            )
        }
        
        this.logger.info('开始连接目标设备', {
            deviceId: target.deviceId
        })
        
        try {
            await this.connectionManager.connect(target)
        } catch (error) {
            this.errorHandler.handleError(error)
            throw error
        }
    }
    
    /**
     * 断开连接
     * 
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.logger.info('断开连接')
        
        try {
            await this.connectionManager.disconnect()
        } catch (error) {
            this.errorHandler.handleError(error)
            throw error
        }
    }
    
    /**
     * 开始屏幕共享（被控端）
     * 
     * @returns {Promise<void>}
     */
    async startScreenSharing() {
        if (this.role !== AppRole.CONTROLLED) {
            throw this.errorHandler.createError(
                ErrorCode.INVALID_STATE,
                '只有被控端才能开始屏幕共享'
            )
        }
        
        this.logger.info('开始屏幕共享')
        
        try {
            // 开始捕获屏幕
            const stream = await this.videoCapturer.start()
            
            // 添加到 PeerConnection
            this.mediaTransport.addStream(stream)
            
            // 获取视频尺寸
            const videoSize = this.videoCapturer.getVideoSize()
            this.logger.info('屏幕捕获开始', videoSize)
            
            this._emit('screenSharingStarted', videoSize)
        } catch (error) {
            const ycError = this.errorHandler.fromError(
                error,
                ErrorCode.CAPTURE_FAILED,
                '屏幕捕获失败'
            )
            this.errorHandler.handleError(ycError)
            throw ycError
        }
    }
    
    /**
     * 停止屏幕共享
     * 
     * @returns {void}
     */
    stopScreenSharing() {
        this.logger.info('停止屏幕共享')
        
        if (this.videoCapturer) {
            this.videoCapturer.stop()
        }
        
        this._emit('screenSharingStopped')
    }
    
    /**
     * 发送输入命令（主控端）
     * 
     * @param {Object} command - 输入命令
     * @returns {boolean} 是否发送成功
     */
    sendInputCommand(command) {
        if (this.role !== AppRole.CONTROLLER) {
            this.logger.warn('只有主控端才能发送输入命令')
            return false
        }
        
        const dataChannel = this.connectionManager.dataChannel
        if (!dataChannel || dataChannel.readyState !== 'open') {
            this.logger.warn('数据通道未打开')
            return false
        }
        
        try {
            dataChannel.send(JSON.stringify(command))
            this.logger.debug('发送输入命令', command)
            return true
        } catch (error) {
            this.logger.error('发送输入命令失败:', error)
            return false
        }
    }
    
    /**
     * 设置远程视频显示元素（主控端）
     * 
     * @param {HTMLVideoElement} videoElement - 视频元素
     */
    setupRemoteVideo(videoElement) {
        if (this.role !== AppRole.CONTROLLER) {
            this.logger.warn('只有主控端才能设置远程视频')
            return
        }
        
        if (this.mediaTransport) {
            this.mediaTransport.onTrack((stream) => {
                videoElement.srcObject = stream
                videoElement.play().catch(error => {
                    this.logger.error('视频播放失败:', error)
                })
            })
        }
    }
    
    /**
     * 收到远程媒体流（主控端）
     * 
     * @private
     * @param {MediaStream} stream - 媒体流
     */
    _onRemoteTrack(stream) {
        this.logger.info('收到远程媒体流')
        this._emit('remoteTrack', stream)
    }
    
    /**
     * 收到数据通道
     * 
     * @private
     * @param {RTCDataChannel} channel - 数据通道
     */
    _onDataChannel(channel) {
        this.logger.info('收到数据通道', { label: channel.label })
        this._setupDataChannelListeners(channel)
        this._emit('dataChannel', channel)
    }
    
    /**
     * 设置数据通道监听器
     * 
     * @private
     * @param {RTCDataChannel} channel - 数据通道
     */
    _setupDataChannelListeners(channel) {
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                this._handleDataChannelMessage(data)
            } catch (error) {
                this.logger.error('解析数据通道消息失败:', error)
            }
        }
        
        channel.onopen = () => {
            this.logger.info('数据通道已打开')
            this._emit('dataChannelOpen')
        }
        
        channel.onclose = () => {
            this.logger.info('数据通道已关闭')
            this._emit('dataChannelClose')
        }
    }
    
    /**
     * 处理数据通道消息
     * 
     * @private
     * @param {Object} data - 消息数据
     */
    _handleDataChannelMessage(data) {
        if (data.type === 'screen-size') {
            this.logger.debug('收到屏幕尺寸', data)
            this.matrixTransformer.setRemoteScreenSize(data.width, data.height)
        } else if (data.type === 'input') {
            // 被控端接收输入
            this._handleRemoteInput(data)
        } else {
            this._emit('dataChannelMessage', data)
        }
    }
    
    /**
     * 处理远程输入（被控端）
     * 
     * @private
     * @param {Object} input - 输入数据
     */
    _handleRemoteInput(input) {
        // 由平台特定代码实现输入执行
        this._emit('remoteInput', input)
    }
    
    /**
     * 连接成功处理
     * 
     * @private
     */
    _onConnected() {
        this.logger.info('连接已建立')
        this.isConnected = true
        this._setState(AppState.RUNNING)
        this._emit('connected')
    }
    
    /**
     * 连接断开处理
     * 
     * @private
     */
    _onDisconnected() {
        this.logger.info('连接已断开')
        this.isConnected = false
        this._setState(AppState.INITIALIZED)
        this.matrixTransformer.fullReset()
        this._emit('disconnected')
    }
    
    /**
     * 错误处理
     * 
     * @private
     * @param {Error} error - 错误对象
     */
    _onError(error) {
        this.logger.error('应用错误:', error)
        this._emit('error', error)
    }
    
    /**
     * 致命错误处理
     * 
     * @private
     * @param {YCError} error - 致命错误
     */
    _handleFatalError(error) {
        this.logger.error('致命错误:', error)
        this._emit('fatalError', error)
        
        // 可以尝试自动重启或提示用户
    }
    
    /**
     * 设置应用状态
     * 
     * @private
     * @param {AppState} state - 状态
     */
    _setState(state) {
        const oldState = this.state
        this.state = state
        this._emit('stateChange', { oldState, newState: state })
    }
    
    /**
     * 生成设备 ID
     * 
     * @private
     * @returns {Promise<string>} 设备 ID
     */
    async _generateDeviceId() {
        // 平台特定的设备 ID 生成
        if (this.platform === 'electron' && window.electronAPI?.getDeviceId) {
            return await window.electronAPI.getDeviceId()
        }
        
        // 默认随机生成
        return 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase()
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
        this.listeners[event] = this.listeners[event].filter(l => l !== listener)
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
     * 获取应用状态
     * 
     * @returns {Object} 状态对象
     */
    getState() {
        return {
            deviceId: this.deviceId,
            platform: this.platform,
            role: this.role,
            state: this.state,
            isConnected: this.isConnected,
            isInitialized: this.isInitialized,
            transformer: this.matrixTransformer.getState()
        }
    }
    
    /**
     * 销毁应用
     * 
     * @returns {Promise<void>}
     */
    async destroy() {
        this.logger.info('销毁应用')
        
        try {
            // 断开连接
            if (this.isConnected) {
                await this.disconnect()
            }
            
            // 销毁连接管理器
            if (this.connectionManager) {
                await this.connectionManager.destroy()
            }
            
            // 停止屏幕共享
            this.stopScreenSharing()
            
            // 清理事件监听
            this.listeners = {}
            
            this.isInitialized = false
            this._setState(AppState.DESTROYED)
            
            this.logger.info('应用已销毁')
            this._emit('destroyed')
        } catch (error) {
            this.logger.error('销毁应用失败:', error)
            throw error
        }
    }
}

export default AppCore

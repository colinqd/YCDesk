/**
 * YCDesk 跨平台错误处理系统
 * 
 * 提供统一的错误类型、错误码和错误处理机制
 * 支持错误日志、错误恢复和错误报告
 * 
 * @module shared/utils/error-handler
 */

import { Logger, LogLevel } from './logger.js'

/**
 * 错误级别枚举
 */
export const ErrorLevel = {
    /** 信息性错误，不影响运行 */
    INFO: 0,
    /** 警告，可能影响功能 */
    WARNING: 1,
    /** 错误，功能受影响 */
    ERROR: 2,
    /** 致命错误，系统崩溃 */
    FATAL: 3
}

/**
 * 错误码定义
 */
export const ErrorCode = {
    // 通用错误 (0-999)
    OK: 0,
    UNKNOWN: 1,
    INVALID_ARGUMENT: 2,
    TIMEOUT: 3,
    ABORTED: 4,
    
    // 网络错误 (1000-1999)
    NETWORK_ERROR: 1000,
    CONNECTION_FAILED: 1001,
    CONNECTION_LOST: 1002,
    CONNECTION_TIMEOUT: 1003,
    WEBSOCKET_ERROR: 1004,
    WEBRTC_ERROR: 1005,
    ICE_ERROR: 1006,
    SDP_ERROR: 1007,
    DATA_CHANNEL_ERROR: 1008,
    
    // 输入错误 (2000-2999)
    INPUT_ERROR: 2000,
    INVALID_INPUT: 2001,
    INPUT_EXECUTION_FAILED: 2002,
    COORDINATE_TRANSFORM_FAILED: 2003,
    
    // 视频错误 (3000-3999)
    VIDEO_ERROR: 3000,
    CAPTURE_FAILED: 3001,
    ENCODE_FAILED: 3002,
    DECODE_FAILED: 3003,
    TRANSMISSION_FAILED: 3004,
    DISPLAY_FAILED: 3005,
    
    // 音频错误 (4000-4999)
    AUDIO_ERROR: 4000,
    AUDIO_CAPTURE_FAILED: 4001,
    AUDIO_PLAYBACK_FAILED: 4002,
    
    // 权限错误 (5000-5999)
    PERMISSION_ERROR: 5000,
    PERMISSION_DENIED: 5001,
    PERMISSION_NOT_GRANTED: 5002,
    
    // 系统错误 (6000-6999)
    SYSTEM_ERROR: 6000,
    NOT_SUPPORTED: 6001,
    RESOURCE_NOT_FOUND: 6002,
    RESOURCE_EXHAUSTED: 6003,
    INTERNAL_ERROR: 6004
}

/**
 * 错误描述映射
 */
const ERROR_MESSAGES = {
    [ErrorCode.OK]: '操作成功',
    [ErrorCode.UNKNOWN]: '未知错误',
    [ErrorCode.INVALID_ARGUMENT]: '无效参数',
    [ErrorCode.TIMEOUT]: '操作超时',
    [ErrorCode.ABORTED]: '操作已中止',
    
    [ErrorCode.NETWORK_ERROR]: '网络错误',
    [ErrorCode.CONNECTION_FAILED]: '连接失败',
    [ErrorCode.CONNECTION_LOST]: '连接丢失',
    [ErrorCode.CONNECTION_TIMEOUT]: '连接超时',
    [ErrorCode.WEBSOCKET_ERROR]: 'WebSocket 错误',
    [ErrorCode.WEBRTC_ERROR]: 'WebRTC 错误',
    [ErrorCode.ICE_ERROR]: 'ICE 协商错误',
    [ErrorCode.SDP_ERROR]: 'SDP 错误',
    [ErrorCode.DATA_CHANNEL_ERROR]: '数据通道错误',
    
    [ErrorCode.INPUT_ERROR]: '输入错误',
    [ErrorCode.INVALID_INPUT]: '无效输入',
    [ErrorCode.INPUT_EXECUTION_FAILED]: '输入执行失败',
    [ErrorCode.COORDINATE_TRANSFORM_FAILED]: '坐标变换失败',
    
    [ErrorCode.VIDEO_ERROR]: '视频错误',
    [ErrorCode.CAPTURE_FAILED]: '捕获失败',
    [ErrorCode.ENCODE_FAILED]: '编码失败',
    [ErrorCode.DECODE_FAILED]: '解码失败',
    [ErrorCode.TRANSMISSION_FAILED]: '传输失败',
    [ErrorCode.DISPLAY_FAILED]: '显示失败',
    
    [ErrorCode.AUDIO_ERROR]: '音频错误',
    [ErrorCode.AUDIO_CAPTURE_FAILED]: '音频捕获失败',
    [ErrorCode.AUDIO_PLAYBACK_FAILED]: '音频播放失败',
    
    [ErrorCode.PERMISSION_ERROR]: '权限错误',
    [ErrorCode.PERMISSION_DENIED]: '权限被拒绝',
    [ErrorCode.PERMISSION_NOT_GRANTED]: '权限未授予',
    
    [ErrorCode.SYSTEM_ERROR]: '系统错误',
    [ErrorCode.NOT_SUPPORTED]: '不支持的功能',
    [ErrorCode.RESOURCE_NOT_FOUND]: '资源未找到',
    [ErrorCode.RESOURCE_EXHAUSTED]: '资源耗尽',
    [ErrorCode.INTERNAL_ERROR]: '内部错误'
}

/**
 * YCDesk 自定义错误类
 */
export class YCError extends Error {
    /**
     * 创建 YCDesk 错误实例
     * 
     * @param {number} code - 错误码
     * @param {string} [message] - 错误消息（可选，会覆盖默认消息）
     * @param {Object} [details] - 详细错误信息
     */
    constructor(code, message, details = {}) {
        const defaultMessage = ERROR_MESSAGES[code] || '未知错误'
        const fullMessage = message || defaultMessage
        
        super(fullMessage)
        
        this.name = 'YCError'
        this.code = code
        this.level = this._getDefaultLevel(code)
        this.timestamp = new Date().toISOString()
        this.details = details
        this.stack = new Error().stack
        
        // 添加默认消息
        this.defaultMessage = defaultMessage
    }
    
    /**
     * 获取默认错误级别
     * 
     * @private
     * @param {number} code - 错误码
     * @returns {ErrorLevel} 错误级别
     */
    _getDefaultLevel(code) {
        if (code === ErrorCode.OK) return ErrorLevel.INFO
        if (code >= 6000) return ErrorLevel.FATAL
        if (code >= 5000) return ErrorLevel.ERROR
        if (code >= 2000) return ErrorLevel.WARNING
        return ErrorLevel.INFO
    }
    
    /**
     * 转换为 JSON 对象
     * 
     * @returns {Object} JSON 对象
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            defaultMessage: this.defaultMessage,
            level: this.level,
            timestamp: this.timestamp,
            details: this.details,
            stack: this.stack
        }
    }
    
    /**
     * 转换为字符串
     * 
     * @returns {string} 错误字符串表示
     */
    toString() {
        return `[YCError ${this.code}] ${this.message}`
    }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
    /**
     * 创建错误处理器实例
     * 
     * @param {Object} options - 配置选项
     * @param {boolean} [options.enableLogging=true] - 是否启用日志
     * @param {Function} [options.onFatal] - 致命错误回调
     * @param {Object} [options.logger] - 日志对象
     */
    constructor(options = {}) {
        this.enableLogging = options.enableLogging ?? true
        this.onFatal = options.onFatal || null
        
        this.logger = options.logger || new Logger({
            prefix: 'ErrorHandler',
            level: LogLevel.DEBUG
        })
        
        // 错误统计
        this.errorStats = {
            total: 0,
            byCode: {},
            byLevel: {}
        }
    }
    
    /**
     * 处理错误
     * 
     * @param {Error|YCError} error - 错误对象
     * @param {Object} [context] - 错误上下文
     * @returns {boolean} 是否已处理
     */
    handleError(error, context = {}) {
        // 更新统计
        this._updateStats(error)
        
        // 日志记录
        if (this.enableLogging) {
            this._logError(error, context)
        }
        
        // 致命错误处理
        if (error instanceof YCError && error.level === ErrorLevel.FATAL) {
            this._handleFatal(error)
        }
        
        // 尝试自动恢复
        return this._tryRecover(error, context)
    }
    
    /**
     * 创建 YCError
     * 
     * @param {number} code - 错误码
     * @param {string} [message] - 错误消息
     * @param {Object} [details] - 详细信息
     * @returns {YCError} 错误对象
     */
    createError(code, message, details) {
        return new YCError(code, message, details)
    }
    
    /**
     * 从其他错误创建 YCError
     * 
     * @param {Error} error - 原始错误
     * @param {number} [code=ErrorCode.UNKNOWN] - 错误码
     * @param {string} [message] - 错误消息
     * @returns {YCError} 转换后的错误
     */
    fromError(error, code = ErrorCode.UNKNOWN, message) {
        const ycError = new YCError(code, message || error.message)
        ycError.originalError = error
        ycError.stack = error.stack
        return ycError
    }
    
    /**
     * 获取错误统计
     * 
     * @returns {Object} 错误统计
     */
    getStats() {
        return { ...this.errorStats }
    }
    
    /**
     * 重置错误统计
     */
    resetStats() {
        this.errorStats = {
            total: 0,
            byCode: {},
            byLevel: {}
        }
    }
    
    /**
     * 更新错误统计
     * 
     * @private
     * @param {Error} error - 错误对象
     */
    _updateStats(error) {
        this.errorStats.total++
        
        const code = error.code || ErrorCode.UNKNOWN
        const level = error.level || ErrorLevel.ERROR
        
        this.errorStats.byCode[code] = (this.errorStats.byCode[code] || 0) + 1
        this.errorStats.byLevel[level] = (this.errorStats.byLevel[level] || 0) + 1
    }
    
    /**
     * 记录错误日志
     * 
     * @private
     * @param {Error} error - 错误对象
     * @param {Object} context - 上下文
     */
    _logError(error, context) {
        const logLevel = error.level === ErrorLevel.FATAL ? 'error' :
                        error.level === ErrorLevel.ERROR ? 'error' :
                        error.level === ErrorLevel.WARNING ? 'warn' : 'info'
        
        const message = `[${error.code}] ${error.message}`
        const data = {
            name: error.name,
            code: error.code,
            level: error.level,
            timestamp: error.timestamp,
            details: error.details,
            context
        }
        
        if (error.originalError) {
            data.originalError = error.originalError.message
        }
        
        this.logger[logLevel](message, data)
    }
    
    /**
     * 处理致命错误
     * 
     * @private
     * @param {YCError} error - 致命错误
     */
    _handleFatal(error) {
        this.logger.error('致命错误:', error.message)
        
        if (this.onFatal) {
            try {
                this.onFatal(error)
            } catch (callbackError) {
                this.logger.error('致命错误回调失败:', callbackError)
            }
        }
    }
    
    /**
     * 尝试恢复
     * 
     * @private
     * @param {Error} error - 错误对象
     * @param {Object} context - 上下文
     * @returns {boolean} 是否成功恢复
     */
    _tryRecover(error, context) {
        // 默认不尝试恢复
        // 子类可以实现特定的恢复逻辑
        return false
    }
}

/**
 * 重试处理器
 */
export class RetryHandler {
    /**
     * 创建重试处理器实例
     * 
     * @param {Object} options - 配置选项
     * @param {number} [options.maxRetries=3] - 最大重试次数
     * @param {number} [options.initialDelay=1000] - 初始延迟（毫秒）
     * @param {number} [options.maxDelay=30000] - 最大延迟（毫秒）
     * @param {number} [options.backoffMultiplier=2] - 退避倍数
     */
    constructor(options = {}) {
        this.maxRetries = options.maxRetries ?? 3
        this.initialDelay = options.initialDelay ?? 1000
        this.maxDelay = options.maxDelay ?? 30000
        this.backoffMultiplier = options.backoffMultiplier ?? 2
    }
    
    /**
     * 执行带重试的操作
     * 
     * @param {Function} operation - 要执行的操作（返回 Promise）
     * @param {Function} [shouldRetry] - 是否应该重试的判断函数
     * @returns {Promise<any>} 操作结果
     */
    async execute(operation, shouldRetry) {
        let lastError
        let delay = this.initialDelay
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation()
            } catch (error) {
                lastError = error
                
                // 检查是否应该重试
                if (shouldRetry && !shouldRetry(error, attempt)) {
                    throw error
                }
                
                // 如果是最后一次尝试，不再重试
                if (attempt === this.maxRetries) {
                    throw error
                }
                
                // 等待后重试
                await this._sleep(delay)
                delay = Math.min(delay * this.backoffMultiplier, this.maxDelay)
            }
        }
        
        throw lastError
    }
    
    /**
     * 睡眠
     * 
     * @private
     * @param {number} ms - 毫秒数
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

/**
 * 错误恢复策略
 */
export class RecoveryStrategy {
    /**
     * 创建错误恢复策略
     * 
     * @param {Object} options - 配置选项
     * @param {Function} [options.onRecover] - 恢复回调
     * @param {Array} [options.recoverableErrors] - 可恢复的错误码列表
     */
    constructor(options = {}) {
        this.onRecover = options.onRecover || null
        this.recoverableErrors = options.recoverableErrors || [
            ErrorCode.CONNECTION_LOST,
            ErrorCode.CONNECTION_TIMEOUT,
            ErrorCode.NETWORK_ERROR,
            ErrorCode.WEBRTC_ERROR
        ]
    }
    
    /**
     * 检查错误是否可恢复
     * 
     * @param {YCError} error - 错误对象
     * @returns {boolean} 是否可恢复
     */
    isRecoverable(error) {
        if (!(error instanceof YCError)) return false
        return this.recoverableErrors.includes(error.code)
    }
    
    /**
     * 执行恢复
     * 
     * @param {YCError} error - 错误对象
     * @param {Object} context - 上下文
     * @returns {Promise<boolean>} 是否成功恢复
     */
    async recover(error, context) {
        if (!this.isRecoverable(error)) {
            return false
        }
        
        if (this.onRecover) {
            try {
                await this.onRecover(error, context)
                return true
            } catch (recoverError) {
                console.error('恢复失败:', recoverError)
                return false
            }
        }
        
        return false
    }
}

// 导出默认错误处理器
export const defaultErrorHandler = new ErrorHandler()

export default {
    YCError,
    ErrorHandler,
    RetryHandler,
    RecoveryStrategy,
    ErrorLevel,
    ErrorCode,
    defaultErrorHandler
}

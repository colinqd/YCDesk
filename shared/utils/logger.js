/**
 * YCDesk 跨平台日志系统
 * 
 * 提供统一的日志格式和级别控制
 * 支持 Android、Windows (Electron)、Linux 等平台
 * 
 * @module shared/utils/logger
 */

/**
 * 日志级别枚举
 */
export const LogLevel = {
    /** 调试日志（最低级别） */
    DEBUG: 0,
    /** 信息日志 */
    INFO: 1,
    /** 警告日志 */
    WARN: 2,
    /** 错误日志 */
    ERROR: 3,
    /** 不输出任何日志 */
    NONE: 4
}

/**
 * 日志级别名称映射
 */
const LEVEL_NAMES = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR'
}

/**
 * 日志级别颜色（ANSI）
 */
const LEVEL_COLORS = {
    [LogLevel.DEBUG]: '\x1b[36m',  // 青色
    [LogLevel.INFO]: '\x1b[32m',   // 绿色
    [LogLevel.WARN]: '\x1b[33m',   // 黄色
    [LogLevel.ERROR]: '\x1b[31m'   // 红色
}

/**
 * 日志器类
 */
export class Logger {
    /**
     * 创建日志器实例
     * 
     * @param {Object} options - 配置选项
     * @param {number} [options.level=LogLevel.INFO] - 日志级别
     * @param {string} [options.platform='web'] - 平台类型：'web' | 'android' | 'electron-renderer' | 'electron-main'
     * @param {string} [options.prefix=''] - 日志前缀
     * @param {boolean} [options.enableTimestamp=true] - 是否启用时间戳
     * @param {boolean} [options.enableColors=true] - 是否启用颜色
     * @param {Function} [options.outputFn] - 自定义输出函数
     */
    constructor(options = {}) {
        this.level = options.level ?? LogLevel.INFO
        this.platform = options.platform || 'web'
        this.prefix = options.prefix || ''
        this.enableTimestamp = options.enableTimestamp ?? true
        this.enableColors = options.enableColors ?? true
        
        // 平台特定的输出函数
        this.outputFn = options.outputFn || this._getDefaultOutputFn()
    }
    
    /**
     * 设置日志级别
     * 
     * @param {number} level - 新的日志级别
     */
    setLevel(level) {
        this.level = level
    }
    
    /**
     * 获取当前日志级别
     * 
     * @returns {number} 日志级别
     */
    getLevel() {
        return this.level
    }
    
    /**
     * 调试日志
     * 
     * @param {string} message - 日志消息
     * @param  {...any} args - 附加参数
     */
    debug(message, ...args) {
        this._log(LogLevel.DEBUG, message, args)
    }
    
    /**
     * 信息日志
     * 
     * @param {string} message - 日志消息
     * @param  {...any} args - 附加参数
     */
    info(message, ...args) {
        this._log(LogLevel.INFO, message, args)
    }
    
    /**
     * 警告日志
     * 
     * @param {string} message - 日志消息
     * @param  {...any} args - 附加参数
     */
    warn(message, ...args) {
        this._log(LogLevel.WARN, message, args)
    }
    
    /**
     * 错误日志
     * 
     * @param {string} message - 日志消息
     * @param  {...any} args - 附加参数
     */
    error(message, ...args) {
        this._log(LogLevel.ERROR, message, args)
    }
    
    /**
     * 核心日志方法
     * 
     * @private
     * @param {number} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Array} args - 附加参数
     */
    _log(level, message, args) {
        // 检查日志级别
        if (level < this.level) {
            return
        }
        
        // 构建日志消息
        const formattedMessage = this._formatMessage(level, message)
        
        // 调用平台特定的输出
        this.outputFn(level, formattedMessage, args)
    }
    
    /**
     * 格式化日志消息
     * 
     * @private
     * @param {number} level - 日志级别
     * @param {string} message - 日志消息
     * @returns {string} 格式化后的消息
     */
    _formatMessage(level, message) {
        const timestamp = this.enableTimestamp ? new Date().toISOString() : ''
        const levelName = LEVEL_NAMES[level]
        
        let formattedMessage = ''
        
        // 添加时间戳
        if (this.enableTimestamp) {
            formattedMessage += `[${timestamp}] `
        }
        
        // 添加日志级别（带颜色）
        if (this.enableColors && this.platform !== 'web') {
            const color = LEVEL_COLORS[level]
            formattedMessage += `${color}[${levelName}]\x1b[0m`
        } else {
            formattedMessage += `[${levelName}]`
        }
        
        // 添加前缀
        if (this.prefix) {
            formattedMessage += ` [${this.prefix}]`
        }
        
        // 添加消息
        formattedMessage += ` ${message}`
        
        return formattedMessage
    }
    
    /**
     * 获取默认的日志输出函数
     * 
     * @private
     * @returns {Function} 输出函数
     */
    _getDefaultOutputFn() {
        switch (this.platform) {
            case 'android':
                return (level, message, args) => {
                    console.log(message, ...args)
                }
            
            case 'electron-renderer':
                return (level, message, args) => {
                    console.log(message, ...args)
                    // 可以发送到主进程写入文件
                    if (window.electronAPI?.log) {
                        window.electronAPI.log(level, message, ...args)
                    }
                }
            
            case 'electron-main':
                return (level, message, args) => {
                    console.log(message, ...args)
                }
            
            case 'node':
                return (level, message, args) => {
                    if (level === LogLevel.ERROR) {
                        console.error(message, ...args)
                    } else {
                        console.log(message, ...args)
                    }
                }
            
            default:
                return (level, message, args) => {
                    console.log(message, ...args)
                }
        }
    }
    
    /**
     * 创建子日志器（带前缀）
     * 
     * @param {string} prefix - 子日志器前缀
     * @returns {Logger} 新的日志器
     */
    createChild(prefix) {
        return new Logger({
            level: this.level,
            platform: this.platform,
            prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
            enableTimestamp: this.enableTimestamp,
            enableColors: this.enableColors,
            outputFn: this.outputFn
        })
    }
    
    /**
     * 克隆日志器
     * 
     * @returns {Logger} 克隆的日志器
     */
    clone() {
        return new Logger({
            level: this.level,
            platform: this.platform,
            prefix: this.prefix,
            enableTimestamp: this.enableTimestamp,
            enableColors: this.enableColors,
            outputFn: this.outputFn
        })
    }
}

/**
 * 创建日志器的工厂函数
 * 
 * @param {Object} options - 配置选项
 * @returns {Logger} 日志器实例
 */
export function createLogger(options = {}) {
    return new Logger(options)
}

/**
 * 默认日志器（全局使用）
 */
export const defaultLogger = new Logger({
    level: LogLevel.INFO,
    platform: 'web',
    prefix: 'YCDesk'
})

// 导出便捷方法
export const { debug, info, warn, error } = defaultLogger

export default Logger

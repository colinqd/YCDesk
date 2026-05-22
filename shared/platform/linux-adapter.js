/**
 * YCDesk Linux 平台适配层
 * 
 * 提供 Linux 特定的 API 实现
 * 适用于 Ubuntu、Debian、Fedora、CentOS 等发行版
 * 
 * @module shared/platform/linux-adapter
 */

import { createLogger, LogLevel } from '../utils/logger.js'
import { secureDeviceId } from '../utils/id-generator.js'

const log = createLogger({
    prefix: 'LinuxAdapter',
    level: LogLevel.DEBUG
})

/**
 * Linux 发行版检测
 */
function detectLinuxFlavor() {
    // 在 Electron 主进程中可以通过 os-release 文件检测
    // 这里使用简单的方法
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('ubuntu')) {
        return 'ubuntu'
    } else if (userAgent.includes('fedora')) {
        return 'fedora'
    } else if (userAgent.includes('debian')) {
        return 'debian'
    } else if (userAgent.includes('centos')) {
        return 'centos'
    } else if (userAgent.includes('arch')) {
        return 'arch'
    }
    
    return 'unknown'
}

/**
 * Linux 平台适配器
 */
export const platformAdapter = {
    /** 平台名称 */
    name: 'linux',
    
    /** Linux 发行版 */
    flavor: detectLinuxFlavor(),
    
    /**
     * 获取设备 ID
     * 
     * @returns {Promise<string>} 设备 ID
     */
    async getDeviceId() {
        try {
            // 使用 Electron API
            if (window.electronAPI && window.electronAPI.getDeviceId) {
                const deviceId = await window.electronAPI.getDeviceId()
                log.info('获取设备 ID:', deviceId)
                return deviceId
            }
            
            // 降级方案：从本地存储获取
            const storedId = localStorage.getItem('ycdesk_device_id')
            if (storedId) {
                return storedId
            }
            
            const deviceId = secureDeviceId('LNX')
            localStorage.setItem('ycdesk_device_id', deviceId)
            
            log.info('生成设备 ID:', deviceId)
            return deviceId
        } catch (error) {
            log.error('获取设备 ID 失败:', error)
            return 'LNX-UNKNOWN'
        }
    },
    
    /**
     * 获取存储
     * 
     * @param {string} key - 键
     * @returns {Promise<any>} 值
     */
    async getStorage(key) {
        try {
            return localStorage.getItem(key)
        } catch (error) {
            log.error('获取存储失败:', error)
            return null
        }
    },
    
    /**
     * 设置存储
     * 
     * @param {string} key - 键
     * @param {any} value - 值
     * @returns {Promise<void>}
     */
    async setStorage(key, value) {
        try {
            localStorage.setItem(key, value)
        } catch (error) {
            log.error('设置存储失败:', error)
        }
    },
    
    /**
     * 获取网络状态
     * 
     * @returns {Promise<Object>} 网络状态
     */
    async getNetworkStatus() {
        try {
            return {
                connected: navigator.onLine,
                type: navigator.onLine ? 'unknown' : 'none'
            }
        } catch (error) {
            log.error('获取网络状态失败:', error)
            return {
                connected: false,
                type: 'error'
            }
        }
    },
    
    /**
     * 执行输入（被控端）
     * 
     * @param {Object} input - 输入数据
     * @returns {Promise<void>}
     */
    async executeInput(input) {
        try {
            // 通过 IPC 发送到主进程执行
            // Linux 使用 nut-js 或 xdotool
            if (window.electronAPI && window.electronAPI.executeInput) {
                return await window.electronAPI.executeInput(input)
            } else {
                log.warn('electronAPI.executeInput 不可用')
            }
        } catch (error) {
            log.error('执行输入失败:', error)
            throw error
        }
    },
    
    /**
     * 显示 Toast 提示
     * 
     * @param {string} message - 提示消息
     * @param {number} [duration=3000] - 持续时间（毫秒）
     */
    showToast(message, duration = 3000) {
        try {
            // 使用 Electron 通知
            if (window.electronAPI && window.electronAPI.showToast) {
                window.electronAPI.showToast({
                    message: message,
                    duration: duration
                })
                return
            }
            
            // 使用系统通知（如果可用）
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(message, {
                    icon: '/icon.png',
                    requireInteraction: false
                })
                return
            }
            
            // 降级方案：Web 实现
            const toast = document.createElement('div')
            toast.className = 'toast show'
            toast.textContent = message
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                z-index: 9999;
            `
            document.body.appendChild(toast)
            
            setTimeout(() => {
                toast.classList.remove('show')
                setTimeout(() => toast.remove(), 300)
            }, duration)
        } catch (error) {
            log.error('显示 Toast 失败:', error)
        }
    },
    
    /**
     * 振动反馈（Linux 桌面端不支持）
     * 
     * @param {number|Array} pattern - 振动模式
     */
    vibrate(pattern = 50) {
        // Linux 桌面端不支持振动
        log.debug('Linux 不支持振动')
    },
    
    /**
     * 最小化窗口
     */
    minimizeWindow() {
        try {
            if (window.electronAPI && window.electronAPI.minimizeWindow) {
                window.electronAPI.minimizeWindow()
            }
        } catch (error) {
            log.error('最小化窗口失败:', error)
        }
    },
    
    /**
     * 最大化窗口
     */
    maximizeWindow() {
        try {
            if (window.electronAPI && window.electronAPI.maximizeWindow) {
                window.electronAPI.maximizeWindow()
            }
        } catch (error) {
            log.error('最大化窗口失败:', error)
        }
    },
    
    /**
     * 关闭窗口
     */
    closeWindow() {
        try {
            if (window.electronAPI && window.electronAPI.closeWindow) {
                window.electronAPI.closeWindow()
            }
        } catch (error) {
            log.error('关闭窗口失败:', error)
        }
    },
    
    /**
     * 获取屏幕源列表
     * 
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 屏幕源列表
     */
    async getSources(options = {}) {
        try {
            if (window.electronAPI && window.electronAPI.getSources) {
                return await window.electronAPI.getSources(options)
            }
            return []
        } catch (error) {
            log.error('获取屏幕源失败:', error)
            return []
        }
    },
    
    /**
     * 发送日志到主进程
     * 
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Array} args - 附加参数
     */
    log(level, message, ...args) {
        try {
            if (window.electronAPI && window.electronAPI.log) {
                window.electronAPI.log(level, message, ...args)
            }
        } catch (error) {
            console.error('发送日志失败:', error)
        }
    },
    
    /**
     * 获取 Linux 发行版信息
     * 
     * @returns {Object} 发行版信息
     */
    getDistributionInfo() {
        return {
            name: this.name,
            flavor: this.flavor,
            userAgent: navigator.userAgent
        }
    }
}

export default platformAdapter

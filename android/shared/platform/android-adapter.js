/**
 * YCDesk Android 平台适配层
 * 
 * 提供 Android 特定的 API 实现
 * 
 * @module shared/platform/android-adapter
 */

import { createLogger, LogLevel } from '../utils/logger.js'
import { secureDeviceId } from '../utils/id-generator.js'

const log = createLogger({
    prefix: 'AndroidAdapter',
    level: LogLevel.DEBUG
})

/**
 * Android 平台适配器
 */
export const platformAdapter = {
    /** 平台名称 */
    name: 'android',
    
    /**
     * 获取设备 ID
     * 
     * @returns {Promise<string>} 设备 ID
     */
    async getDeviceId() {
        try {
            // Android 端自己生成设备 ID
            const storedId = localStorage.getItem('ycdesk_device_id')
            if (storedId) {
                return storedId
            }
            
            const deviceId = secureDeviceId('AND')
            localStorage.setItem('ycdesk_device_id', deviceId)
            
            log.info('生成设备 ID:', deviceId)
            return deviceId
        } catch (error) {
            log.error('获取设备 ID 失败:', error)
            return 'AND-UNKNOWN'
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
            // 使用 Capacitor Network 插件（如果可用）
            if (window.Network && window.Network.getStatus) {
                const status = await Network.getStatus()
                return {
                    connected: status.connected,
                    type: status.connectionType || 'unknown'
                }
            }
            
            // 降级方案
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
            // 使用 Capacitor 插件执行输入
            // 需要实现 InputExecutor 插件
            if (window.InputExecutor) {
                switch (input.inputType) {
                    case 'mousemove':
                        return await InputExecutor.executeMouseMove({
                            x: input.x,
                            y: input.y,
                            screenWidth: input.maxX || 1920,
                            screenHeight: input.maxY || 1080
                        })
                    case 'mousedown':
                        return await InputExecutor.executeMouseDown({
                            x: input.x,
                            y: input.y,
                            button: input.button || 0,
                            screenWidth: input.maxX || 1920,
                            screenHeight: input.maxY || 1080
                        })
                    case 'mouseup':
                        return await InputExecutor.executeMouseUp({
                            x: input.x,
                            y: input.y,
                            button: input.button || 0,
                            screenWidth: input.maxX || 1920,
                            screenHeight: input.maxY || 1080
                        })
                    case 'wheel':
                        return await InputExecutor.executeMouseWheel({
                            deltaY: input.deltaY || 0,
                            deltaX: input.deltaX || 0
                        })
                    case 'keydown':
                        return await InputExecutor.executeKeyDown({
                            code: input.code,
                            key: input.key,
                            ctrlKey: input.ctrlKey,
                            shiftKey: input.shiftKey,
                            altKey: input.altKey,
                            metaKey: input.metaKey
                        })
                    case 'keyup':
                        return await InputExecutor.executeKeyUp({
                            code: input.code,
                            key: input.key,
                            ctrlKey: input.ctrlKey,
                            shiftKey: input.shiftKey,
                            altKey: input.altKey,
                            metaKey: input.metaKey
                        })
                }
            } else {
                log.warn('InputExecutor 插件不可用')
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
            // 使用 Capacitor Toast 插件（如果可用）
            if (window.Toast && window.Toast.show) {
                Toast.show({
                    text: message,
                    duration: duration === 3000 ? 'LONG' : 'SHORT'
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
     * 振动反馈
     * 
     * @param {number|Array} pattern - 振动模式
     */
    vibrate(pattern = 50) {
        try {
            // 使用 Navigator Vibration API
            if (navigator.vibrate) {
                navigator.vibrate(pattern)
            }
        } catch (error) {
            log.error('振动失败:', error)
        }
    },
    
    /**
     * 退出应用
     */
    exitApp() {
        try {
            // 使用 Capacitor App 插件
            if (window.App && window.App.exitApp) {
                App.exitApp()
            }
        } catch (error) {
            log.error('退出应用失败:', error)
        }
    },
    
    /**
     * 最小化应用
     */
    minimizeApp() {
        try {
            // 使用 Capacitor App 插件
            if (window.App && window.App.minimize) {
                App.minimize()
            }
        } catch (error) {
            log.error('最小化应用失败:', error)
        }
    },

    /**
     * 开机自启动配置
     *
     * @param {boolean} enabled - 是否启用
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async autoStart(enabled) {
        try {
            if (window.AutoStart && window.AutoStart.setEnabled) {
                await AutoStart.setEnabled({ enabled })
                log.info('开机自启动:', enabled ? '已启用' : '已禁用')
                return { success: true }
            }
            log.warn('AutoStart 插件不可用')
            return { success: false, error: 'AutoStart 插件不可用' }
        } catch (error) {
            log.error('配置开机自启动失败:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * 输入处理器（平台特定输入实现）
     *
     * @returns {{ type: string, start: Function, stop: Function }}
     */
    get inputHandler() {
        return {
            type: 'AccessibilityService',
            start() {
                log.info('启动 AccessibilityService 输入处理器')
                // Android 通过 AccessibilityService 实现输入
            },
            stop() {
                log.info('停止 AccessibilityService 输入处理器')
            }
        }
    }
}

export default platformAdapter

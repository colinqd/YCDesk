/**
 * YCDesk 平台适配层统一导出
 * 
 * @module shared/platform/index
 */

// Android 适配器
export { platformAdapter as androidAdapter } from './android-adapter.js'

// Electron 适配器
export { platformAdapter as electronAdapter } from './electron-adapter.js'

// Linux 适配器
export { platformAdapter as linuxAdapter } from './linux-adapter.js'

import { secureDeviceId } from '../utils/id-generator.js'

/**
 * 平台枚举
 */
export const Platform = {
    /** Web 浏览器 */
    WEB: 'web',
    /** Android */
    ANDROID: 'android',
    /** Electron (Windows/Linux/macOS) */
    ELECTRON: 'electron',
    /** Linux (Electron) */
    LINUX: 'linux'
}

/**
 * 获取当前平台
 * 
 * @returns {string} 平台名称
 */
export function getCurrentPlatform() {
    // 检查是否在 Electron 中
    if (window.electronAPI) {
        // 检测操作系统平台
        const userAgent = navigator.userAgent.toLowerCase()
        if (userAgent.includes('linux')) {
            return Platform.LINUX
        } else if (userAgent.includes('win')) {
            return Platform.ELECTRON
        } else if (userAgent.includes('mac')) {
            return Platform.ELECTRON
        }
        // 默认返回 electron
        return Platform.ELECTRON
    }
    
    // 检查是否在 Android WebView 中
    const ua = navigator.userAgent || navigator.vendor || window.opera
    
    if (/android/i.test(ua)) {
        return Platform.ANDROID
    }
    
    // 默认 Web
    return Platform.WEB
}

/**
 * 获取平台适配器
 * 
 * @returns {Object} 平台适配器
 */
export function getPlatformAdapter() {
    const platform = getCurrentPlatform()
    
    switch (platform) {
        case Platform.ANDROID:
            return androidAdapter
        case Platform.LINUX:
            return linuxAdapter
        case Platform.ELECTRON:
            return electronAdapter
        default:
            // Web 平台返回默认实现
            return {
                name: Platform.WEB,
                getDeviceId: async () => secureDeviceId('WEB'),
                getStorage: async (key) => localStorage.getItem(key),
                setStorage: async (key, value) => localStorage.setItem(key, value),
                getNetworkStatus: async () => ({
                    connected: navigator.onLine,
                    type: navigator.onLine ? 'unknown' : 'none'
                }),
                executeInput: async () => {},
                showToast: () => {},
                vibrate: () => {}
            }
    }
}

export default {
    Platform,
    getCurrentPlatform,
    getPlatformAdapter,
    androidAdapter,
    electronAdapter,
    linuxAdapter
}

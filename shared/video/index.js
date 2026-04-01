/**
 * YCDesk 视频模块统一导出
 * 
 * @module shared/video/index
 */

// 捕获模块
export { VideoCapture } from './capture/video-capture.js'
export { BrowserCapture } from './capture/browser-capture.js'
export { ElectronCapture } from './capture/electron-capture.js'

// 传输模块
export { MediaTransport } from './transport/media-transport.js'

// 视频管理器（待创建）
// export { VideoManager } from './video-manager.js'

/**
 * 视频传输模式枚举
 */
export const VideoMode = {
    /** 原生 WebRTC 流模式 */
    WEBRTC: 'webrtc',
    /** 纯差异传输模式 */
    DIFF: 'diff',
    /** 混合模式（WebRTC + 差异） */
    HYBRID: 'hybrid'
}

/**
 * 平台枚举
 */
export const Platform = {
    /** Web 浏览器 */
    WEB: 'web',
    /** Electron */
    ELECTRON: 'electron',
    /** Android (Capacitor) */
    ANDROID: 'android'
}

export default {
    VideoCapture: VideoCapture,
    BrowserCapture: BrowserCapture,
    ElectronCapture: ElectronCapture,
    MediaTransport: MediaTransport,
    VideoMode: VideoMode,
    Platform: Platform
}

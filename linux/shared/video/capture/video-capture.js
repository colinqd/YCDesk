/**
 * YCDesk 视频捕获抽象层
 * 
 * 提供统一的视频捕获接口，支持不同平台（浏览器、Electron）
 * 用于远程桌面屏幕共享功能
 * 
 * @module shared/video/capture/video-capture
 */

/**
 * 视频捕获基类
 * 
 * @abstract
 * @class VideoCapture
 */
export class VideoCapture {
    /**
     * 创建视频捕获实例
     * 
     * @param {Object} options - 配置选项
     * @param {number} [options.maxWidth=1920] - 最大宽度
     * @param {number} [options.maxHeight=1080] - 最大高度
     * @param {number} [options.maxFrameRate=30] - 最大帧率
     * @param {Function} [options.onFrame] - 帧回调函数
     * @param {Function} [options.onError] - 错误回调函数
     */
    constructor(options = {}) {
        if (new.target === VideoCapture) {
            throw new Error('VideoCapture 是抽象类，不能直接实例化')
        }
        
        this.options = {
            maxWidth: options.maxWidth || 1920,
            maxHeight: options.maxHeight || 1080,
            maxFrameRate: options.maxFrameRate || 30,
            ...options
        }
        
        this.stream = null
        this.onFrame = options.onFrame || null
        this.onError = options.onError || null
    }
    
    /**
     * 开始捕获屏幕
     * 
     * @abstract
     * @returns {Promise<MediaStream>} 媒体流
     * @throws {Error} 子类必须实现此方法
     */
    async start() {
        throw new Error('子类必须实现 start 方法')
    }
    
    /**
     * 停止捕获
     * 
     * @returns {void}
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop())
            this.stream = null
        }
    }
    
    /**
     * 获取媒体流
     * 
     * @returns {MediaStream|null} 媒体流对象
     */
    getStream() {
        return this.stream
    }
    
    /**
     * 获取视频轨道
     * 
     * @returns {MediaStreamTrack|null} 视频轨道
     */
    getVideoTrack() {
        return this.stream?.getVideoTracks()[0] || null
    }
    
    /**
     * 获取音频轨道
     * 
     * @returns {MediaStreamTrack|null} 音频轨道
     */
    getAudioTrack() {
        return this.stream?.getAudioTracks()[0] || null
    }
    
    /**
     * 获取视频尺寸
     * 
     * @returns {Object} 视频尺寸 {width, height}
     */
    getVideoSize() {
        const track = this.getVideoTrack()
        if (!track) {
            return { width: 0, height: 0 }
        }
        
        const settings = track.getSettings()
        return {
            width: settings.width || 0,
            height: settings.height || 0
        }
    }
    
    /**
     * 获取视频设置
     * 
     * @returns {Object} 视频设置
     */
    getVideoSettings() {
        const track = this.getVideoTrack()
        if (!track) {
            return {}
        }
        
        return track.getSettings()
    }
    
    /**
     * 监听流结束事件
     * 
     * @param {Function} callback - 回调函数
     */
    onStreamEnded(callback) {
        const videoTrack = this.getVideoTrack()
        if (videoTrack) {
            videoTrack.addEventListener('ended', () => {
                this.stop()
                if (callback) {
                    callback()
                }
            })
        }
    }
    
    /**
     * 检查是否正在捕获
     * 
     * @returns {boolean} 是否正在捕获
     */
    isCapturing() {
        return this.stream !== null && this.stream.active
    }
}

export default VideoCapture

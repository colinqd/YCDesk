/**
 * YCDesk 浏览器环境屏幕捕获
 * 
 * 使用 Web 标准 getDisplayMedia API 实现屏幕捕获
 * 适用于 Android 端和普通浏览器环境
 * 
 * @module shared/video/capture/browser-capture
 */

import { VideoCapture } from './video-capture.js'

/**
 * 浏览器屏幕捕获类
 * 
 * @extends VideoCapture
 */
export class BrowserCapture extends VideoCapture {
    /**
     * 创建浏览器捕获实例
     * 
     * @param {Object} options - 配置选项
     * @param {number} [options.maxWidth=1920] - 最大宽度
     * @param {number} [options.maxHeight=1080] - 最大高度
     * @param {number} [options.maxFrameRate=30] - 最大帧率
     * @param {boolean} [options.includeAudio=false] - 是否包含音频
     * @param {boolean} [options.selfBrowserSurface='include'] - 是否包含当前浏览器标签页
     * @param {boolean} [options.systemAudio='exclude'] - 是否包含系统音频
     */
    constructor(options = {}) {
        super(options)
        
        this.options = {
            includeAudio: options.includeAudio || false,
            selfBrowserSurface: options.selfBrowserSurface || 'include',
            systemAudio: options.systemAudio || 'exclude',
            ...this.options
        }
    }
    
    /**
     * 开始捕获屏幕
     * 
     * @returns {Promise<MediaStream>} 媒体流
     * @throws {Error} 用户拒绝或 API 不支持
     */
    async start() {
        try {
            // 检查 API 支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error('当前浏览器不支持 getDisplayMedia API')
            }
            
            // 构建视频约束
            const videoConstraints = {
                width: { ideal: this.options.maxWidth },
                height: { ideal: this.options.maxHeight },
                frameRate: { ideal: this.options.maxFrameRate }
            }
            
            // 构建媒体约束
            const constraints = {
                video: videoConstraints
            }
            
            // 添加音频约束（如果启用）
            if (this.options.includeAudio) {
                constraints.audio = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            }
            
            // 添加浏览器特定的约束
            if (this.options.selfBrowserSurface) {
                constraints.video.selfBrowserSurface = this.options.selfBrowserSurface
            }
            
            if (this.options.systemAudio) {
                constraints.video.systemAudio = this.options.systemAudio
            }
            
            // 获取媒体流
            this.stream = await navigator.mediaDevices.getDisplayMedia(constraints)
            
            if (!this.stream || this.stream.getVideoTracks().length === 0) {
                throw new Error('未能获取视频轨道')
            }
            
            // 监听流结束事件
            this.onStreamEnded(() => {
                if (this.onError) {
                    this.onError(new Error('用户停止了屏幕共享'))
                }
            })
            
            // 监听轨道结束事件
            const videoTrack = this.getVideoTrack()
            if (videoTrack) {
                videoTrack.addEventListener('ended', () => {
                    this.stop()
                })
            }
            
            return this.stream
        } catch (error) {
            // 用户拒绝的特定错误处理
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                const userFriendlyError = new Error('用户拒绝了屏幕共享权限')
                userFriendlyError.code = 'PERMISSION_DENIED'
                
                if (this.onError) {
                    this.onError(userFriendlyError)
                }
                throw userFriendlyError
            }
            
            // 其他错误
            if (this.onError) {
                this.onError(error)
            }
            throw error
        }
    }
    
    /**
     * 请求帧回调
     * 
     * @param {Function} callback - 帧回调函数
     * @returns {void}
     */
    requestFrame(callback) {
        const videoTrack = this.getVideoTrack()
        if (!videoTrack) {
            throw new Error('视频轨道不存在')
        }
        
        // 使用 ImageCapture API 获取帧（如果支持）
        if ('ImageCapture' in window) {
            const imageCapture = new ImageCapture(videoTrack)
            
            const captureFrame = async () => {
                if (!this.isCapturing()) return
                
                try {
                    const bitmap = await imageCapture.grabFrame()
                    if (callback) {
                        callback(bitmap)
                    }
                } catch (error) {
                    if (this.onError) {
                        this.onError(error)
                    }
                }
                
                requestAnimationFrame(captureFrame)
            }
            
            captureFrame()
        } else {
            // 降级方案：使用 video 元素
            const video = document.createElement('video')
            video.srcObject = this.stream
            video.play()
            
            const captureFrame = () => {
                if (!this.isCapturing()) return
                
                if (callback) {
                    callback(video)
                }
                
                requestAnimationFrame(captureFrame)
            }
            
            captureFrame()
        }
    }
    
    /**
     * 获取可用的显示设备列表
     * 
     * @returns {Promise<Array>} 显示设备列表
     */
    static async getDisplayDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            return devices.filter(device => device.kind === 'videoinput')
        } catch (error) {
            console.error('获取显示设备列表失败:', error)
            return []
        }
    }
    
    /**
     * 检查是否支持屏幕共享
     * 
     * @returns {boolean} 是否支持
     */
    static isSupported() {
        return !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getDisplayMedia
        )
    }
}

export default BrowserCapture

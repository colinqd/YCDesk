/**
 * YCDesk Electron 屏幕捕获
 * 
 * 使用 Electron desktopCapturer API 实现屏幕捕获
 * 适用于 Windows、Linux、macOS 桌面端
 * 
 * @module shared/video/capture/electron-capture
 */

import { VideoCapture } from './video-capture.js'

/**
 * Electron 屏幕捕获类
 * 
 * @extends VideoCapture
 */
export class ElectronCapture extends VideoCapture {
    /**
     * 创建 Electron 捕获实例
     * 
     * @param {Object} options - 配置选项
     * @param {number} [options.maxWidth=1920] - 最大宽度
     * @param {number} [options.maxHeight=1080] - 最大高度
     * @param {number} [options.maxFrameRate=30] - 最大帧率
     * @param {string|null} [options.sourceId=null] - 指定的屏幕源 ID
     * @param {string} [options.sourceType='screen'] - 源类型：'screen' | 'window'
     * @param {number} [options.thumbnailSize=320] - 缩略图尺寸
     */
    constructor(options = {}) {
        super(options)
        
        this.options = {
            sourceId: options.sourceId || null,
            sourceType: options.sourceType || 'screen',
            thumbnailSize: options.thumbnailSize || 320,
            fetchWindowIcons: options.fetchWindowIcons || true,
            ...this.options
        }
        
        this.availableSources = []
    }
    
    /**
     * 开始捕获屏幕
     * 
     * @returns {Promise<MediaStream>} 媒体流
     * @throws {Error} 没有找到可用的屏幕源或捕获失败
     */
    async start() {
        try {
            // 检查 Electron API
            if (!window.electronAPI) {
                throw new Error('Electron API 不可用')
            }
            
            // 获取屏幕源
            const sources = await this._getSources()
            
            if (sources.length === 0) {
                throw new Error('没有找到可用的屏幕源')
            }
            
            // 选择源
            const sourceId = this.options.sourceId || this._selectSource(sources)
            
            if (!sourceId) {
                throw new Error('无法选择屏幕源')
            }
            
            // 使用 getUserMedia 捕获屏幕
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxWidth: this.options.maxWidth,
                        maxHeight: this.options.maxHeight,
                        maxFrameRate: this.options.maxFrameRate
                    }
                },
                audio: false
            })
            
            if (!this.stream || this.stream.getVideoTracks().length === 0) {
                throw new Error('未能获取视频轨道')
            }
            
            // 监听流结束事件
            this.onStreamEnded(() => {
                if (this.onError) {
                    this.onError(new Error('屏幕共享已停止'))
                }
            })
            
            return this.stream
        } catch (error) {
            if (this.onError) {
                this.onError(error)
            }
            throw error
        }
    }
    
    /**
     * 获取可用的屏幕源列表
     * 
     * @returns {Promise<Array>} 屏幕源列表
     */
    async _getSources() {
        try {
            const sources = await window.electronAPI.getSources({
                types: [this.options.sourceType],
                thumbnailSize: {
                    width: this.options.thumbnailSize,
                    height: this.options.thumbnailSize
                },
                fetchWindowIcons: this.options.fetchWindowIcons
            })
            
            this.availableSources = sources
            return sources
        } catch (error) {
            console.error('获取屏幕源失败:', error)
            return []
        }
    }
    
    /**
     * 选择屏幕源
     * 
     * @param {Array} sources - 屏幕源列表
     * @returns {string|null} 选中的源 ID
     */
    _selectSource(sources) {
        // 优先选择屏幕（而不是窗口）
        const screen = sources.find(source => 
            source.id.startsWith('screen:')
        )
        
        if (screen) {
            return screen.id
        }
        
        // 如果没有屏幕，返回第一个可用源
        return sources[0]?.id || null
    }
    
    /**
     * 获取可用的屏幕源
     * 
     * @returns {Promise<Array>} 屏幕源列表，包含 id、name、thumbnail 等信息
     */
    async getAvailableSources() {
        return await this._getSources()
    }
    
    /**
     * 设置屏幕源
     * 
     * @param {string} sourceId - 屏幕源 ID
     * @returns {void}
     */
    setSource(sourceId) {
        this.options.sourceId = sourceId
    }
    
    /**
     * 切换到指定屏幕源
     * 
     * @param {string} sourceId - 屏幕源 ID
     * @returns {Promise<void>}
     */
    async switchSource(sourceId) {
        // 停止当前捕获
        this.stop()
        
        // 设置新源
        this.setSource(sourceId)
        
        // 重新开始捕获
        await this.start()
    }
    
    /**
     * 获取当前屏幕源信息
     * 
     * @returns {Object|null} 当前屏幕源信息
     */
    getCurrentSource() {
        const currentId = this.options.sourceId
        return this.availableSources.find(source => source.id === currentId) || null
    }
    
    /**
     * 获取主屏幕源
     * 
     * @returns {Promise<string|null>} 主屏幕源 ID
     */
    async getPrimaryScreen() {
        const sources = await this._getSources()
        const screen = sources.find(source => 
            source.id.startsWith('screen:') && 
            source.name.toLowerCase().includes('screen')
        )
        
        return screen?.id || null
    }
    
    /**
     * 获取所有屏幕（排除窗口）
     * 
     * @returns {Promise<Array>} 屏幕列表
     */
    async getAllScreens() {
        const sources = await this._getSources()
        return sources.filter(source => source.id.startsWith('screen:'))
    }
    
    /**
     * 获取所有窗口
     * 
     * @returns {Promise<Array>} 窗口列表
     */
    async getAllWindows() {
        const sources = await this._getSources()
        return sources.filter(source => source.id.startsWith('window:'))
    }
}

export default ElectronCapture

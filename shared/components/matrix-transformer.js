/**
 * YCDesk 矩阵变换器 - 跨平台共享版本
 * 
 * 处理坐标变换、缩放、平移等操作
 * 用于远程桌面屏幕交互的坐标映射
 * 
 * 坐标系统说明:
 * - Container 坐标：浏览器容器元素的坐标（相对于页面）
 * - Display 坐标：显示区域的坐标（相对于容器）
 * - Remote 坐标：远程屏幕的坐标（像素值）
 * - View 坐标：视图坐标（经过缩放和平移）
 * - Video 坐标：视频元素坐标
 * 
 * @module shared/components/matrix-transformer
 */

/**
 * 矩阵变换器类
 */
class MatrixTransformer {
    /**
     * 创建矩阵变换器实例
     * 
     * @param {Object} options - 配置选项
     * @param {Object} [options.logger] - 日志对象（可选）
     */
    constructor(options = {}) {
        this.scale = 1.0
        this.panX = 0
        this.panY = 0
        
        this.screenWidth = 0
        this.screenHeight = 0
        this.remoteScreenWidth = 1920
        this.remoteScreenHeight = 1080
        
        this.displayX = 0
        this.displayY = 0
        this.displayWidth = 0
        this.displayHeight = 0
        
        this.originalWidth = 0
        this.originalHeight = 0
        this.originalLeft = 0
        this.originalTop = 0
        
        this.scaleFactor = 1
        this.workArea = null
        this.videoWidth = 0
        this.videoHeight = 0
        
        this.centerX = 0
        this.centerY = 0
        this.elementWidth = 0
        this.elementHeight = 0
        
        this._matrix = null
        this._inverseMatrix = null
        this._matrixDirty = true
        
        this.logger = options.logger || null
    }
    
    /**
     * 设置本地屏幕尺寸
     * 
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
    setScreenSize(width, height) {
        this.screenWidth = width
        this.screenHeight = height
        this._matrixDirty = true
        this._updateDisplayRect()
    }
    
    setElementSize(width, height) {
        this.elementWidth = width
        this.elementHeight = height
        this._matrixDirty = true
    }
    
    calculateCenterPosition() {
        if (this.screenWidth === 0 || this.screenHeight === 0 || 
            this.elementWidth === 0 || this.elementHeight === 0) {
            return { x: 0, y: 0 }
        }
        
        const centerX = (this.screenWidth - this.elementWidth) / 2
        const centerY = (this.screenHeight - this.elementHeight) / 2
        
        this.centerX = centerX
        this.centerY = centerY
        
        this._log('calculateCenterPosition', {
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            elementWidth: this.elementWidth,
            elementHeight: this.elementHeight,
            center: { x: centerX, y: centerY }
        })
        
        return { x: centerX, y: centerY }
    }
    
    /**
     * 设置远程屏幕尺寸
     * 
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
    setRemoteScreenSize(width, height) {
        this.remoteScreenWidth = width
        this.remoteScreenHeight = height
        this._updateDisplayRect()
    }
    
    /**
     * 设置视频尺寸
     * 
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
    setVideoSize(width, height) {
        this.videoWidth = width
        this.videoHeight = height
    }
    
    /**
     * 更新显示区域矩形
     * 
     * @private
     */
    _updateDisplayRect() {
        this._log('_updateDisplayRect', {
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            remoteScreenWidth: this.remoteScreenWidth,
            remoteScreenHeight: this.remoteScreenHeight
        })
        
        // 检查屏幕尺寸是否为 0
        if (this.screenWidth === 0 || this.screenHeight === 0) {
            this.displayX = 0
            this.displayY = 0
            this.displayWidth = 0
            this.displayHeight = 0
            this._log('_updateDisplayRect', '屏幕尺寸为 0，跳过计算')
            return
        }
        
        // 检查远程屏幕尺寸是否为 0
        if (this.remoteScreenWidth === 0 || this.remoteScreenHeight === 0) {
            this.displayX = 0
            this.displayY = 0
            this.displayWidth = this.screenWidth
            this.displayHeight = this.screenHeight
            this._log('_updateDisplayRect', '远程屏幕尺寸为 0，使用屏幕尺寸')
            return
        }
        
        // 计算宽高比
        const screenAspect = this.screenWidth / this.screenHeight
        const remoteAspect = this.remoteScreenWidth / this.remoteScreenHeight
        
        // 根据宽高比计算显示区域（保持比例）
        if (remoteAspect > screenAspect) {
            // 远程屏幕更宽，以宽度为基准
            this.displayWidth = this.screenWidth
            this.displayHeight = this.screenWidth / remoteAspect
            this.displayX = 0
            this.displayY = (this.screenHeight - this.displayHeight) / 2
        } else {
            // 远程屏幕更高，以高度为基准
            this.displayHeight = this.screenHeight
            this.displayWidth = this.screenHeight * remoteAspect
            this.displayX = (this.screenWidth - this.displayWidth) / 2
            this.displayY = 0
        }
        
        this._log('_updateDisplayRect', {
            displayWidth: this.displayWidth,
            displayHeight: this.displayHeight,
            displayX: this.displayX,
            displayY: this.displayY
        })
    }
    
    /**
     * 更新矩阵
     * 
     * @private
     */
    _updateMatrices() {
        if (!this._matrixDirty) return
        
        // 构建变换矩阵
        this._matrix = {
            a: this.scale,
            b: 0,
            c: this.panX,
            d: 0,
            e: this.scale,
            f: this.panY
        }
        
        // 构建逆变换矩阵
        const invScale = 1.0 / this.scale
        this._inverseMatrix = {
            a: invScale,
            b: 0,
            c: -this.panX * invScale,
            d: 0,
            e: invScale,
            f: -this.panY * invScale
        }
        
        this._matrixDirty = false
    }
    
    /**
     * Container 坐标转 Display 坐标
     * 
     * @param {number} containerX - Container X 坐标
     * @param {number} containerY - Container Y 坐标
     * @returns {Object} Display 坐标 {x, y}
     */
    containerToDisplay(containerX, containerY) {
        return {
            x: containerX - this.displayX,
            y: containerY - this.displayY
        }
    }
    
    /**
     * Display 坐标转 Container 坐标
     * 
     * @param {number} displayX - Display X 坐标
     * @param {number} displayY - Display Y 坐标
     * @returns {Object} Container 坐标 {x, y}
     */
    displayToContainer(displayX, displayY) {
        return {
            x: displayX + this.displayX,
            y: displayY + this.displayY
        }
    }
    
    /**
     * Display 坐标转 Remote 归一化坐标 (0~1)
     * 
     * @param {number} displayX - Display X 坐标
     * @param {number} displayY - Display Y 坐标
     * @returns {Object|null} 归一化坐标 {x, y}，范围 0~1，失败返回 null
     */
    displayToRemote(displayX, displayY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null
        }
        
        const normalizedX = displayX / this.displayWidth
        const normalizedY = displayY / this.displayHeight
        
        return { x: normalizedX, y: normalizedY }
    }
    
    /**
     * Container 坐标转 Remote 坐标（主要方法）
     * 
     * @param {number} containerX - Container X 坐标
     * @param {number} containerY - Container Y 坐标
     * @returns {Object|null} Remote 坐标 {x, y}，失败返回 null
     */
    containerToRemote(containerX, containerY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null
        }
        
        // 转换为 Display 坐标
        const display = this.containerToDisplay(containerX, containerY)
        
        // 检查是否超出显示区域
        if (display.x < 0 || display.x > this.displayWidth ||
            display.y < 0 || display.y > this.displayHeight) {
            return null
        }
        
        // 应用缩放和平移变换
        const centerX = this.displayWidth / 2
        const centerY = this.displayHeight / 2
        
        const transformedX = centerX + (display.x - centerX - this.panX) / this.scale
        const transformedY = centerY + (display.y - centerY - this.panY) / this.scale
        
        // 转换为 Remote 坐标
        return this.displayToRemote(transformedX, transformedY)
    }
    
    /**
     * View 坐标转 Video 坐标
     * 
     * @param {number} viewX - View X 坐标
     * @param {number} viewY - View Y 坐标
     * @returns {Object} Video 坐标 {x, y}
     */
    viewToVideo(viewX, viewY) {
        this._updateMatrices()
        const m = this._inverseMatrix
        return {
            x: m.a * viewX + m.b * viewY + m.c,
            y: m.d * viewX + m.e * viewY + m.f
        }
    }
    
    /**
     * Video 坐标转 View 坐标
     * 
     * @param {number} videoX - Video X 坐标
     * @param {number} videoY - Video Y 坐标
     * @returns {Object} View 坐标 {x, y}
     */
    videoToView(videoX, videoY) {
        this._updateMatrices()
        const m = this._matrix
        return {
            x: m.a * videoX + m.b * videoY + m.c,
            y: m.d * videoX + m.e * videoY + m.f
        }
    }
    
    /**
     * Video 坐标转 Remote 坐标
     * 
     * @param {number} videoX - Video X 坐标
     * @param {number} videoY - Video Y 坐标
     * @returns {Object} Remote 坐标 {x, y}
     */
    videoToRemote(videoX, videoY) {
        if (this.videoWidth === 0 || this.videoHeight === 0) {
            return { x: 0, y: 0 }
        }
        return {
            x: (videoX / this.videoWidth) * this.remoteScreenWidth,
            y: (videoY / this.videoHeight) * this.remoteScreenHeight
        }
    }
    
    /**
     * Remote 坐标转 Video 坐标
     * 
     * @param {number} remoteX - Remote X 坐标
     * @param {number} remoteY - Remote Y 坐标
     * @returns {Object} Video 坐标 {x, y}
     */
    remoteToVideo(remoteX, remoteY) {
        return {
            x: (remoteX / this.remoteScreenWidth) * this.videoWidth,
            y: (remoteY / this.remoteScreenHeight) * this.videoHeight
        }
    }
    
    /**
     * View 坐标转 Remote 坐标
     * 
     * @param {number} viewX - View X 坐标
     * @param {number} viewY - View Y 坐标
     * @returns {Object} Remote 坐标 {x, y}
     */
    viewToRemote(viewX, viewY) {
        const video = this.viewToVideo(viewX, viewY)
        return this.videoToRemote(video.x, video.y)
    }
    
    /**
     * Remote 坐标转 View 坐标
     * 
     * @param {number} remoteX - Remote X 坐标
     * @param {number} remoteY - Remote Y 坐标
     * @returns {Object} View 坐标 {x, y}
     */
    remoteToView(remoteX, remoteY) {
        const video = this.remoteToVideo(remoteX, remoteY)
        return this.videoToView(video.x, video.y)
    }
    
    /**
     * 更新缩放比例
     * 
     * @param {number} newScale - 新的缩放比例
     * @param {number} mouseX - 鼠标 X 坐标
     * @param {number} mouseY - 鼠标 Y 坐标
     */
    updateScale(newScale, mouseX, mouseY) {
        this._log('updateScale 开始', {
            newScale: newScale,
            mouseX: mouseX,
            mouseY: mouseY,
            currentScale: this.scale,
            elementWidth: this.elementWidth,
            elementHeight: this.elementHeight,
            centerX: this.centerX,
            centerY: this.centerY,
            panX: this.panX,
            panY: this.panY
        })
        
        if (this.elementWidth === 0 || this.elementHeight === 0) {
            this.scale = Math.max(0.5, Math.min(3.0, newScale))
            this._matrixDirty = true
            this._log('updateScale: 元素尺寸未设置，直接缩放', { scale: this.scale })
            return
        }
        
        const oldScale = this.scale
        const clampedScale = Math.max(0.5, Math.min(3.0, newScale))
        
        if (clampedScale === oldScale) {
            this._log('updateScale: 缩放值未变化', { oldScale, newScale: clampedScale })
            return
        }
        
        const currentX = this.centerX + this.panX
        const currentY = this.centerY + this.panY
        
        const mouseOffsetX = mouseX - currentX
        const mouseOffsetY = mouseY - currentY
        
        const scaleRatio = clampedScale / oldScale
        
        const newMouseOffsetX = mouseOffsetX * scaleRatio
        const newMouseOffsetY = mouseOffsetY * scaleRatio
        
        const newX = mouseX - newMouseOffsetX
        const newY = mouseY - newMouseOffsetY
        
        this.panX = newX - this.centerX
        this.panY = newY - this.centerY
        this.scale = clampedScale
        
        this._matrixDirty = true
        this.clampPan()
        
        this._log('updateScale 完成', {
            oldScale,
            newScale: this.scale,
            panX: this.panX,
            panY: this.panY,
            newX,
            newY,
            currentX,
            currentY
        })
    }
    
    /**
     * 更新平移量
     * 
     * @param {number} deltaX - X 方向平移量
     * @param {number} deltaY - Y 方向平移量
     */
    updatePan(deltaX, deltaY) {
        this.panX += deltaX
        this.panY += deltaY
        this._matrixDirty = true
        this.clampPan()
    }
    
    /**
     * 限制平移范围
     */
    clampPan() {
        if (this.screenWidth === 0 || this.screenHeight === 0) {
            this._matrixDirty = true
            return
        }
        
        const effectiveWidth = this.displayWidth > 0 ? this.displayWidth : (this.elementWidth > 0 ? this.elementWidth : this.screenWidth)
        const effectiveHeight = this.displayHeight > 0 ? this.displayHeight : (this.elementHeight > 0 ? this.elementHeight : this.screenHeight)
        
        const scaledWidth = effectiveWidth * this.scale
        const scaledHeight = effectiveHeight * this.scale
        
        const minPanX = -this.centerX
        const maxPanX = this.screenWidth - this.centerX - scaledWidth
        const minPanY = -this.centerY
        const maxPanY = this.screenHeight - this.centerY - scaledHeight
        
        this.panX = Math.max(Math.min(minPanX, maxPanX), Math.min(Math.max(minPanX, maxPanX), this.panX))
        this.panY = Math.max(Math.min(minPanY, maxPanY), Math.min(Math.max(minPanY, maxPanY), this.panY))
        
        this._matrixDirty = true
    }
    
    /**
     * 应用 CSS transform 变换到元素（缩放和平移）
     * 拖动后使用绝对定位，不再居中
     * 
     * @param {HTMLElement} element - 目标元素
     */
    applyTransform(element) {
        if (!element) return
        
        if (this.elementWidth === 0 || this.elementHeight === 0) {
            const rect = element.getBoundingClientRect()
            this.elementWidth = rect.width
            this.elementHeight = rect.height
        }
        
        if (this.centerX === 0 && this.centerY === 0) {
            this.calculateCenterPosition()
        }
        
        const currentX = this.centerX + this.panX
        const currentY = this.centerY + this.panY
        
        element.style.left = currentX + 'px'
        element.style.top = currentY + 'px'
        element.style.transform = `scale(${this.scale})`
        element.style.transformOrigin = '0 0'
        
        this._log('applyTransform', {
            center: { x: this.centerX, y: this.centerY },
            pan: { x: this.panX, y: this.panY },
            position: { x: currentX, y: currentY },
            scale: this.scale
        })
    }
    
    resetView() {
        this.scale = 1.0
        this.panX = 0
        this.panY = 0
        this._matrixDirty = true
        this.calculateCenterPosition()
    }
    
    /**
     * 应用容器尺寸
     * 
     * @param {HTMLElement} containerElement - 容器元素
     * @param {HTMLElement} [wrapperElement] - 包装元素（可选）
     */
    applyContainerSize(containerElement, wrapperElement) {
        this._log('applyContainerSize', {
            displayWidth: this.displayWidth,
            displayHeight: this.displayHeight,
            displayX: this.displayX,
            displayY: this.displayY
        })
        
        if (this.displayWidth > 0 && this.displayHeight > 0) {
            containerElement.style.width = this.displayWidth + 'px'
            containerElement.style.height = this.displayHeight + 'px'
            containerElement.style.left = this.displayX + 'px'
            containerElement.style.top = this.displayY + 'px'
            
            this._log('applyContainerSize', 
                `设置容器尺寸 ${this.displayWidth}x${this.displayHeight}, 位置 (${this.displayX}, ${this.displayY})`)
            
            if (wrapperElement) {
                let wrapperWidth = this.displayWidth
                let wrapperHeight = this.displayHeight
                let wrapperLeft = 0
                let wrapperTop = 0
                
                if (this.remoteScreenWidth > 0 && this.remoteScreenHeight > 0) {
                    const containerAspect = this.displayWidth / this.displayHeight
                    const remoteAspect = this.remoteScreenWidth / this.remoteScreenHeight
                    
                    if (remoteAspect > containerAspect) {
                        wrapperWidth = this.displayWidth
                        wrapperHeight = this.displayWidth / remoteAspect
                        wrapperTop = (this.displayHeight - wrapperHeight) / 2
                    } else {
                        wrapperHeight = this.displayHeight
                        wrapperWidth = this.displayHeight * remoteAspect
                        wrapperLeft = (this.displayWidth - wrapperWidth) / 2
                    }
                }
                
                wrapperElement.style.width = wrapperWidth + 'px'
                wrapperElement.style.height = wrapperHeight + 'px'
                wrapperElement.style.left = wrapperLeft + 'px'
                wrapperElement.style.top = wrapperTop + 'px'
                
                this._log('applyContainerSize', 
                    `设置 wrapper 尺寸 ${wrapperWidth}x${wrapperHeight}, 位置 (${wrapperLeft}, ${wrapperTop})`)
            }
        } else {
            this._log('applyContainerSize', 'displayWidth 或 displayHeight 为 0，跳过设置')
        }
    }
    
    /**
     * 重置缩放和平移
     */
    reset() {
        this.scale = 1.0
        this.panX = 0
        this.panY = 0
        this._matrixDirty = true
    }
    
    /**
     * 完全重置所有参数
     */
    fullReset() {
        this.scale = 1.0
        this.panX = 0
        this.panY = 0
        this.screenWidth = 0
        this.screenHeight = 0
        this.remoteScreenWidth = 1920
        this.remoteScreenHeight = 1080
        this.displayX = 0
        this.displayY = 0
        this.displayWidth = 0
        this.displayHeight = 0
        this._matrixDirty = true
    }
    
    /**
     * 获取当前状态（用于调试）
     * 
     * @returns {Object} 状态对象
     */
    getState() {
        return {
            scale: this.scale,
            panX: this.panX,
            panY: this.panY,
            displayWidth: this.displayWidth,
            displayHeight: this.displayHeight,
            displayX: this.displayX,
            displayY: this.displayY,
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            remoteScreenWidth: this.remoteScreenWidth,
            remoteScreenHeight: this.remoteScreenHeight
        }
    }
    
    /**
     * 日志输出（内部使用）
     * 
     * @private
     * @param {string} prefix - 前缀
     * @param {string|Object} message - 消息
     */
    _log(prefix, message) {
        if (this.logger) {
            if (typeof message === 'object') {
                this.logger.log(`[${prefix}]`, JSON.stringify(message))
            } else {
                this.logger.log(`[${prefix}] ${message}`)
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatrixTransformer
} else {
    window.MatrixTransformer = MatrixTransformer
}

export default MatrixTransformer

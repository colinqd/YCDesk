/**
 * MatrixTransformer DOM 操作辅助类
 * 
 * 负责处理与 DOM 相关的变换操作
 * 与 MatrixTransformer 配合使用，分离业务逻辑和 DOM 操作
 */
export class MatrixTransformerDOM {
    /**
     * 创建 DOM 操作实例
     * @param {Object} transformer - MatrixTransformer 实例
     */
    constructor(transformer) {
        this.transformer = transformer
    }

    /**
     * 应用变换到 DOM 元素
     * @param {HTMLElement} element - 要应用变换的元素
     */
    applyTransform(element) {
        if (!element) {
            console.warn('[MatrixTransformerDOM] 元素不存在')
            return
        }

        element.style.transform = `translate(${this.transformer.panX}px, ${this.transformer.panY}px) scale(${this.transformer.scale})`
        element.style.transformOrigin = '0 0'
    }

    /**
     * 应用容器尺寸到 DOM 元素
     * @param {HTMLElement} containerElement - 容器元素
     * @param {HTMLElement} wrapperElement - 包装元素
     */
    applyContainerSize(containerElement, wrapperElement) {
        if (!containerElement) {
            console.warn('[MatrixTransformerDOM] 容器元素不存在')
            return
        }

        console.log('applyContainerSize: displayWidth=' + this.transformer.displayWidth + ', displayHeight=' + this.transformer.displayHeight +
            ', displayX=' + this.transformer.displayX + ', displayY=' + this.transformer.displayY)

        if (this.transformer.displayWidth > 0 && this.transformer.displayHeight > 0) {
            containerElement.style.width = this.transformer.displayWidth + 'px'
            containerElement.style.height = this.transformer.displayHeight + 'px'
            containerElement.style.left = this.transformer.displayX + 'px'
            containerElement.style.top = this.transformer.displayY + 'px'

            console.log('applyContainerSize: 设置 container 尺寸为 ' + this.transformer.displayWidth + 'x' + this.transformer.displayHeight +
                ', 位置 (' + this.transformer.displayX + ', ' + this.transformer.displayY + ')')

            if (wrapperElement) {
                wrapperElement.style.width = '100%'
                wrapperElement.style.height = '100%'
                wrapperElement.style.left = '0px'
                wrapperElement.style.top = '0px'
            }
        } else {
            console.log('applyContainerSize: displayWidth 或 displayHeight 为 0，跳过设置')
        }
    }

    /**
     * 从 DOM 元素获取尺寸信息
     * @param {HTMLElement} element - 目标元素
     * @returns {Object} 尺寸信息
     */
    getElementSize(element) {
        if (!element) {
            return { width: 0, height: 0 }
        }

        const rect = element.getBoundingClientRect()
        return {
            width: rect.width,
            height: rect.height
        }
    }

    /**
     * 获取鼠标相对于元素的位置
     * @param {MouseEvent} event - 鼠标事件
     * @param {HTMLElement} element - 目标元素
     * @returns {Object} 鼠标位置
     */
    getMousePosition(event, element) {
        if (!element) {
            return { x: 0, y: 0 }
        }

        const rect = element.getBoundingClientRect()
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        }
    }

    /**
     * 更新缩放并应用变换
     * @param {number} newScale - 新缩放值
     * @param {number} centerX - 中心点 X
     * @param {number} centerY - 中心点 Y
     * @param {HTMLElement} element - 要应用变换的元素
     */
    updateScaleAndApply(newScale, centerX, centerY, element) {
        this.transformer.updateScale(newScale, centerX, centerY)
        this.applyTransform(element)
    }

    /**
     * 更新平移并应用变换
     * @param {number} deltaX - X 方向增量
     * @param {number} deltaY - Y 方向增量
     * @param {HTMLElement} element - 要应用变换的元素
     */
    updatePanAndApply(deltaX, deltaY, element) {
        this.transformer.updatePan(deltaX, deltaY)
        this.applyTransform(element)
    }

    /**
     * 重置 DOM 变换
     * @param {HTMLElement} element - 要重置的元素
     */
    resetTransform(element) {
        if (!element) return

        element.style.transform = 'translate(0px, 0px) scale(1)'
        element.style.transformOrigin = '0 0'
    }

    /**
     * 完全重置（包括 transformer）
     * @param {HTMLElement} element - 要重置的元素
     */
    fullReset(element) {
        this.transformer.fullReset()
        this.resetTransform(element)
    }
}

export default MatrixTransformerDOM

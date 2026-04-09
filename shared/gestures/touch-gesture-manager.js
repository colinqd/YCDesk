class TouchGestureManager {
    constructor(options = {}) {
        this.config = Object.assign({}, GestureConfig, options.config || {})

        this.transformer = options.transformer || null
        this.sendInput = options.sendInput || (() => {})
        this.applyTransform = options.applyTransform || (() => {})
        this.onToggleUI = options.onToggleUI || (() => {})
        this.vibrate = options.vibrate || (() => {})
        this.isTouchOnUI = options.isTouchOnUI || (() => false)
        this.getLogger = options.logger || null

        this._touches = new Map()

        this._gestureState = GestureState.IDLE
        this._singlePhase = SingleTouchPhase.IDLE
        this._dualPhase = DualTouchPhase.IDLE

        this._lastTapTime = 0
        this._longPressTimer = null
        this._isLongPress = false
        this._isDragging = false
        this._dragStartX = 0
        this._dragStartY = 0
        this._lastMouseX = 0
        this._lastMouseY = 0

        this._isPinching = false
        this._initialPinchDistance = 0
        this._initialScale = 1
        this._pinchCenterX = 0
        this._pinchCenterY = 0

        this._isPanning = false
        this._panStartX = 0
        this._panStartY = 0
        this._initialPanX = 0
        this._initialPanY = 0

        this._isScrolling = false
        this._scrollStartY = 0
        this._lastScrollY = 0

        this._lastInputTime = 0
    }

    handleTouchStart(event) {
        const touchCount = event.touches.length

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i]
            this._touches.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY,
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now()
            })
        }

        if (touchCount === 1) {
            this._gestureState = GestureState.SINGLE_TOUCH
            this._handleSingleTouchStart(event.touches[0])
        } else if (touchCount === 2) {
            this._gestureState = GestureState.DUAL_TOUCH
            this._handleDualTouchStart(event.touches[0], event.touches[1])
        } else if (touchCount >= this.config.MULTI_TOUCH_FINGER_COUNT) {
            this._gestureState = GestureState.MULTI_TOUCH
            this._handleMultiTouchStart()
        }
    }

    handleTouchMove(event) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i]
            const existing = this._touches.get(touch.identifier)
            if (existing) {
                existing.x = touch.clientX
                existing.y = touch.clientY
            }
        }

        const touchCount = event.touches.length

        if (touchCount === 1 && this._gestureState === GestureState.SINGLE_TOUCH) {
            this._handleSingleTouchMove(event.touches[0])
        } else if (touchCount === 2 && this._gestureState === GestureState.DUAL_TOUCH) {
            this._handleDualTouchMove(event.touches[0], event.touches[1])
        }
    }

    handleTouchEnd(event) {
        const remainingCount = event.touches.length

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i]
            const touchData = this._touches.get(touch.identifier)

            if (remainingCount === 0 && this._gestureState === GestureState.SINGLE_TOUCH) {
                this._handleSingleTouchEnd(touch, touchData)
            }

            this._touches.delete(touch.identifier)
        }

        if (remainingCount < 2) {
            this._isPinching = false
            this._isScrolling = false
            this._isPanning = false
            this._dualPhase = DualTouchPhase.IDLE
        }

        if (remainingCount === 0) {
            this._gestureState = GestureState.IDLE
            this._singlePhase = SingleTouchPhase.IDLE
        } else if (remainingCount === 1) {
            this._gestureState = GestureState.SINGLE_TOUCH
            this._singlePhase = SingleTouchPhase.IDLE
            this._isDragging = false
            this._isLongPress = false
        }
    }

    handleTouchCancel(event) {
        this._cancelLongPress()
        this._touches.clear()
        this._gestureState = GestureState.IDLE
        this._singlePhase = SingleTouchPhase.IDLE
        this._dualPhase = DualTouchPhase.IDLE
        this._isPinching = false
        this._isPanning = false
        this._isScrolling = false
        this._isDragging = false
        this._isLongPress = false
    }

    _handleSingleTouchStart(touch) {
        this._dragStartX = touch.clientX
        this._dragStartY = touch.clientY
        this._lastMouseX = touch.clientX
        this._lastMouseY = touch.clientY
        this._isLongPress = false
        this._isDragging = false
        this._singlePhase = SingleTouchPhase.TAP_PENDING

        const now = Date.now()
        if (now - this._lastTapTime < this.config.DOUBLE_TAP_INTERVAL) {
            this._isDragging = true
            this._singlePhase = SingleTouchPhase.DRAGGING
            this._sendMouseDown(touch.clientX, touch.clientY, 0)
            this._log('双击拖拽开始')
        } else {
            this._startLongPressTimer(touch.clientX, touch.clientY)
        }
    }

    _handleSingleTouchMove(touch) {
        const dx = touch.clientX - this._dragStartX
        const dy = touch.clientY - this._dragStartY
        const distance = Math.hypot(dx, dy)

        if (this._longPressTimer && distance > this.config.LONG_PRESS_MAX_DISTANCE) {
            this._cancelLongPress()
        }

        if (!this._isLongPress) {
            if (this._isDragging) {
                this._throttledSendMouseMove(touch.clientX, touch.clientY)
            } else if (distance > this.config.DRAG_START_DISTANCE) {
                this._isDragging = true
                this._singlePhase = SingleTouchPhase.DRAGGING
                this._cancelLongPress()
                this._sendMouseDown(this._dragStartX, this._dragStartY, 0)
                this._log('开始拖拽')
            }

            this._lastMouseX = touch.clientX
            this._lastMouseY = touch.clientY
        }
    }

    _handleSingleTouchEnd(touch, touchData) {
        this._cancelLongPress()

        if (!touchData) return

        const duration = Date.now() - touchData.startTime
        const distance = Math.hypot(
            touch.clientX - touchData.startX,
            touch.clientY - touchData.startY
        )

        if (this._isLongPress) {
            this._sendMouseUp(touch.clientX, touch.clientY, 2)
            this._singlePhase = SingleTouchPhase.IDLE
            this._log('右键释放')
        } else if (this._isDragging) {
            this._sendMouseUp(touch.clientX, touch.clientY, 0)
            this._singlePhase = SingleTouchPhase.IDLE
            this._log('拖拽结束')
        } else if (distance < this.config.TAP_MAX_DISTANCE && duration < this.config.TAP_MAX_DURATION) {
            const now = Date.now()
            if (now - this._lastTapTime < this.config.DOUBLE_TAP_INTERVAL) {
                this._sendDoubleClick(touch.clientX, touch.clientY)
                this._log('双击')
            } else {
                this._sendMouseClick(touch.clientX, touch.clientY, 0)
                this._log('单击')
            }
            this._lastTapTime = now
            this._singlePhase = SingleTouchPhase.IDLE
        } else {
            this._sendMouseClick(touch.clientX, touch.clientY, 0)
            this._singlePhase = SingleTouchPhase.IDLE
            this._log('单击 (distance=' + distance.toFixed(2) + ', duration=' + duration + ')')
        }

        this._isDragging = false
        this._isLongPress = false
    }

    _handleDualTouchStart(touch1, touch2) {
        this._cancelLongPress()

        this._isPinching = true
        this._isScrolling = false
        this._isPanning = false
        this._dualPhase = DualTouchPhase.PINCHING

        this._initialPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        )
        this._initialScale = this.transformer ? this.transformer.scale : 1
        this._pinchCenterX = (touch1.clientX + touch2.clientX) / 2
        this._pinchCenterY = (touch1.clientY + touch2.clientY) / 2

        this._scrollStartY = this._pinchCenterY
        this._lastScrollY = this._pinchCenterY

        this._panStartX = this._pinchCenterX
        this._panStartY = this._pinchCenterY
        this._initialPanX = this.transformer ? this.transformer.panX : 0
        this._initialPanY = this.transformer ? this.transformer.panY : 0
    }

    _handleDualTouchMove(touch1, touch2) {
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        )

        const currentCenterX = (touch1.clientX + touch2.clientX) / 2
        const currentCenterY = (touch1.clientY + touch2.clientY) / 2

        const distanceDelta = Math.abs(currentDistance - this._initialPinchDistance)
        const deltaX = currentCenterX - this._panStartX
        const deltaY = currentCenterY - this._panStartY
        const centerDelta = Math.hypot(deltaX, deltaY)

        if (distanceDelta > this.config.PINCH_THRESHOLD) {
            this._dualPhase = DualTouchPhase.PINCHING
            this._isScrolling = false
            this._isPanning = false

            const scaleDelta = currentDistance / this._initialPinchDistance
            const newScale = Math.max(
                this.config.SCALE_MIN,
                Math.min(this.config.SCALE_MAX, this.initialScale * scaleDelta)
            )

            if (this.transformer) {
                this.transformer.updateScale(newScale, currentCenterX, currentCenterY)
                this.applyTransform()
            }
            this._log('双指缩放: scale=' + newScale.toFixed(2))
        } else if (this.transformer && this.transformer.scale > 1.05 && centerDelta > this.config.PAN_THRESHOLD) {
            this._dualPhase = DualTouchPhase.PANNING
            this._isScrolling = false
            this._isPanning = true

            this.transformer.panX = this._initialPanX + deltaX
            this.transformer.panY = this._initialPanY + deltaY
            this.transformer.clampPan()
            this.transformer._matrixDirty = true
            this.applyTransform()
            this._log('双指平移: panX=' + this.transformer.panX.toFixed(0) + ', panY=' + this.transformer.panY.toFixed(0))
        } else if (Math.abs(currentCenterY - this._lastScrollY) > this.config.SCROLL_THRESHOLD
                   && Math.abs(deltaX) < this.config.SCROLL_MAX_HORIZONTAL
                   && !this._isPanning) {
            this._dualPhase = DualTouchPhase.SCROLLING
            this._isScrolling = true

            const scrollDelta = -(currentCenterY - this._lastScrollY) * this.config.SCROLL_SENSITIVITY
            this._sendWheel(scrollDelta)
            this._lastScrollY = currentCenterY
            this._log('双指滚动: delta=' + scrollDelta.toFixed(0))
        }
    }

    _handleMultiTouchStart() {
        this._cancelLongPress()
        this.onToggleUI()
        this._log('三指轻点 - 切换工具栏')
    }

    _startLongPressTimer(x, y) {
        this._cancelLongPress()
        this._longPressTimer = setTimeout(() => {
            this._isLongPress = true
            this._singlePhase = SingleTouchPhase.LONG_PRESS
            this._sendMouseDown(this._lastMouseX, this._lastMouseY, 2)
            this.vibrate(this.config.VIBRATE_LONG)
            this._log('长按触发右键')
        }, this.config.LONG_PRESS_DURATION)
    }

    _cancelLongPress() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer)
            this._longPressTimer = null
        }
    }

    _throttledSendMouseMove(x, y) {
        const now = Date.now()
        if (now - this._lastInputTime < this.config.INPUT_THROTTLE_MS) return
        this._lastInputTime = now
        this.sendInput(x, y, 'mousemove', 0)
    }

    _sendMouseMove(x, y) {
        this.sendInput(x, y, 'mousemove', 0)
    }

    _sendMouseDown(x, y, button) {
        this.sendInput(x, y, 'mousedown', button)
        this.vibrate(this.config.VIBRATE_SHORT)
    }

    _sendMouseUp(x, y, button) {
        this.sendInput(x, y, 'mouseup', button)
    }

    _sendMouseClick(x, y, button) {
        this.sendInput(x, y, 'mousedown', button)
        this.sendInput(x, y, 'mouseup', button)
        this.vibrate(this.config.VIBRATE_SHORT)
    }

    _sendDoubleClick(x, y) {
        this.sendInput(x, y, 'doubleclick', 0)
        this.vibrate(this.config.VIBRATE_DOUBLE)
    }

    _sendWheel(deltaY) {
        this.sendInput(0, 0, 'wheel', 0, deltaY)
    }

    _log(message) {
        if (this.getLogger) {
            this.getLogger(message)
        }
    }

    get gestureState() {
        return this._gestureState
    }

    get singlePhase() {
        return this._singlePhase
    }

    get dualPhase() {
        return this._dualPhase
    }

    get isPinching() {
        return this._isPinching
    }

    get isPanning() {
        return this._isPanning
    }

    get isScrolling() {
        return this._isScrolling
    }

    get isDragging() {
        return this._isDragging
    }

    get isLongPress() {
        return this._isLongPress
    }

    reset() {
        this._cancelLongPress()
        this._touches.clear()
        this._gestureState = GestureState.IDLE
        this._singlePhase = SingleTouchPhase.IDLE
        this._dualPhase = DualTouchPhase.IDLE
        this._isPinching = false
        this._isPanning = false
        this._isScrolling = false
        this._isDragging = false
        this._isLongPress = false
        this._lastTapTime = 0
    }

    destroy() {
        this.reset()
        this.transformer = null
        this.sendInput = () => {}
        this.applyTransform = () => {}
        this.onToggleUI = () => {}
        this.vibrate = () => {}
        this.isTouchOnUI = () => false
        this.getLogger = null
    }
}

export default TouchGestureManager

if (typeof window !== 'undefined') {
    window.TouchGestureManager = TouchGestureManager
}

import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { io } from 'socket.io-client';
import { registerPlugin } from '@capacitor/core';

const TCPSocket = registerPlugin('TCPSocket');
const InputExecutor = registerPlugin('InputExecutor');
const FloatingMouse = registerPlugin('FloatingMouse');
const ScreenCapture = registerPlugin('ScreenCapture');

class MatrixTransformer {
    constructor() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.remoteScreenWidth = 1920;
        this.remoteScreenHeight = 1080;
        
        this.displayX = 0;
        this.displayY = 0;
        this.displayWidth = 0;
        this.displayHeight = 0;
        
        this.scaleFactor = 1;
        this.workArea = null;
        
        this._matrix = null;
        this._inverseMatrix = null;
        this._matrixDirty = true;
    }
    
    setScreenSize(width, height) {
        this.screenWidth = width;
        this.screenHeight = height;
        this._matrixDirty = true;
        this._updateDisplayRect();
    }
    
    setRemoteScreenSize(width, height) {
        this.remoteScreenWidth = width;
        this.remoteScreenHeight = height;
        this._updateDisplayRect();
    }
    
    _updateDisplayRect() {
        log('_updateDisplayRect: screenWidth=' + this.screenWidth + ', screenHeight=' + this.screenHeight +
            ', remoteScreenWidth=' + this.remoteScreenWidth + ', remoteScreenHeight=' + this.remoteScreenHeight);
        
        if (this.screenWidth === 0 || this.screenHeight === 0) {
            this.displayX = 0;
            this.displayY = 0;
            this.displayWidth = 0;
            this.displayHeight = 0;
            log('_updateDisplayRect: screen 尺寸为 0，跳过计算');
            return;
        }
        
        if (this.remoteScreenWidth === 0 || this.remoteScreenHeight === 0) {
            this.displayX = 0;
            this.displayY = 0;
            this.displayWidth = this.screenWidth;
            this.displayHeight = this.screenHeight;
            log('_updateDisplayRect: remoteScreen 尺寸为 0，使用 screen 尺寸');
            return;
        }
        
        const screenAspect = this.screenWidth / this.screenHeight;
        const remoteAspect = this.remoteScreenWidth / this.remoteScreenHeight;
        
        if (remoteAspect > screenAspect) {
            this.displayWidth = this.screenWidth;
            this.displayHeight = this.screenWidth / remoteAspect;
            this.displayX = 0;
            this.displayY = (this.screenHeight - this.displayHeight) / 2;
        } else {
            this.displayHeight = this.screenHeight;
            this.displayWidth = this.screenHeight * remoteAspect;
            this.displayX = (this.screenWidth - this.displayWidth) / 2;
            this.displayY = 0;
        }
        
        log('_updateDisplayRect: 计算结果 - displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight +
            ', displayX=' + this.displayX + ', displayY=' + this.displayY);
    }
    
    _updateMatrices() {
        if (!this._matrixDirty) return;
        
        this._matrix = {
            a: this.scale,
            b: 0,
            c: this.panX,
            d: 0,
            e: this.scale,
            f: this.panY
        };
        
        const invScale = 1.0 / this.scale;
        this._inverseMatrix = {
            a: invScale,
            b: 0,
            c: -this.panX * invScale,
            d: 0,
            e: invScale,
            f: -this.panY * invScale
        };
        
        this._matrixDirty = false;
    }
    
    containerToDisplay(containerX, containerY) {
        return {
            x: containerX - this.displayX,
            y: containerY - this.displayY
        };
    }
    
    displayToContainer(displayX, displayY) {
        return {
            x: displayX + this.displayX,
            y: displayY + this.displayY
        };
    }
    
    displayToRemote(displayX, displayY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null;
        }
        
        const remoteX = (displayX / this.displayWidth) * this.remoteScreenWidth;
        const remoteY = (displayY / this.displayHeight) * this.remoteScreenHeight;
        
        return { x: remoteX, y: remoteY };
    }
    
    containerToRemote(containerX, containerY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null;
        }
        
        const display = this.containerToDisplay(containerX, containerY);
        
        if (display.x < 0 || display.x > this.displayWidth ||
            display.y < 0 || display.y > this.displayHeight) {
            return null;
        }
        
        const centerX = this.displayWidth / 2;
        const centerY = this.displayHeight / 2;
        
        const transformedX = centerX + (display.x - centerX - this.panX) / this.scale;
        const transformedY = centerY + (display.y - centerY - this.panY) / this.scale;
        
        return this.displayToRemote(transformedX, transformedY);
    }
    
    viewToVideo(viewX, viewY) {
        this._updateMatrices();
        const m = this._inverseMatrix;
        return {
            x: m.a * viewX + m.b * viewY + m.c,
            y: m.d * viewX + m.e * viewY + m.f
        };
    }
    
    videoToView(videoX, videoY) {
        this._updateMatrices();
        const m = this._matrix;
        return {
            x: m.a * videoX + m.b * videoY + m.c,
            y: m.d * videoX + m.e * videoY + m.f
        };
    }
    
    videoToRemote(videoX, videoY) {
        if (this.videoWidth === 0 || this.videoHeight === 0) {
            return { x: 0, y: 0 };
        }
        return {
            x: (videoX / this.videoWidth) * this.remoteScreenWidth,
            y: (videoY / this.videoHeight) * this.remoteScreenHeight
        };
    }
    
    remoteToVideo(remoteX, remoteY) {
        return {
            x: (remoteX / this.remoteScreenWidth) * this.videoWidth,
            y: (remoteY / this.remoteScreenHeight) * this.videoHeight
        };
    }
    
    viewToRemote(viewX, viewY) {
        const video = this.viewToVideo(viewX, viewY);
        return this.videoToRemote(video.x, video.y);
    }
    
    remoteToView(remoteX, remoteY) {
        const video = this.remoteToVideo(remoteX, remoteY);
        return this.videoToView(video.x, video.y);
    }
    
    updateScale(newScale, centerX, centerY) {
        const displayX = centerX - this.displayX;
        const displayY = centerY - this.displayY;
        
        const unscaledX = (displayX - this.panX) / this.scale;
        const unscaledY = (displayY - this.panY) / this.scale;
        
        this.scale = Math.max(0.5, Math.min(3.0, newScale));
        
        this.panX = displayX - unscaledX * this.scale;
        this.panY = displayY - unscaledY * this.scale;
        
        this._matrixDirty = true;
        this.clampPan();
    }
    
    updatePan(deltaX, deltaY) {
        this.panX += deltaX;
        this.panY += deltaY;
        this._matrixDirty = true;
        this.clampPan();
    }
    
    clampPan() {
        this._matrixDirty = true;
    }
    
    applyTransform(element) {
        element.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
        element.style.transformOrigin = '0 0';
    }
    
    applyContainerSize(containerElement, wrapperElement) {
        log('applyContainerSize: displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight + 
            ', displayX=' + this.displayX + ', displayY=' + this.displayY);
        
        if (this.displayWidth > 0 && this.displayHeight > 0) {
            containerElement.style.width = this.displayWidth + 'px';
            containerElement.style.height = this.displayHeight + 'px';
            containerElement.style.left = this.displayX + 'px';
            containerElement.style.top = this.displayY + 'px';
            
            log('applyContainerSize: 设置 container 尺寸为 ' + this.displayWidth + 'x' + this.displayHeight + 
                ', 位置 (' + this.displayX + ', ' + this.displayY + ')');
            
            if (wrapperElement) {
                wrapperElement.style.width = '100%';
                wrapperElement.style.height = '100%';
                wrapperElement.style.left = '0px';
                wrapperElement.style.top = '0px';
            }
        } else {
            log('applyContainerSize: displayWidth 或 displayHeight 为 0，跳过设置');
        }
    }
    
    reset() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this._matrixDirty = true;
    }
    
    fullReset() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.remoteScreenWidth = 1920;
        this.remoteScreenHeight = 1080;
        this.displayX = 0;
        this.displayY = 0;
        this.displayWidth = 0;
        this.displayHeight = 0;
        this._matrixDirty = true;
    }
}

class InputDispatcher {
    constructor(transformer) {
        this.transformer = transformer;
        
        this.lastInputTime = 0;
        this.inputThrottleMs = 8;
        
        this.currentMode = 'touch';
        this.isMouseDown = false;
        this.lastTapTime = 0;
        
        this.remoteScreenRect = null;
        this.videoContainerRect = null;
    }
    
    setMode(mode) {
        this.currentMode = mode;
    }
    
    updateRemoteScreenRect() {
        const remoteScreen = document.getElementById('remoteScreen');
        const videoContainer = document.getElementById('videoContainer');
        
        log('InputDispatcher: 查找 remoteScreen 元素 - ' + (remoteScreen ? '找到' : '未找到'));
        log('InputDispatcher: 查找 videoContainer 元素 - ' + (videoContainer ? '找到' : '未找到'));
        
        if (remoteScreen) {
            this.remoteScreenRect = remoteScreen.getBoundingClientRect();
            log('InputDispatcher: remoteScreen 位置 - left=' + this.remoteScreenRect.left + 
                ', top=' + this.remoteScreenRect.top + 
                ', width=' + this.remoteScreenRect.width + 
                ', height=' + this.remoteScreenRect.height);
        } else {
            log('InputDispatcher: 错误 - 找不到 remoteScreen 元素');
            this.remoteScreenRect = null;
        }
        
        if (videoContainer) {
            this.videoContainerRect = videoContainer.getBoundingClientRect();
            log('InputDispatcher: videoContainer 位置 - left=' + this.videoContainerRect.left + 
                ', top=' + this.videoContainerRect.top + 
                ', width=' + this.videoContainerRect.width + 
                ', height=' + this.videoContainerRect.height);
        } else {
            this.videoContainerRect = null;
        }
    }
    
    dispatchTouchInput(clientX, clientY, type, button = 0, delta = 0) {
        const now = Date.now();
        if (now - this.lastInputTime < this.inputThrottleMs && type === 'mousemove') {
            return;
        }
        this.lastInputTime = now;
        
        let commandType;
        switch (type) {
            case 'mousemove':
                commandType = 'mousemove';
                break;
            case 'mousedown':
                commandType = 'mousedown';
                break;
            case 'mouseup':
                commandType = 'mouseup';
                break;
            case 'wheel':
                commandType = 'wheel';
                break;
            case 'dblclick':
            case 'doubleclick':
                commandType = 'click';
                break;
            case 'dragstart':
                commandType = 'mousedown';
                break;
            case 'dragend':
                commandType = 'mouseup';
                break;
            default:
                commandType = type;
        }
        
        this.updateRemoteScreenRect();
        
        let normalizedX, normalizedY;
        let remoteX = 0, remoteY = 0;
        
        log('InputDispatcher: displayWidth=' + this.transformer.displayWidth + 
            ', displayHeight=' + this.transformer.displayHeight +
            ', videoWidth=' + this.transformer.videoWidth + 
            ', videoHeight=' + this.transformer.videoHeight +
            ', videoContainerRect=' + (this.videoContainerRect ? 'valid' : 'null'));
        
        if (this.transformer.displayWidth > 0 && this.transformer.displayHeight > 0 &&
            this.transformer.videoWidth > 0 && this.transformer.videoHeight > 0 &&
            this.videoContainerRect) {
            
            const containerX = clientX - this.videoContainerRect.left;
            const containerY = clientY - this.videoContainerRect.top;
            
            const remote = this.transformer.containerToRemote(containerX, containerY);
            
            if (remote) {
                remoteX = remote.x;
                remoteY = remote.y;
                normalizedX = remote.x / this.transformer.remoteScreenWidth;
                normalizedY = remote.y / this.transformer.remoteScreenHeight;
            } else {
                normalizedX = 0.5;
                normalizedY = 0.5;
                remoteX = this.transformer.remoteScreenWidth / 2;
                remoteY = this.transformer.remoteScreenHeight / 2;
            }
        } else if (this.videoContainerRect && this.videoContainerRect.width > 0 && this.videoContainerRect.height > 0) {
            const containerX = clientX - this.videoContainerRect.left;
            const containerY = clientY - this.videoContainerRect.top;
            normalizedX = containerX / this.videoContainerRect.width;
            normalizedY = containerY / this.videoContainerRect.height;
            remoteX = normalizedX * this.transformer.remoteScreenWidth;
            remoteY = normalizedY * this.transformer.remoteScreenHeight;
        } else if (this.remoteScreenRect && this.remoteScreenRect.width > 0 && this.remoteScreenRect.height > 0) {
            normalizedX = (clientX - this.remoteScreenRect.left) / this.remoteScreenRect.width;
            normalizedY = (clientY - this.remoteScreenRect.top) / this.remoteScreenRect.height;
            remoteX = normalizedX * this.transformer.remoteScreenWidth;
            remoteY = normalizedY * this.transformer.remoteScreenHeight;
        } else {
            log('InputDispatcher: 警告 - 所有容器尺寸无效，使用安全坐标 (0.5, 0.5)');
            normalizedX = 0.5;
            normalizedY = 0.5;
            remoteX = this.transformer.remoteScreenWidth / 2;
            remoteY = this.transformer.remoteScreenHeight / 2;
        }
        
        normalizedX = Math.max(0, Math.min(1, normalizedX));
        normalizedY = Math.max(0, Math.min(1, normalizedY));
        
        log('InputDispatcher: 发送输入 - type=' + commandType + 
            ', clientX=' + clientX.toFixed(0) + ', clientY=' + clientY.toFixed(0) +
            ', remoteX=' + remoteX.toFixed(0) + ', remoteY=' + remoteY.toFixed(0) +
            ', normalizedX=' + normalizedX.toFixed(4) + ', normalizedY=' + normalizedY.toFixed(4) + 
            ', button=' + button);
        
        const command = {
            type: commandType,
            x: normalizedX,
            y: normalizedY,
            button: button
        };
        
        if (type === 'wheel') {
            command.deltaY = delta;
        }
        
        sendControlCommand(command);
    }
    
    dispatchFloatingMouseInput(screenX, screenY, type, button = 0, delta = 0) {
        log('InputDispatcher: dispatchFloatingMouseInput 被调用 - screenX=' + screenX + ', screenY=' + screenY + ', type=' + type);
        
        this.updateRemoteScreenRect();
        
        if (!this.videoContainerRect) {
            log('InputDispatcher: 错误 - 视频容器位置未初始化');
            return;
        }
        
        const containerX = screenX - this.videoContainerRect.left;
        const containerY = screenY - this.videoContainerRect.top;
        
        log('InputDispatcher: 悬浮鼠标输入 - screenX=' + screenX + ', screenY=' + screenY + 
            ', containerX=' + containerX + ', containerY=' + containerY + 
            ', displayX=' + this.transformer.displayX + 
            ', displayY=' + this.transformer.displayY +
            ', displayWidth=' + this.transformer.displayWidth + 
            ', displayHeight=' + this.transformer.displayHeight +
            ', type=' + type);
        
        this.dispatchTouchInput(containerX, containerY, type, button, delta);
    }
}

class GestureHandler {
    constructor(transformer, inputDispatcher, onDirectInput) {
        this.transformer = transformer;
        this.inputDispatcher = inputDispatcher;
        this.onDirectInput = onDirectInput;
        
        this.touches = new Map();
        
        this.isPinching = false;
        this.initialPinchDistance = 0;
        this.initialScale = 1;
        this.pinchCenterX = 0;
        this.pinchCenterY = 0;
        
        this.lastTapTime = 0;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.scrollStartY = 0;
        this.isScrolling = false;
        
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.initialPanX = 0;
        this.initialPanY = 0;
    }
    
    handleTouchStart(event) {
        const touchCount = event.touches.length;
        
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            const pointerId = touch.identifier;
            
            this.touches.set(pointerId, {
                x: touch.clientX,
                y: touch.clientY,
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now()
            });
        }
        
        if (touchCount === 1) {
            this.handleSingleTouchStart(event.touches[0]);
        } else if (touchCount === 2) {
            this.handleTwoTouchStart(event.touches[0], event.touches[1]);
        } else if (touchCount === 3) {
            this.handleThreeTouchStart();
        }
    }
    
    handleSingleTouchStart(touch) {
        const now = Date.now();
        
        this.dragStartX = touch.clientX;
        this.dragStartY = touch.clientY;
        this.lastMouseX = touch.clientX;
        this.lastMouseY = touch.clientY;
        
        this.isLongPress = false;
        this.isDragging = false;
        
        if (now - this.lastTapTime < 300) {
            this.isDragging = true;
            this.sendMouseDown(touch.clientX, touch.clientY, 0);
            log('双击拖拽开始');
        } else {
            this.longPressTimer = setTimeout(() => {
                this.isLongPress = true;
                this.sendMouseDown(this.lastMouseX, this.lastMouseY, 2);
                log('长按触发右键');
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }, 600);
        }
    }
    
    handleTwoTouchStart(touch1, touch2) {
        this.isPinching = true;
        this.isScrolling = false;
        this.isPanning = false;
        
        this.initialPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        this.initialScale = this.transformer.scale;
        this.pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        this.pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
        this.scrollStartY = (touch1.clientY + touch2.clientY) / 2;
        
        this.panStartX = this.pinchCenterX;
        this.panStartY = this.pinchCenterY;
        this.initialPanX = this.transformer.panX;
        this.initialPanY = this.transformer.panY;
        
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
    
    handleThreeTouchStart() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        toggleControlsHide();
        log('三指轻点 - 切换工具栏');
    }
    
    handleTouchMove(event) {
        const touchCount = event.touches.length;
        
        if (touchCount === 1) {
            this.handleSingleTouchMove(event.touches[0]);
        } else if (touchCount === 2) {
            this.handleTwoTouchMove(event.touches[0], event.touches[1]);
        }
    }
    
    handleSingleTouchMove(touch) {
        if (this.longPressTimer) {
            const dx = touch.clientX - this.dragStartX;
            const dy = touch.clientY - this.dragStartY;
            if (Math.hypot(dx, dy) > 10) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }
        
        if (!this.isLongPress) {
            if (this.isDragging) {
                this.sendMouseMove(touch.clientX, touch.clientY);
            } else {
                const dx = touch.clientX - this.dragStartX;
                const dy = touch.clientY - this.dragStartY;
                if (Math.hypot(dx, dy) > 10) {
                    this.isDragging = true;
                    this.sendMouseDown(touch.clientX, touch.clientY, 0);
                    log('开始拖拽');
                }
            }
            
            this.lastMouseX = touch.clientX;
            this.lastMouseY = touch.clientY;
        }
    }
    
    handleTwoTouchMove(touch1, touch2) {
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        
        const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
        const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
        
        const distanceDelta = Math.abs(currentDistance - this.initialPinchDistance);
        const deltaX = currentCenterX - this.panStartX;
        const deltaY = currentCenterY - this.panStartY;
        const centerDelta = Math.hypot(deltaX, deltaY);
        
        if (distanceDelta > 30) {
            this.isScrolling = false;
            this.isPanning = false;
            const scaleDelta = currentDistance / this.initialPinchDistance;
            const newScale = Math.max(0.5, Math.min(3.0, this.initialScale * scaleDelta));
            
            this.transformer.updateScale(newScale, currentCenterX, currentCenterY);
            log('双指缩放: scale=' + newScale.toFixed(2));
            
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                this.transformer.applyTransform(videoContainer);
            }
        } else if (this.transformer.scale > 1.05 && centerDelta > 10) {
            this.isScrolling = false;
            this.isPanning = true;
            
            this.transformer.panX = this.initialPanX + deltaX;
            this.transformer.panY = this.initialPanY + deltaY;
            this.transformer.clampPan();
            this.transformer._matrixDirty = true;
            
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                this.transformer.applyTransform(videoContainer);
            }
            log('双指平移: panX=' + this.transformer.panX.toFixed(0) + ', panY=' + this.transformer.panY.toFixed(0));
        } else if (Math.abs(deltaY) > 10 && Math.abs(deltaX) < 20 && !this.isPanning) {
            this.isScrolling = true;
            const scrollDelta = -deltaY * 2;
            this.sendWheel(scrollDelta);
            this.panStartY = currentCenterY;
            this.scrollStartY = currentCenterY;
            log('双指滚动: delta=' + scrollDelta.toFixed(0));
        }
    }
    
    handleTouchEnd(event) {
        const touchCount = event.touches.length;
        
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            const pointerId = touch.identifier;
            const touchData = this.touches.get(pointerId);
            
            if (touchData && touchCount === 0) {
                this.handleSingleTouchEnd(touch, touchData);
            }
            
            this.touches.delete(pointerId);
        }
        
        if (touchCount < 2) {
            this.isPinching = false;
            this.isScrolling = false;
            this.isPanning = false;
        }
    }
    
    handleSingleTouchEnd(touch, touchData) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        const duration = Date.now() - touchData.startTime;
        const distance = Math.hypot(
            touch.clientX - touchData.startX,
            touch.clientY - touchData.startY
        );
        
        if (this.isLongPress) {
            this.sendMouseUp(touch.clientX, touch.clientY, 2);
            log('右键释放');
        } else if (this.isDragging) {
            this.sendMouseUp(touch.clientX, touch.clientY, 0);
            log('拖拽结束');
        } else if (distance < 15 && duration < 300) {
            const now = Date.now();
            if (now - this.lastTapTime < 300) {
                this.sendDoubleClick(touch.clientX, touch.clientY);
                log('双击');
            } else {
                this.sendMouseClick(touch.clientX, touch.clientY, 0);
                log('单击');
            }
            this.lastTapTime = now;
        }
        
        this.isDragging = false;
        this.isLongPress = false;
    }
    
    sendMouseMove(x, y) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mousemove', 0);
        }
    }
    
    sendMouseDown(x, y, button) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mousedown', button);
        }
        if (navigator.vibrate) {
            navigator.vibrate(30);
        }
    }
    
    sendMouseUp(x, y, button) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mouseup', button);
        }
    }
    
    sendMouseClick(x, y, button) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mousedown', button);
            this.inputDispatcher.dispatchTouchInput(x, y, 'mouseup', button);
        }
        if (navigator.vibrate) {
            navigator.vibrate(30);
        }
    }
    
    sendDoubleClick(x, y) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'doubleclick', 0);
        }
        if (navigator.vibrate) {
            navigator.vibrate([30, 50, 30]);
        }
    }
    
    sendWheel(deltaY) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(0, 0, 'wheel', 0, deltaY);
        }
    }
}

let matrixTransformer = null;
let inputDispatcher = null;
let gestureHandler = null;

let myDeviceId = ''
let socket = null
let peerConnection = null
let currentSessionId = null
let incomingFromDeviceId = null
let isController = false
let controlledMode = 'direct'
let controllerMode = 'direct'

let currentDirectClientId = null
let directPeerConnection = null
let dataChannel = null
let connectionLogDiv = null
let currentRole = null
let isConnected = false
let pendingIceCandidates = []

const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
}

let connectionStatus = CONNECTION_STATUS.DISCONNECTED
let reconnectAttempts = 0
let reconnectTimeout = null
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 1000

let savedServerUrl = null
let savedRole = null

const STORAGE_KEYS = {
  DIRECT_HISTORY: 'ycdesk_direct_history',
  SIGNALING_HISTORY: 'ycdesk_signaling_history'
}

const MAX_HISTORY_ITEMS = 10

function setConnectionStatus(status) {
  connectionStatus = status
  log(`连接状态变更: ${status}`)
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    connectionLogDiv.appendChild(div)
    connectionLogDiv.scrollTop = connectionLogDiv.scrollHeight
  }
}

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

function getServerUrl() {
  return document.getElementById('serverUrl')?.value || 'http://10.0.2.2:3000'
}

function getControlledServerUrl() {
  return document.getElementById('controlledServerUrl')?.value || 'http://10.0.2.2:3000'
}

function getIceConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
}

function showToast(message, duration = 3000) {
  const existingToast = document.querySelector('.toast')
  if (existingToast) {
    existingToast.remove()
  }
  
  const toast = document.createElement('div')
  toast.className = 'toast show'
  toast.textContent = message
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => {
      toast.remove()
    }, 300)
  }, duration)
}

function updateServerStatus(text, status) {
  const statusText = document.getElementById('serverStatusText')
  const statusBadge = document.getElementById('serverStatus')
  const statusDot = document.querySelector('.status-dot')
  
  if (!statusText || !statusBadge || !statusDot) return
  
  statusText.textContent = text
  
  const statusStyles = {
    'connected': { bg: '#e6f4ea', color: '#135429', dotColor: '#2ecc71' },
    'connecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107' },
    'disconnected': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' },
    'error': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' }
  }
  
  const style = statusStyles[status] || statusStyles['disconnected']
  statusBadge.style.background = style.bg
  statusBadge.style.color = style.color
  statusDot.style.background = style.dotColor
}

async function copyDeviceId() {
  try {
    await navigator.clipboard.writeText(myDeviceId)
    showToast('设备ID已复制')
    const el = document.getElementById('deviceId')
    if (el) {
      const originalText = el.textContent
      el.textContent = '已复制!'
      setTimeout(() => {
        el.textContent = originalText
      }, 1500)
    }
  } catch (err) {
    showToast('复制失败')
  }
}

function saveToHistory(type, data) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    
    const existingIndex = history.findIndex(item => {
      if (type === 'direct') {
        return item.ip === data.ip && item.port === data.port
      } else {
        return item.deviceId === data.deviceId && item.serverUrl === data.serverUrl
      }
    })
    
    if (existingIndex !== -1) {
      history.splice(existingIndex, 1)
    }
    
    history.unshift({
      ...data,
      timestamp: Date.now()
    })
    
    history = history.slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(key, JSON.stringify(history))
    
    renderHistory(type)
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

function loadHistory(type) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch (error) {
    console.error('加载历史记录失败:', error)
    return []
  }
}

function deleteFromHistory(type, index) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    history.splice(index, 1)
    localStorage.setItem(key, JSON.stringify(history))
    renderHistory(type)
  } catch (error) {
    console.error('删除历史记录失败:', error)
  }
}

function renderHistory(type) {
  const history = loadHistory(type)
  const listId = type === 'direct' ? 'directHistoryList' : 'signalingHistoryList'
  const listEl = document.getElementById(listId)
  
  if (!listEl) return
  
  if (history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史连接记录</div>'
    return
  }
  
  listEl.innerHTML = history.map((item, index) => {
    const time = new Date(item.timestamp).toLocaleString('zh-CN')
    let targetText = ''
    
    if (type === 'direct') {
      targetText = `${item.ip}:${item.port}`
    } else {
      targetText = `设备: ${item.deviceId}`
    }
    
    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${targetText}</div>
          <div class="history-time">${time}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="reconnectFromHistory('${type}', ${index})">重连</button>
          <button class="history-btn history-btn-delete" onclick="deleteFromHistory('${type}', ${index})">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function reconnectFromHistory(type, index) {
  const history = loadHistory(type)
  const item = history[index]
  
  if (!item) return
  
  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('serverUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId
    
    if (!socket || !socket.connected) {
      manualConnectToServer()
    } else {
      connectDevice()
    }
  }
}

async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('重连次数已达上限，停止重连')
    reconnectAttempts = 0
    setConnectionStatus(CONNECTION_STATUS.ERROR)
    showToast('重连失败，请检查网络后手动重试')
    return
  }

  reconnectAttempts++
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, Math.min(reconnectAttempts, 5))
  
  log(`将在 ${Math.round(delay/1000)} 秒后尝试重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
  
  reconnectTimeout = setTimeout(async () => {
    try {
      setConnectionStatus(CONNECTION_STATUS.CONNECTING)
      
      if (savedRole === 'controlled' && savedServerUrl) {
        await controlledConnectToServer()
      } else if (savedRole === 'controller' && savedServerUrl) {
        await manualConnectToServer()
      }
    } catch (error) {
      log('重连失败: ' + error.message)
      attemptReconnect()
    }
  }, delay)
}

function cancelReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  reconnectAttempts = 0
}

function selectRole(role) {
  console.log('selectRole called with role: ' + role)
  log('选择角色: ' + role)
  currentRole = role
  document.getElementById('rolePage').classList.remove('active')
  
  if (role === 'controller') {
    document.getElementById('controllerPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLog')
    console.log('Calling initController...')
    initController()
  } else {
    document.getElementById('controlledPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLogControlled')
    initControlled()
  }
}

function goBack() {
  document.getElementById('controllerPage').classList.remove('active')
  document.getElementById('controlledPage').classList.remove('active')
  document.getElementById('rolePage').classList.add('active')
  stopListening()
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
  }
  currentRole = null
}

function switchControllerMode(mode) {
  controllerMode = mode
  
  document.querySelectorAll('#controllerPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controllerSignalingMode').classList.remove('active')
  document.getElementById('controllerDirectMode').classList.remove('active')
  
  if (mode === 'direct') {
    document.getElementById('controllerDirectMode').classList.add('active')
    if (socket) {
      socket.disconnect()
      socket = null
    }
  } else {
    document.getElementById('controllerSignalingMode').classList.add('active')
  }
  
  log('主控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function switchControlledMode(mode) {
  controlledMode = mode
  
  document.querySelectorAll('#controlledPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controlledSignalingMode').classList.remove('active')
  document.getElementById('controlledDirectMode').classList.remove('active')
  const controlledDirectSection = document.getElementById('controlledDirectSection')
  if (controlledDirectSection) {
    controlledDirectSection.style.display = mode === 'direct' ? 'block' : 'none'
  }
  
  if (mode === 'direct') {
    document.getElementById('controlledDirectMode').classList.add('active')
    if (socket) {
      socket.disconnect()
      socket = null
    }
  } else {
    document.getElementById('controlledSignalingMode').classList.add('active')
    stopListening()
  }
  
  log('被控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function manualConnectToServer() {
  if (socket && socket.connected) {
    showToast('已经连接到服务器')
    log('已经连接到服务器，无需重复连接')
    return
  }
  connectToServer(getServerUrl(), 'controller')
}

function controlledConnectToServer() {
  if (socket && socket.connected) {
    showToast('已经连接到服务器')
    log('已经连接到服务器，无需重复连接')
    return
  }
  connectToServer(getControlledServerUrl(), 'controlled')
}

function disconnectFromServer() {
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
    updateServerStatus('已断开', 'disconnected')
    showToast('已断开连接')
  } else {
    log('未连接到服务器')
    showToast('未连接到服务器')
  }
}

function controlledDisconnectFromServer() {
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
    updateServerStatus('已断开', 'disconnected')
    showToast('已断开连接')
  } else {
    log('未连接到服务器')
    showToast('未连接到服务器')
  }
}

function connectToServer(serverUrl, role) {
  if (!serverUrl) {
    showToast('请先输入信令服务器地址')
    return
  }
  
  savedServerUrl = serverUrl
  savedRole = role
  reconnectAttempts = 0
  
  log('正在连接信令服务器: ' + serverUrl)
  updateServerStatus('连接中...', 'connecting')
  setConnectionStatus(CONNECTION_STATUS.CONNECTING)
  
  try {
    if (socket) {
      socket.disconnect()
    }
    
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: BASE_RECONNECT_DELAY,
      timeout: 10000
    })

    socket.on('connect', () => {
      log('✓ 已连接到信令服务器，Socket ID: ' + socket.id)
      log('正在注册设备 ID: ' + myDeviceId)
      socket.emit('register', myDeviceId)
      updateServerStatus('已连接', 'connected')
      setConnectionStatus(CONNECTION_STATUS.CONNECTED)
      reconnectAttempts = 0
      showToast('已连接到信令服务器')
    })

    socket.on('disconnect', (reason) => {
      log('与信令服务器断开连接，原因: ' + reason)
      updateServerStatus('已断开', 'disconnected')
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED)
    })

    socket.on('connect_error', (error) => {
      log('✗ 连接错误: ' + (error.message || error))
      updateServerStatus('连接失败', 'error')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
      showToast('连接服务器失败')
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      log('正在尝试重连... (第 ' + attemptNumber + ' 次)')
      reconnectAttempts = attemptNumber
    })

    socket.on('reconnect_failed', () => {
      log('✗ 重连失败，请检查服务器地址和网络连接')
      updateServerStatus('重连失败', 'error')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
      showToast('重连失败')
    })

    socket.on('incoming-connection', (data) => {
      log('收到连接请求: ' + JSON.stringify(data))
      incomingFromDeviceId = data.fromDeviceId
      currentSessionId = data.sessionId
      isController = false
      showIncomingConnectionDialog(data.fromDeviceId)
    })

    socket.on('connection-result', async (data) => {
      log('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        isController = true
        await startControllerConnection()
      } else {
        showToast('对方拒绝了连接请求')
      }
    })

    socket.on('offer', async (data) => {
      log('收到 offer')
      await handleOffer(data)
    })

    socket.on('answer', async (data) => {
      log('收到 answer')
      await handleAnswer(data)
    })

    socket.on('ice-candidate', async (data) => {
      log('收到 ICE candidate')
      await handleIceCandidate(data)
    })
  } catch (error) {
    log('✗ 连接初始化错误: ' + error.message)
    showToast('连接失败')
    updateServerStatus('连接失败', 'error')
    setConnectionStatus(CONNECTION_STATUS.ERROR)
  }
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase()
  const serverUrl = getServerUrl()
  
  if (!targetId) {
    showToast('请输入设备 ID')
    return
  }
  if (targetId.length !== 9) {
    showToast('设备 ID 格式不正确')
    return
  }
  if (targetId === myDeviceId) {
    showToast('不能连接自己')
    return
  }
  if (!socket || !socket.connected) {
    showToast('未连接到信令服务器')
    return
  }

  saveToHistory('signaling', { deviceId: targetId, serverUrl: serverUrl })
  
  incomingFromDeviceId = targetId
  socket.emit('connect-request', {
    fromDeviceId: myDeviceId,
    toDeviceId: targetId
  })

  showToast('连接请求已发送')
}

function showIncomingConnectionDialog(fromDeviceId) {
  if (confirm(`设备 ${fromDeviceId} 想要连接到你的设备，是否接受？`)) {
    acceptConnection()
  } else {
    rejectConnection()
  }
}

async function acceptConnection() {
  socket.emit('connection-response', {
    sessionId: currentSessionId,
    accepted: true,
    fromDeviceId: incomingFromDeviceId,
    toDeviceId: myDeviceId
  })

  await startControlledConnection()
}

function rejectConnection() {
  socket.emit('connection-response', {
    sessionId: currentSessionId,
    accepted: false,
    fromDeviceId: incomingFromDeviceId,
    toDeviceId: myDeviceId
  })
}

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  try {
    log('正在启动TCP服务器，端口: ' + port)
    const result = await TCPSocket.startServer({ port })
    
    if (result.success) {
      log('TCP服务器已启动，监听端口: ' + port)
      updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
      showToast('已开始监听')
    } else {
      log('启动TCP服务器失败: ' + result.error)
      showToast('启动监听失败: ' + result.error)
    }
  } catch (error) {
    log('启动TCP服务器异常: ' + error.message)
    showToast('启动监听失败')
  }
}

async function stopListening() {
  try {
    await TCPSocket.stopServer()
    log('TCP服务器已停止')
    updateServerStatus('就绪', 'disconnected')
  } catch (error) {
    log('停止TCP服务器失败: ' + error.message)
  }
}

async function connectDirect() {
  const remoteIp = document.getElementById('remoteIp').value.trim()
  const remotePort = parseInt(document.getElementById('remotePort').value)
  
  if (!remoteIp) {
    showToast('请输入对方IP地址')
    return
  }
  
  if (isNaN(remotePort) || remotePort < 1024 || remotePort > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  saveToHistory('direct', { ip: remoteIp, port: remotePort })
  
  log('正在连接到 ' + remoteIp + ':' + remotePort + '...')
  
  try {
    const result = await TCPSocket.connect({ host: remoteIp, port: remotePort })
    
    if (result.success) {
      currentDirectClientId = result.clientId
      log('TCP连接成功，clientId: ' + currentDirectClientId)
      showToast('已连接到服务器')
      
      startHeartbeat()
      
      await startDirectControllerConnection()
    } else {
      log('TCP连接失败: ' + result.error)
      showToast('连接失败: ' + result.error)
    }
  } catch (error) {
    log('TCP连接异常: ' + error.message)
    showToast('连接失败')
  }
}

let heartbeatInterval = null

function startHeartbeat() {
  stopHeartbeat()
  
  heartbeatInterval = setInterval(() => {
    if (currentDirectClientId) {
      sendDirectMessage(currentDirectClientId, { type: 'heartbeat' })
    }
  }, 5000)
  
  log('心跳已启动，每5秒发送一次')
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
    log('心跳已停止')
  }
}

async function sendDirectMessage(clientId, message) {
  try {
    await TCPSocket.send({ clientId, message: JSON.stringify(message) })
  } catch (error) {
    log('发送TCP消息失败: ' + error.message)
  }
}

async function handleDirectMessage(message) {
  log('收到TCP消息: ' + message.type)
  
  try {
    switch (message.type) {
      case 'offer':
        await handleDirectOffer(message.offer)
        break
      case 'answer':
        await handleDirectAnswer(message.answer)
        break
      case 'ice-candidate':
        await handleDirectIceCandidate(message.candidate)
        break
      case 'heartbeat':
        break
    }
  } catch (error) {
    log('处理TCP消息失败: ' + error.message)
  }
}

async function startDirectControllerConnection() {
  log('作为主控端建立直连WebRTC连接')
  
  directPeerConnection = new RTCPeerConnection({ iceServers: [] })
  
  directPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      log('发送ICE候选')
      sendDirectMessage(currentDirectClientId, {
        type: 'ice-candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      })
    }
  }
  
  directPeerConnection.ontrack = (event) => {
    log('收到远程媒体流，track类型: ' + event.track.kind)
    const stream = event.streams[0]
    if (stream) {
      log('流ID: ' + stream.id + ', tracks数量: ' + stream.getTracks().length)
      const remoteVideo = document.getElementById('remoteVideo')
      remoteVideo.srcObject = stream
      remoteVideo.play().catch(e => log('播放视频失败: ' + e.message))
      log('视频流已设置到video元素')
      
      remoteVideo.onloadedmetadata = () => {
        log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight)
        if (matrixTransformer) {
          matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight)
          
          const videoContainer = document.getElementById('videoContainer')
          const videoWrapper = document.getElementById('videoWrapper')
          if (videoContainer && videoWrapper) {
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
            log('视频加载后更新 container: ' + matrixTransformer.displayWidth + 'x' + matrixTransformer.displayHeight)
          }
        }
      }
    }
  }
  
  directPeerConnection.onconnectionstatechange = () => {
    log('WebRTC连接状态: ' + directPeerConnection.connectionState)
    if (directPeerConnection.connectionState === 'connected') {
      isConnected = true
      showToast('连接成功')
    } else if (directPeerConnection.connectionState === 'failed') {
      isConnected = false
      showToast('连接失败')
    }
  }
  
  directPeerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }
  
  directPeerConnection.addTransceiver('video', { direction: 'recvonly' })
  directPeerConnection.addTransceiver('audio', { direction: 'recvonly' })
  log('已添加视频和音频接收器')
  
  log('创建数据通道')
  dataChannel = directPeerConnection.createDataChannel('control')
  setupDataChannel()
  
  try {
    log('创建WebRTC Offer')
    const offer = await directPeerConnection.createOffer()
    await directPeerConnection.setLocalDescription(offer)
    
    log('发送Offer到被控端')
    sendDirectMessage(currentDirectClientId, {
      type: 'offer',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
    
    log('Offer已发送')
  } catch (error) {
    log('创建Offer失败: ' + error.message)
    showToast('连接失败')
  }
}

async function handleDirectOffer(offer) {
  if (!offer) {
    log('错误: offer为空')
    return
  }
  
  log('处理Offer')
  
  try {
    directPeerConnection = new RTCPeerConnection({ iceServers: [] })
    
    directPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendDirectMessage(currentDirectClientId, {
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }
        })
      }
    }
    
    directPeerConnection.onconnectionstatechange = () => {
      log('WebRTC连接状态: ' + directPeerConnection.connectionState)
    }
    
    directPeerConnection.ondatachannel = (event) => {
      log('收到数据通道')
      dataChannel = event.channel
      setupDataChannel()
    }
    
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    log('远程描述设置成功')
    
    const answer = await directPeerConnection.createAnswer()
    await directPeerConnection.setLocalDescription(answer)
    log('本地描述设置成功')
    
    sendDirectMessage(currentDirectClientId, {
      type: 'answer',
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    
    log('Answer已发送')
  } catch (error) {
    log('处理Offer失败: ' + error.message)
  }
}

async function handleDirectAnswer(answer) {
  if (!answer) {
    log('错误: answer为空')
    return
  }
  
  try {
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    log('Answer设置成功')
  } catch (error) {
    log('设置Answer失败: ' + error.message)
  }
}

async function handleDirectIceCandidate(candidate) {
  if (!candidate || !directPeerConnection) return
  
  try {
    await directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    log('ICE候选添加成功')
  } catch (error) {
    log('添加ICE候选失败: ' + error.message)
  }
}

async function initController() {
  log('YCDesk Android 主控端初始化完成，设备ID: ' + myDeviceId)
  renderHistory('direct')
  renderHistory('signaling')
  
  try {
    const serviceResult = await FloatingMouse.startService()
    log('悬浮鼠标服务已启动')
    
    FloatingMouse.addListener('mouseEvent', (event) => {
      handleFloatingMouseEvent(event)
    })
    log('悬浮鼠标事件监听已注册')
  } catch (e) {
    log('启动悬浮鼠标服务失败: ' + e.message)
  }
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === currentDirectClientId) {
      currentDirectClientId = null
      isConnected = false
      stopHeartbeat()
      hideFloatingMouse()
      showToast('连接已断开')
    }
  })
}

async function initControlled() {
  document.getElementById('deviceId').textContent = myDeviceId
  isAndroidControlled = true
  log('YCDesk Android 被控端初始化完成，设备ID: ' + myDeviceId)
  log('Android端被控模式已启用，可以接收来自Windows端的控制指令')
  
  try {
    await InputExecutor.setControlledMode({ enabled: true })
    log('InputExecutor被控模式已启用')
  } catch (e) {
    log('设置InputExecutor模式失败: ' + e.message)
  }
  
  const localIpList = document.getElementById('localIpList')
  if (localIpList) {
    localIpList.innerHTML = '<div class="ip-item">Android端暂不支持获取本机IP，请使用Windows端显示的IP地址</div>'
  }
  
  TCPSocket.addListener('incomingConnection', async (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    currentDirectClientId = data.clientId
    isAndroidControlled = true
    try {
      await InputExecutor.setControlledMode({ enabled: true })
    } catch (e) {
      log('设置InputExecutor模式失败: ' + e.message)
    }
    showToast('收到连接请求，正在建立连接...')
  })
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === currentDirectClientId) {
      currentDirectClientId = null
      isConnected = false
      isAndroidControlled = false
      InputExecutor.setControlledMode({ enabled: false }).catch(() => {})
    }
  })
}

async function startControllerConnection() {
  log('作为主控端建立连接')
  await createPeerConnection()
  
  try {
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    socket.emit('offer', {
      sessionId: currentSessionId,
      offer: offer,
      toDeviceId: incomingFromDeviceId
    })
  } catch (error) {
    log('创建 offer 失败: ' + error.message)
    showToast('连接失败')
  }
}

async function startControlledConnection() {
  log('作为被控端建立连接')
  await createPeerConnection()
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(getIceConfig())

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('ice-candidate', {
        sessionId: currentSessionId,
        candidate: event.candidate,
        toDeviceId: incomingFromDeviceId
      })
    }
  }

  peerConnection.ontrack = (event) => {
    log('收到远程媒体流，track类型: ' + event.track.kind)
    const stream = event.streams[0]
    if (stream) {
      log('流ID: ' + stream.id + ', tracks数量: ' + stream.getTracks().length)
      const remoteVideo = document.getElementById('remoteVideo')
      remoteVideo.srcObject = stream
      remoteVideo.play().catch(e => log('播放视频失败: ' + e.message))
      log('视频流已设置到video元素')
      
      remoteVideo.onloadedmetadata = () => {
        log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight)
        if (matrixTransformer) {
          matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight)
          
          const videoContainer = document.getElementById('videoContainer')
          const videoWrapper = document.getElementById('videoWrapper')
          if (videoContainer && videoWrapper) {
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
            log('视频加载后更新 container: ' + matrixTransformer.displayWidth + 'x' + matrixTransformer.displayHeight)
          }
        }
      }
    }
  }

  peerConnection.onconnectionstatechange = () => {
    log('连接状态: ' + peerConnection.connectionState)
    if (peerConnection.connectionState === 'connected') {
      isConnected = true
      showToast('连接成功')
    } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      isConnected = false
      showToast('连接已断开')
      hideRemoteScreen()
    }
  }

  peerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }

  if (isController) {
    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.addTransceiver('audio', { direction: 'recvonly' })
    log('已添加视频和音频接收器')
    
    log('创建数据通道（主控端）')
    dataChannel = peerConnection.createDataChannel('control')
    setupDataChannel()
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    log('数据通道已打开')
    showToast('连接成功！正在加载远程屏幕...')
    
    setTimeout(() => {
      showRemoteScreen()
    }, 500)
  }

  dataChannel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      log('收到数据通道消息: ' + JSON.stringify(data).substring(0, 100))
      
      if (data.type === 'screen-size') {
        log('收到屏幕尺寸: ' + data.width + 'x' + data.height + ', scaleFactor=' + data.scaleFactor)
        updateScreenSize(data.width, data.height, data.scaleFactor, data.workArea)
      } else if (data.type === 'input') {
        handleReceivedInput(data)
      } else if (data.type === 'ping') {
        dataChannel.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }))
      }
    } catch (e) {
      log('解析数据通道消息失败: ' + e.message)
    }
  }

  dataChannel.onclose = () => {
    log('数据通道已关闭')
    hideRemoteScreen()
  }

  dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error)
    showToast('数据通道错误')
  }
}

let isAndroidControlled = false

async function handleReceivedInput(inputData) {
  if (!isAndroidControlled) {
    log('Android端不是被控模式，忽略输入')
    return
  }
  
  log('处理接收到的输入: ' + inputData.inputType)
  
  try {
    switch (inputData.inputType) {
      case 'mousemove':
        await InputExecutor.executeMouseMove({
          x: inputData.x,
          y: inputData.y,
          screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'mousedown':
        await InputExecutor.executeMouseDown({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button,
          screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'mouseup':
        await InputExecutor.executeMouseUp({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button,
          screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'wheel':
        await InputExecutor.executeMouseWheel({
          deltaY: inputData.deltaY || 0
        });
        break;
      case 'keydown':
        await InputExecutor.executeKeyDown({
          key: inputData.key
        });
        break;
      case 'keyup':
        await InputExecutor.executeKeyUp({
          key: inputData.key
        });
        break;
      default:
        log('未知输入类型: ' + inputData.inputType);
    }
  } catch (e) {
    log('执行输入失败: ' + e.message)
  }
}

function simulateMouseMove(x, y) {
  log('模拟鼠标移动: ' + x + ', ' + y)
  InputExecutor.executeMouseMove({
    x: x,
    y: y,
    screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => log('执行鼠标移动失败: ' + e.message))
}

function simulateMouseDown(x, y, button) {
  log('模拟鼠标按下: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeMouseDown({
    x: x,
    y: y,
    button: button,
    screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => log('执行鼠标按下失败: ' + e.message))
}

function simulateMouseUp(x, y, button) {
  log('模拟鼠标释放: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeMouseUp({
    x: x,
    y: y,
    button: button,
    screenWidth: matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => log('执行鼠标释放失败: ' + e.message))
}

function simulateWheel(deltaY, deltaX) {
  log('模拟滚轮: deltaY=' + deltaY + ', deltaX=' + deltaX)
  InputExecutor.executeMouseWheel({
    deltaY: deltaY
  }).catch(e => log('执行滚轮失败: ' + e.message))
}

function simulateKeyDown(code, key, modifiers) {
  log('模拟键盘按下: ' + code + ', key: ' + key + 
      ', ctrl: ' + (modifiers.ctrlKey || false) +
      ', shift: ' + (modifiers.shiftKey || false) +
      ', alt: ' + (modifiers.altKey || false))
  InputExecutor.executeKeyDown({
    key: key
  }).catch(e => log('执行键盘按下失败: ' + e.message))
}

function simulateKeyUp(code, key, modifiers) {
  log('模拟键盘释放: ' + code + ', key: ' + key)
  InputExecutor.executeKeyUp({
    key: key
  }).catch(e => log('执行键盘释放失败: ' + e.message))
}

function sendControlCommand(command) {
  if (dataChannel && dataChannel.readyState === 'open') {
    const inputCommand = convertToInputCommand(command)
    log('发送控制命令: ' + JSON.stringify(inputCommand))
    dataChannel.send(JSON.stringify(inputCommand))
  } else {
    log('数据通道未打开，无法发送命令')
  }
}

function convertToInputCommand(command) {
  const inputCommand = {
    type: 'input',
    timestamp: Date.now()
  }
  
  switch (command.type) {
    case 'mousemove':
      inputCommand.inputType = 'mousemove'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      break
      
    case 'mousedown':
      inputCommand.inputType = 'mousedown'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'mouseup':
      inputCommand.inputType = 'mouseup'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'click':
      inputCommand.inputType = 'click'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'dblclick':
      inputCommand.inputType = 'dblclick'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'wheel':
      inputCommand.inputType = 'wheel'
      inputCommand.deltaY = command.deltaY || 0
      inputCommand.deltaX = command.deltaX || 0
      break
      
    case 'keydown':
    case 'keyup':
      inputCommand.inputType = command.type
      inputCommand.code = command.code
      inputCommand.key = command.key || getKeyFromCode(command.code)
      if (command.ctrlKey) inputCommand.ctrlKey = true
      if (command.shiftKey) inputCommand.shiftKey = true
      if (command.altKey) inputCommand.altKey = true
      if (command.metaKey) inputCommand.metaKey = true
      break
      
    default:
      log('convertToInputCommand: 未知命令类型 - ' + command.type + ', 直接发送')
      return command
  }
  
  return inputCommand
}

function normalizeCoordinate(value, maxValue = 65535) {
  if (value === undefined || value === null) return 0
  if (value >= 0 && value <= 1) return value
  if (value >= 0 && value <= maxValue) {
    return value / maxValue
  }
  return Math.max(0, Math.min(1, value / maxValue))
}

function normalizeButton(button) {
  if (typeof button === 'number') return button
  if (typeof button === 'string') {
    const lower = button.toLowerCase()
    if (lower === 'right') return 2
    if (lower === 'middle') return 1
  }
  return 0
}

function getKeyFromCode(code) {
  const keyMap = {
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
    'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e',
    'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j',
    'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o',
    'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't',
    'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z',
    'Space': ' ', 'Enter': 'Enter', 'Backspace': 'Backspace', 'Tab': 'Tab',
    'Escape': 'Escape', 'Delete': 'Delete', 'Insert': 'Insert',
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown', 'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
    'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.', 'Slash': '/',
    'Backquote': '`'
  }
  return keyMap[code] || code
}

let currentScale = 1
let lastTouchDistance = 0
let panX = 0
let panY = 0
let lastPanX = 0
let lastPanY = 0
let isPanning = false
let isFullscreen = false
let isFloatMode = false
let controlsHidden = false

function updateVideoTransformGlobal() {
  const remoteVideo = document.getElementById('remoteVideo')
  if (remoteVideo) {
    remoteVideo.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`
  }
}

function resetZoomAndPan() {
  if (matrixTransformer) {
      matrixTransformer.reset();
      const videoContainer = document.getElementById('videoContainer');
      if (videoContainer) {
          matrixTransformer.applyTransform(videoContainer);
      }
      showToast('已重置缩放和位置');
  } else {
      currentScale = 1;
      panX = 0;
      panY = 0;
      isZoomed = false;
      updateVideoTransformGlobal();
      showToast('已重置缩放和位置');
  }
}

let isPointerMode = false

function toggleMouseMode() {
    isPointerMode = !isPointerMode
    
    const mouseModeBtn = document.getElementById('mouseModeBtn')
    
    if (isPointerMode) {
        showFloatingMouse().catch(e => log('显示悬浮鼠标失败: ' + e.message))
        showToast('指针模式已开启')
        if (mouseModeBtn) {
            mouseModeBtn.style.background = '#667eea'
            mouseModeBtn.style.color = 'white'
        }
    } else {
        hideFloatingMouse().catch(e => log('隐藏悬浮鼠标失败: ' + e.message))
        showToast('指针模式已关闭')
        if (mouseModeBtn) {
            mouseModeBtn.style.background = ''
            mouseModeBtn.style.color = ''
        }
    }
}

function toggleControlsHide() {
  controlsHidden = !controlsHidden
  const controlOverlay = document.getElementById('controlOverlay')
  const controlToggle = document.getElementById('controlToggle')
  
  if (controlOverlay && controlToggle) {
    if (controlsHidden) {
      controlOverlay.classList.add('hidden')
      controlToggle.classList.add('visible')
      showToast('控制栏已隐藏')
    } else {
      controlOverlay.classList.remove('hidden')
      controlToggle.classList.remove('visible')
      showToast('控制栏已显示')
    }
  }
}

function showControls() {
  controlsHidden = false
  const controlOverlay = document.getElementById('controlOverlay')
  const controlToggle = document.getElementById('controlToggle')
  
  if (controlOverlay && controlToggle) {
    controlOverlay.classList.remove('hidden')
    controlToggle.classList.remove('visible')
  }
}

function handleOrientationChange() {
  const remoteScreen = document.getElementById('remoteScreen')
  const isLandscape = window.innerWidth > window.innerHeight
  
  if (remoteScreen && remoteScreen.classList.contains('active')) {
    if (isLandscape) {
      remoteScreen.classList.add('landscape-mode')
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    } else {
      remoteScreen.classList.remove('landscape-mode')
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
    
    if (dataChannel && dataChannel.readyState === 'open') {
      const rotation = isLandscape ? 90 : 0
      sendControlCommand({
        type: 'screen-rotation',
        rotation: rotation
      })
    }
    
    setTimeout(() => {
      const remoteScreen = document.getElementById('remoteScreen')
      const videoContainer = document.getElementById('videoContainer')
      const videoWrapper = document.getElementById('videoWrapper')
      
      if (remoteScreen && videoContainer && videoWrapper) {
        const screenRect = remoteScreen.getBoundingClientRect()
        
        if (matrixTransformer) {
          matrixTransformer.setScreenSize(screenRect.width, screenRect.height)
          matrixTransformer.reset()
          matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
          matrixTransformer.applyTransform(videoContainer)
        }
        
        if (inputDispatcher) {
          inputDispatcher.updateRemoteScreenRect()
        }
        
        log('横竖屏切换: 屏幕尺寸更新为 ' + screenRect.width + 'x' + screenRect.height)
      }
    }, 300)
  }
}

async function showFloatingMouse() {
  try {
    // 先检查权限
    const permResult = await FloatingMouse.hasPermission()
    log('悬浮窗权限状态: ' + (permResult.granted ? '已授权' : '未授权'))
    
    if (!permResult.granted) {
      log('正在请求悬浮窗权限...')
      const requestResult = await FloatingMouse.requestPermission()
      if (!requestResult.granted) {
        showToast('请在设置中开启悬浮窗权限')
        return
      }
    }
    
    const result = await FloatingMouse.show()
    if (result.success) {
      log('悬浮鼠标已显示')
    } else {
      log('显示悬浮鼠标失败: ' + result.error)
      if (result.needPermission) {
        showToast('需要悬浮窗权限')
      } else if (result.needStartService) {
        log('服务未启动，正在启动...')
        await FloatingMouse.startService()
        await FloatingMouse.show()
      }
    }
  } catch (e) {
    log('显示悬浮鼠标失败: ' + e.message)
  }
}

async function hideFloatingMouse() {
  try {
    await FloatingMouse.hide()
    log('悬浮鼠标已隐藏')
  } catch (e) {
    log('隐藏悬浮鼠标失败: ' + e.message)
  }
}

function handleFloatingMouseEvent(event) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    log('数据通道未打开，无法发送鼠标事件')
    return
  }
  
  log('handleFloatingMouseEvent: 收到事件 - type=' + event.type + ', x=' + event.x + ', y=' + event.y + ', button=' + event.button);
  
  if (matrixTransformer && inputDispatcher) {
      log('handleFloatingMouseEvent: 使用 InputDispatcher');
      inputDispatcher.dispatchFloatingMouseInput(
          event.x,
          event.y,
          event.type,
          event.button,
          event.delta || 0
      );
  } else {
      log('handleFloatingMouseEvent: InputDispatcher 未初始化，使用旧逻辑');
      
      const videoContainer = document.getElementById('videoContainer')
      if (!videoContainer) {
        log('handleFloatingMouseEvent: 找不到 videoContainer')
        return
      }
      
      const containerRect = videoContainer.getBoundingClientRect()
      
      const screenX = event.x
      const screenY = event.y
      
      const pixelX = screenX - containerRect.left
      const pixelY = screenY - containerRect.top
      
      const x = Math.round(pixelX / containerRect.width * 65535)
      const y = Math.round(pixelY / containerRect.height * 65535)
      
      log('handleFloatingMouseEvent: 旧逻辑坐标 - x=' + x + ', y=' + y)
      
      const inputCommand = {
        type: 'input',
        timestamp: Date.now()
      }
      
      switch (event.type) {
        case 'mousemove':
          inputCommand.inputType = 'mousemove'
          inputCommand.x = x
          inputCommand.y = y
          break
          
        case 'mousedown':
          inputCommand.inputType = 'mousedown'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'mouseup':
          inputCommand.inputType = 'mouseup'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'wheel':
          inputCommand.inputType = 'wheel'
          inputCommand.deltaY = event.delta
          break
          
        case 'dblclick':
          inputCommand.inputType = 'dblclick'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'dragstart':
          inputCommand.inputType = 'mousedown'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'dragend':
          inputCommand.inputType = 'mouseup'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        default:
          return
      }
      
      dataChannel.send(JSON.stringify(inputCommand))
      log('handleFloatingMouseEvent: 已发送命令 - ' + JSON.stringify(inputCommand))
  }
}

function toggleFullscreen() {
  const remoteScreen = document.getElementById('remoteScreen')
  const remoteVideo = document.getElementById('remoteVideo')
  
  if (!isFullscreen) {
    if (remoteScreen.requestFullscreen) {
      remoteScreen.requestFullscreen()
    } else if (remoteScreen.webkitRequestFullscreen) {
      remoteScreen.webkitRequestFullscreen()
    } else if (remoteScreen.msRequestFullscreen) {
      remoteScreen.msRequestFullscreen()
    }
    remoteScreen.classList.add('fullscreen-mode')
    remoteVideo.classList.add('fullscreen')
    isFullscreen = true
    showToast('全屏模式已开启')
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen()
    }
    remoteScreen.classList.remove('fullscreen-mode')
    remoteVideo.classList.remove('fullscreen')
    isFullscreen = false
    showToast('已退出全屏')
  }
}

window.addEventListener('orientationchange', handleOrientationChange)
window.addEventListener('resize', () => {
  if (window.innerWidth > window.innerHeight) {
    log('横屏检测')
  }
})

function setupRemoteScreenInteraction() {
    log('初始化远程屏幕交互...')
    
    const remoteScreen = document.getElementById('remoteScreen');
    const videoContainer = document.getElementById('videoContainer');
    const videoWrapper = document.getElementById('videoWrapper');
    
    if (!remoteScreen || !videoContainer) {
        log('错误：找不到 remoteScreen 或 videoContainer 元素');
        return;
    }
    
    const screenRect = remoteScreen.getBoundingClientRect();
    log('屏幕尺寸: ' + screenRect.width + 'x' + screenRect.height);
    
    matrixTransformer = new MatrixTransformer();
    matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
    
    videoContainer.style.width = screenRect.width + 'px';
    videoContainer.style.height = screenRect.height + 'px';
    videoContainer.style.left = '0px';
    videoContainer.style.top = '0px';
    
    if (videoWrapper) {
        videoWrapper.style.width = '100%';
        videoWrapper.style.height = '100%';
        videoWrapper.style.left = '0px';
        videoWrapper.style.top = '0px';
    }
    
    log('初始化 videoContainer 填满屏幕: ' + screenRect.width + 'x' + screenRect.height);
    
    inputDispatcher = new InputDispatcher(matrixTransformer);
    
    gestureHandler = new GestureHandler(
        matrixTransformer,
        inputDispatcher,
        null
    );
    
    const isTouchOnUI = (x, y) => {
        const controlOverlay = document.getElementById('controlOverlay');
        const controlToggle = document.getElementById('controlToggle');
        const statsOverlay = document.getElementById('statsOverlay');
        const keyboardOverlay = document.getElementById('keyboardOverlay');
        
        const uiElements = [controlOverlay, controlToggle, statsOverlay, keyboardOverlay];
        
        for (const element of uiElements) {
            if (element && element.style.display !== 'none') {
                const rect = element.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    log('触摸在 UI 元素上: ' + element.id);
                    return true;
                }
            }
        }
        
        return false;
    };
    
    window.isTouchOnUI = isTouchOnUI;
    
    let isMiddleButtonDown = false;
    
    remoteScreen.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            isMiddleButtonDown = true;
            e.preventDefault();
        }
    });
    
    remoteScreen.addEventListener('mouseup', (e) => {
        if (e.button === 1) {
            isMiddleButtonDown = false;
            e.preventDefault();
        }
    });
    
    remoteScreen.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (isTouchOnUI(touch.clientX, touch.clientY)) {
            return;
        }
        e.preventDefault();
        gestureHandler.handleTouchStart(e);
    }, { passive: false });
    
    remoteScreen.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (isTouchOnUI(touch.clientX, touch.clientY)) {
            return;
        }
        e.preventDefault();
        gestureHandler.handleTouchMove(e);
    }, { passive: false });
    
    remoteScreen.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        if (isTouchOnUI(touch.clientX, touch.clientY)) {
            return;
        }
        gestureHandler.handleTouchEnd(e);
    }, { passive: false });
    
    remoteScreen.addEventListener('touchcancel', (e) => {
        gestureHandler.handleTouchEnd(e);
    }, { passive: false });
    
    remoteScreen.addEventListener('wheel', (e) => {
        if (isTouchOnUI(e.clientX, e.clientY)) {
            return;
        }
        
        e.preventDefault();
        
        const deltaX = e.deltaX || 0;
        const deltaY = e.deltaY || 0;
        
        if (e.ctrlKey || isMiddleButtonDown) {
            const scaleDelta = deltaY > 0 ? 0.9 : 1.1;
            const newScale = matrixTransformer.scale * scaleDelta;
            matrixTransformer.updateScale(newScale, e.clientX, e.clientY);
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                matrixTransformer.applyTransform(videoContainer);
            }
            log('缩放: scale=' + newScale.toFixed(2) + ', center=(' + e.clientX + ', ' + e.clientY + ')');
        } else {
            inputDispatcher.dispatchTouchInput(
                e.clientX,
                e.clientY,
                'wheel',
                0,
                deltaY
            );
        }
    }, { passive: false });
    
    remoteScreen.addEventListener('contextmenu', (e) => {
        if (isTouchOnUI(e.clientX, e.clientY)) {
            return;
        }
        e.preventDefault();
        return false;
    });
    
    remoteScreen.addEventListener('selectstart', (e) => {
        if (isTouchOnUI(e.clientX, e.clientY)) {
            return;
        }
        e.preventDefault();
        return false;
    });
    
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        log('remoteVideo 元素已找到');
    }
    
    log('远程屏幕交互已初始化 - 事件绑定在 remoteScreen 层，已添加 UI 检测');
}

function updateScreenSize(width, height, scaleFactor, workArea) {
    log('收到远程屏幕尺寸: ' + width + 'x' + height + ', scaleFactor=' + scaleFactor);
    
    if (matrixTransformer) {
        matrixTransformer.setRemoteScreenSize(width, height);
        
        if (scaleFactor) {
            matrixTransformer.scaleFactor = scaleFactor;
        }
        if (workArea) {
            matrixTransformer.workArea = workArea;
        }
        
        const videoContainer = document.getElementById('videoContainer');
        const videoWrapper = document.getElementById('videoWrapper');
        const remoteVideo = document.getElementById('remoteVideo');
        const remoteScreen = document.getElementById('remoteScreen');
        
        if (videoContainer && videoWrapper && remoteScreen) {
            // 重置缩放和平移
            matrixTransformer.reset();
            
            // 更新本地屏幕尺寸
            const screenRect = remoteScreen.getBoundingClientRect();
            matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
            
            // 设置视频尺寸（优先使用实际视频尺寸）
            if (remoteVideo && remoteVideo.videoWidth > 0) {
                matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
                log('使用视频尺寸: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
            } else {
                // 如果视频还没加载，使用远程屏幕尺寸作为视频尺寸
                matrixTransformer.setVideoSize(width, height);
                log('使用远程屏幕尺寸作为视频尺寸: ' + width + 'x' + height);
            }
            
            // 立即应用容器尺寸（类似横屏后的重构）
            matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
            
            log('调整 videoContainer: ' + matrixTransformer.displayWidth + 'x' + matrixTransformer.displayHeight +
                ', 位置 (' + matrixTransformer.displayX + ', ' + matrixTransformer.displayY + ')');
            
            // 多次延迟重构，确保视频加载后正确调整
            [100, 300, 500, 1000].forEach(delay => {
                setTimeout(() => {
                    if (remoteVideo && remoteVideo.videoWidth > 0) {
                        matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
                        matrixTransformer.setScreenSize(remoteScreen.getBoundingClientRect().width, remoteScreen.getBoundingClientRect().height);
                        matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
                        log('延迟' + delay + 'ms重构容器尺寸: ' + matrixTransformer.displayWidth + 'x' + matrixTransformer.displayHeight);
                    }
                }, delay);
            });
        }
    }
}

async function handleOffer(data) {
  incomingFromDeviceId = data.fromDeviceId || incomingFromDeviceId
  currentSessionId = data.sessionId
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
  
  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)
  
  socket.emit('answer', {
    sessionId: currentSessionId,
    answer: answer,
    toDeviceId: incomingFromDeviceId
  })
}

async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
}

async function handleIceCandidate(data) {
  if (data.candidate && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

function showRemoteScreen() {
  if (matrixTransformer) {
      matrixTransformer.fullReset();
  }
  
  document.getElementById('mainContainer').style.display = 'none'
  document.getElementById('remoteScreen').classList.add('active')
  startStatsMonitoring()
  
  setTimeout(() => {
      setupRemoteScreenInteraction();
      // 额外延迟后再次更新尺寸，确保视频加载后正确调整
      setTimeout(() => {
          updateContainerSizeAfterVideoLoad();
      }, 500);
  }, 100);
}

function updateContainerSizeAfterVideoLoad() {
  log('更新容器尺寸（视频加载后）');
  const remoteVideo = document.getElementById('remoteVideo');
  const videoContainer = document.getElementById('videoContainer');
  const videoWrapper = document.getElementById('videoWrapper');
  const remoteScreen = document.getElementById('remoteScreen');
  
  if (!remoteVideo || !videoContainer || !videoWrapper || !remoteScreen) {
      log('缺少必要元素，跳过尺寸更新');
      return;
  }
  
  // 更新屏幕尺寸
  const screenRect = remoteScreen.getBoundingClientRect();
  if (matrixTransformer) {
      matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
      
      // 如果视频有尺寸，更新视频尺寸
      if (remoteVideo.videoWidth > 0 && remoteVideo.videoHeight > 0) {
          matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
          log('视频尺寸: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
      }
      
      // 应用容器尺寸
      matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
      log('容器尺寸已更新: ' + matrixTransformer.displayWidth + 'x' + matrixTransformer.displayHeight);
  }
}

function hideRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'block'
  document.getElementById('remoteScreen').classList.remove('active')
  const remoteVideo = document.getElementById('remoteVideo')
  remoteVideo.srcObject = null
  stopStatsMonitoring()
}

let statsInterval = null

function startStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval)
  }
  
  statsInterval = setInterval(async () => {
    const pc = directPeerConnection || peerConnection
    if (!pc) return
    
    try {
      const stats = await pc.getStats()
      let videoStats = null
      let candidatePairStats = null
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          videoStats = report
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          candidatePairStats = report
        }
      })
      
      if (videoStats) {
        const width = videoStats.frameWidth || 0
        const height = videoStats.frameHeight || 0
        const fps = videoStats.framesPerSecond || 0
        const bitrate = videoStats.bytesReceived || 0
        
        document.getElementById('statsResolution').textContent = 
          width > 0 ? `${width}x${height}` : '-'
        document.getElementById('statsFps').textContent = 
          fps > 0 ? `${fps} fps` : '-'
        
        if (videoStats.lastStatsTime) {
          const timeDiff = (Date.now() - videoStats.lastStatsTime) / 1000
          const bytesDiff = bitrate - (videoStats.lastBytesReceived || 0)
          const bitrateMbps = ((bytesDiff * 8) / timeDiff / 1000000).toFixed(2)
          document.getElementById('statsBitrate').textContent = `${bitrateMbps} Mbps`
        }
        
        videoStats.lastStatsTime = Date.now()
        videoStats.lastBytesReceived = bitrate
      }
      
      if (candidatePairStats) {
        const rtt = candidatePairStats.currentRoundTripTime
        if (rtt !== undefined) {
          const latencyMs = (rtt * 1000).toFixed(0)
          document.getElementById('statsLatency').textContent = `${latencyMs} ms`
        }
      }
    } catch (error) {
      console.error('获取统计信息失败:', error)
    }
  }, 1000)
}

function stopStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}

let keyboardVisible = false
let currentKeyboardPosition = 'bottom'
let currentKeyboardSize = 'medium'
let currentKeyboardOpacity = '100'
let keyboardPositions = ['bottom', 'top', 'center', 'left', 'right']
let keyboardSizes = ['small', 'medium', 'large']
let keyboardOpacities = ['100', '80', '60', '40']
let isDraggingKeyboard = false
let dragStartX = 0
let dragStartY = 0
let dragStartLeft = 0
let dragStartTop = 0
let activeModifiers = {
  Control: false,
  Shift: false,
  Alt: false,
  Meta: false,
  CapsLock: false
}

function cycleKeyboardPosition() {
  const currentIndex = keyboardPositions.indexOf(currentKeyboardPosition)
  const nextIndex = (currentIndex + 1) % keyboardPositions.length
  currentKeyboardPosition = keyboardPositions[nextIndex]
  applyKeyboardPosition()
  const positionNames = {
    'bottom': '底部',
    'top': '顶部',
    'center': '中间',
    'left': '左侧',
    'right': '右侧'
  }
  showToast(`键盘位置: ${positionNames[currentKeyboardPosition]}`)
  saveKeyboardSettings()
}

function cycleKeyboardSize() {
  const currentIndex = keyboardSizes.indexOf(currentKeyboardSize)
  const nextIndex = (currentIndex + 1) % keyboardSizes.length
  currentKeyboardSize = keyboardSizes[nextIndex]
  applyKeyboardSize()
  const sizeNames = {
    'small': '小',
    'medium': '中',
    'large': '大'
  }
  showToast(`键盘大小: ${sizeNames[currentKeyboardSize]}`)
  saveKeyboardSettings()
}

function cycleKeyboardOpacity() {
  const currentIndex = keyboardOpacities.indexOf(currentKeyboardOpacity)
  const nextIndex = (currentIndex + 1) % keyboardOpacities.length
  currentKeyboardOpacity = keyboardOpacities[nextIndex]
  applyKeyboardOpacity()
  showToast(`键盘透明度: ${currentKeyboardOpacity}%`)
  saveKeyboardSettings()
}

function applyKeyboardPosition() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  if (!keyboardOverlay) return
  
  keyboardPositions.forEach(pos => {
    keyboardOverlay.classList.remove(`position-${pos}`)
  })
  keyboardOverlay.classList.add(`position-${currentKeyboardPosition}`)
}

function applyKeyboardSize() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  if (!keyboardOverlay) return
  
  keyboardSizes.forEach(size => {
    keyboardOverlay.classList.remove(`size-${size}`)
  })
  keyboardOverlay.classList.add(`size-${currentKeyboardSize}`)
}

function applyKeyboardOpacity() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const controlOverlay = document.getElementById('controlOverlay')
  
  if (keyboardOverlay) {
    keyboardOpacities.forEach(opacity => {
      keyboardOverlay.classList.remove(`opacity-${opacity}`)
    })
    keyboardOverlay.classList.add(`opacity-${currentKeyboardOpacity}`)
  }
  
  if (controlOverlay) {
    keyboardOpacities.forEach(opacity => {
      controlOverlay.classList.remove(`opacity-${opacity}`)
    })
    controlOverlay.classList.add(`opacity-${currentKeyboardOpacity}`)
  }
}

function saveKeyboardSettings() {
  try {
    localStorage.setItem('ycdesk_keyboard_position', currentKeyboardPosition)
    localStorage.setItem('ycdesk_keyboard_size', currentKeyboardSize)
    localStorage.setItem('ycdesk_keyboard_opacity', currentKeyboardOpacity)
  } catch (e) {
    console.log('保存键盘设置失败:', e)
  }
}

function loadKeyboardSettings() {
  try {
    const savedPosition = localStorage.getItem('ycdesk_keyboard_position')
    const savedSize = localStorage.getItem('ycdesk_keyboard_size')
    const savedOpacity = localStorage.getItem('ycdesk_keyboard_opacity')
    
    if (savedPosition && keyboardPositions.includes(savedPosition)) {
      currentKeyboardPosition = savedPosition
    }
    if (savedSize && keyboardSizes.includes(savedSize)) {
      currentKeyboardSize = savedSize
    }
    if (savedOpacity && keyboardOpacities.includes(savedOpacity)) {
      currentKeyboardOpacity = savedOpacity
    }
  } catch (e) {
    console.log('加载键盘设置失败:', e)
  }
}

function setupKeyboardDrag() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const dragHandle = document.getElementById('keyboardDragHandle')
  
  if (!keyboardOverlay || !dragHandle) return
  
  dragHandle.addEventListener('touchstart', (e) => {
    if (currentKeyboardPosition === 'center') {
      isDraggingKeyboard = true
      const touch = e.touches[0]
      dragStartX = touch.clientX
      dragStartY = touch.clientY
      
      const rect = keyboardOverlay.getBoundingClientRect()
      dragStartLeft = rect.left
      dragStartTop = rect.top
      
      e.preventDefault()
    }
  }, { passive: false })
  
  document.addEventListener('touchmove', (e) => {
    if (!isDraggingKeyboard) return
    
    const touch = e.touches[0]
    const deltaX = touch.clientX - dragStartX
    const deltaY = touch.clientY - dragStartY
    
    let newLeft = dragStartLeft + deltaX
    let newTop = dragStartTop + deltaY
    
    const maxLeft = window.innerWidth - keyboardOverlay.offsetWidth
    const maxTop = window.innerHeight - keyboardOverlay.offsetHeight
    
    newLeft = Math.max(0, Math.min(maxLeft, newLeft))
    newTop = Math.max(0, Math.min(maxTop, newTop))
    
    keyboardOverlay.style.left = `${newLeft}px`
    keyboardOverlay.style.top = `${newTop}px`
    keyboardOverlay.style.transform = 'none'
    
    e.preventDefault()
  }, { passive: false })
  
  document.addEventListener('touchend', () => {
    isDraggingKeyboard = false
  })
}

function toggleKeyboard() {
  keyboardVisible = !keyboardVisible
  console.log('toggleKeyboard called, keyboardVisible=' + keyboardVisible)
  
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const remoteScreen = document.getElementById('remoteScreen')
  
  if (keyboardVisible) {
    loadKeyboardSettings()
    applyKeyboardPosition()
    applyKeyboardSize()
    applyKeyboardOpacity()
    
    if (currentKeyboardPosition !== 'center') {
      keyboardOverlay.style.left = ''
      keyboardOverlay.style.top = ''
      keyboardOverlay.style.transform = ''
    }
    
    if (keyboardOverlay) {
      keyboardOverlay.classList.add('active')
    }
    if (remoteScreen) {
      remoteScreen.classList.add('keyboard-visible')
    }
    showToast('键盘已打开')
    console.log('HTML键盘已打开')
  } else {
    if (keyboardOverlay) {
      keyboardOverlay.classList.remove('active')
    }
    if (remoteScreen) {
      remoteScreen.classList.remove('keyboard-visible')
    }
    showToast('键盘已关闭')
    console.log('HTML键盘已关闭')
  }
}

function sendKey(keyCode) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    console.error('数据通道未打开，无法发送按键')
    showToast('数据通道未打开')
    return
  }
  
  const event = {
    type: 'keydown',
    code: keyCode,
    key: getKeyFromCode(keyCode),
    ctrlKey: activeModifiers.Control,
    shiftKey: activeModifiers.Shift,
    altKey: activeModifiers.Alt,
    metaKey: activeModifiers.Meta
  }
  
  console.log('发送键盘事件:', JSON.stringify(event))
  sendControlCommand(event)
  
  setTimeout(() => {
    sendControlCommand({
      type: 'keyup',
      code: keyCode,
      key: getKeyFromCode(keyCode),
      ctrlKey: activeModifiers.Control,
      shiftKey: activeModifiers.Shift,
      altKey: activeModifiers.Alt,
      metaKey: activeModifiers.Meta
    })
  }, 50)
  
  if (activeModifiers.Shift) {
    toggleModifier('Shift')
  }
}

function toggleModifier(modifier) {
  activeModifiers[modifier] = !activeModifiers[modifier]
  
  const keyIds = {
    'Control': ['keyControl', 'keyControl2'],
    'Shift': ['keyShift', 'keyShift2'],
    'Alt': ['keyAlt', 'keyAlt2'],
    'Meta': ['keyMeta'],
    'CapsLock': ['keyCapsLock']
  }
  
  const ids = keyIds[modifier] || []
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      if (activeModifiers[modifier]) {
        el.classList.add('active')
      } else {
        el.classList.remove('active')
      }
    }
  })
  
  showToast(`${modifier} ${activeModifiers[modifier] ? '已按下' : '已释放'}`)
}

function disconnect() {
  if (confirm('确定要断开连接吗？')) {
    stopHeartbeat()
    hideFloatingMouse()
    if (dataChannel) {
      dataChannel.close()
      dataChannel = null
    }
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }
    if (directPeerConnection) {
      directPeerConnection.close()
      directPeerConnection = null
    }
    if (currentDirectClientId) {
      TCPSocket.disconnect({ clientId: currentDirectClientId })
      currentDirectClientId = null
    }
    isConnected = false
    isController = false
    keyboardVisible = false
    const keyboardOverlay = document.getElementById('keyboardOverlay')
    if (keyboardOverlay) keyboardOverlay.classList.remove('active')
    
    if (matrixTransformer) {
        matrixTransformer.fullReset()
    }
    
    hideRemoteScreen()
    showToast('已断开连接')
  }
}

async function init() {
  console.log('YCDesk Android 初始化')
  
  try {
    const deviceInfo = await Device.getInfo()
    console.log('设备信息:', deviceInfo)
  } catch (e) {
    console.log('获取设备信息失败')
  }
  
  myDeviceId = generateDeviceId()
  
  const networkStatus = await Network.getStatus()
  console.log('网络状态:', networkStatus)
  
  Network.addListener('networkStatusChange', (status) => {
    console.log('网络状态变化:', status)
    if (!status.connected) {
      showToast('网络已断开')
      if (connectionStatus === CONNECTION_STATUS.CONNECTED) {
        attemptReconnect()
      }
    }
  })
  
  App.addListener('backButton', ({ canGoBack }) => {
    if (isConnected) {
      disconnect()
    } else if (currentRole) {
      goBack()
    } else {
      App.exitApp()
    }
  })
  
  window.addEventListener('orientationchange', handleOrientationChange)
  window.addEventListener('resize', handleOrientationChange)
  
  setupKeyboardDrag()
  
  console.log('初始化完成，设备ID:', myDeviceId)
}

document.addEventListener('DOMContentLoaded', init)

window.selectRole = selectRole
window.goBack = goBack
window.switchControllerMode = switchControllerMode
window.switchControlledMode = switchControlledMode
window.copyDeviceId = copyDeviceId
window.connectDevice = connectDevice
window.connectDirect = connectDirect
window.toggleKeyboard = toggleKeyboard
window.cycleKeyboardPosition = cycleKeyboardPosition
window.cycleKeyboardSize = cycleKeyboardSize
window.cycleKeyboardOpacity = cycleKeyboardOpacity
window.toggleMouseMode = toggleMouseMode
window.toggleFullscreen = toggleFullscreen
window.toggleControlsHide = toggleControlsHide
window.showControls = showControls
window.resetZoomAndPan = resetZoomAndPan
window.sendKey = sendKey
window.toggleModifier = toggleModifier
window.disconnect = disconnect
window.manualConnectToServer = manualConnectToServer
window.disconnectFromServer = disconnectFromServer
window.controlledConnectToServer = controlledConnectToServer
window.controlledDisconnectFromServer = controlledDisconnectFromServer
window.startListening = startListening
window.stopListening = stopListening
window.acceptConnection = acceptConnection
window.rejectConnection = rejectConnection
window.deleteFromHistory = deleteFromHistory
window.reconnectFromHistory = reconnectFromHistory

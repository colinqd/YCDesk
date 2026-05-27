import s from './state.js'
import TouchGestureManager from '../shared/gestures/touch-gesture-manager.js'

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
        
        if (remoteScreen) {
            this.remoteScreenRect = remoteScreen.getBoundingClientRect();
        } else {
            this.remoteScreenRect = null;
        }
        
        if (videoContainer) {
            this.videoContainerRect = videoContainer.getBoundingClientRect();
        } else {
            this.videoContainerRect = null;
        }
    }
    
    dispatchTouchInput(containerX, containerY, type, button = 0, delta = 0) {
        const now = Date.now()
        if (now - this.lastInputTime < this.inputThrottleMs && type === 'mousemove') {
            return
        }
        this.lastInputTime = now

        if (type === 'wheel') {
            this.sendInputCommand({
                type: 'wheel',
                deltaY: delta
            })
            return
        }

        const videoContainer = document.getElementById('videoContainer')
        if (!videoContainer) return

        const rect = videoContainer.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        const localX = containerX - rect.left
        const localY = containerY - rect.top

        const normalizedX = localX / rect.width
        const normalizedY = localY / rect.height

        if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
            return
        }

        this.sendInputCommand({
            type: type,
            x: normalizedX,
            y: normalizedY,
            button: button
        })
    }
    
    sendInputCommand(command) {
        const inputCommand = convertToInputCommand(command);
        const message = JSON.stringify(inputCommand);

        const inputReady = s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open';
        const dataReady = s.dataChannel && s.dataChannel.readyState === 'open';

        if (!inputReady && !dataReady) {
            if (!this._lastNoChannelWarn || Date.now() - this._lastNoChannelWarn > 1000) {
                this._lastNoChannelWarn = Date.now();
                const log = typeof window.log === 'function' ? window.log : console.log;
                log('[INPUT] 输入通道均未就绪! inputReady=' + inputReady + ' dataReady=' + dataReady);
            }
            return;
        }

        if (inputReady) {
            if (s.inputChannel.bufferedAmount < 65536) {
                s.inputChannel.send(message);
            } else {
                s.dataChannel.send(message);
            }
        } else if (dataReady) {
            s.dataChannel.send(message);
        }
    }
}

function createGestureHandler(transformer, inputDispatcher) {
    if (TouchGestureManager) {
        return new TouchGestureManager({
            transformer: transformer,
            sendInput: (x, y, type, button, delta) => {
                if (inputDispatcher) {
                    inputDispatcher.dispatchTouchInput(x, y, type, button, delta);
                }
            },
            applyTransform: () => {
                const videoContainer = document.getElementById('videoContainer');
                if (videoContainer && transformer) {
                    transformer.applyTransform(videoContainer);
                }
            },
            onToggleUI: () => {
                if (typeof window.toggleControlsHide === 'function') {
                    window.toggleControlsHide();
                }
            },
            vibrate: (pattern) => {
                if (navigator.vibrate) {
                    navigator.vibrate(pattern);
                }
            },
            isTouchOnUI: (x, y) => {
                if (window.isTouchOnUI) {
                    return window.isTouchOnUI(x, y);
                }
                return false;
            },
            logger: (message) => {
                if (typeof window.log === 'function') {
                    window.log('[Gesture] ' + message);
                }
            }
        });
    }
    
    return new GestureHandler(transformer, inputDispatcher, null);
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
        }
    }
    
    handleSingleTouchStart(touch) {
        const now = Date.now();
        const timeSinceLastTap = now - this.lastTapTime;
        this.lastTapTime = now;
        
        this.isDragging = false;
        this.isLongPress = false;
        this.isScrolling = false;
        this.isPanning = false;
        
        this.dragStartX = touch.clientX;
        this.dragStartY = touch.clientY;
        this.lastMouseX = touch.clientX;
        this.lastMouseY = touch.clientY;
        
        if (timeSinceLastTap < 300) {
            this.sendDoubleClick(touch.clientX, touch.clientY);
            return;
        }
        
        this.longPressTimer = setTimeout(() => {
            this.isLongPress = true;
            this.sendMouseDown(touch.clientX, touch.clientY, 2);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    }
    
    handleTwoTouchStart(touch1, touch2) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        this.isPinching = true;
        this.initialPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        this.initialScale = this.transformer.scale;
        this.pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        this.pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
        this.panStartX = this.pinchCenterX;
        this.panStartY = this.pinchCenterY;
        this.initialPanX = this.transformer.panX;
        this.initialPanY = this.transformer.panY;
        this.isScrolling = false;
        this.isPanning = false;
    }
    
    handleTouchMove(event) {
        const touchCount = event.touches.length;
        
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            const pointerId = touch.identifier;
            if (this.touches.has(pointerId)) {
                this.touches.set(pointerId, {
                    ...this.touches.get(pointerId),
                    x: touch.clientX,
                    y: touch.clientY
                });
            }
        }
        
        if (touchCount === 1 && !this.isPinching) {
            this.handleSingleTouchMove(event.touches[0]);
        } else if (touchCount === 2) {
            this.handleTwoTouchMove(event.touches[0], event.touches[1]);
        }
    }
    
    handleSingleTouchMove(touch) {
        if (this.isLongPress) {
            this.sendMouseMove(touch.clientX, touch.clientY);
            return;
        }
        
        if (this.longPressTimer) {
            const distance = Math.hypot(
                touch.clientX - this.dragStartX,
                touch.clientY - this.dragStartY
            );
            
            if (distance > 10) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
                this.isDragging = true;
                this.sendMouseDown(touch.clientX, touch.clientY, 0);
            }
        }
        
        if (this.isDragging) {
            this.sendMouseMove(touch.clientX, touch.clientY);
        }
        
        this.lastMouseX = touch.clientX;
        this.lastMouseY = touch.clientY;
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
        } else if (Math.abs(deltaY) > 10 && Math.abs(deltaX) < 20 && !this.isPanning) {
            this.isScrolling = true;
            const scrollDelta = -deltaY * 2;
            this.sendWheel(scrollDelta);
            this.panStartY = currentCenterY;
            this.scrollStartY = currentCenterY;
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
        } else if (this.isDragging) {
            this.sendMouseUp(touch.clientX, touch.clientY, 0);
        } else if (distance < 15 && duration < 300) {
            const now = Date.now();
            this.sendMouseDown(touch.clientX, touch.clientY, 0);
            this.sendMouseUp(touch.clientX, touch.clientY, 0);
        }
        
        this.isLongPress = false;
        this.isDragging = false;
    }
    
    sendMouseDown(x, y, button) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mousedown', button);
        }
    }
    
    sendMouseUp(x, y, button) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mouseup', button);
        }
    }
    
    sendMouseMove(x, y) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'mousemove', 0);
        }
    }
    
    sendDoubleClick(x, y) {
        if (this.inputDispatcher) {
            this.inputDispatcher.dispatchTouchInput(x, y, 'dblclick', 0);
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
    case 'doubleclick':
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
      
    case 'unlock_screen':
      inputCommand.inputType = 'unlock_screen'
      inputCommand.password = command.password || ''
      break
      
    case 'lock_screen':
      inputCommand.inputType = 'lock_screen'
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

    case 'text':
      inputCommand.inputType = 'text_input'
      inputCommand.text = command.text || ''
      break
      
    default:
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
    'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y',
    'KeyZ': 'z',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5',
    'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10',
    'F11': 'F11', 'F12': 'F12',
    'Escape': 'Escape', 'Tab': 'Tab', 'CapsLock': 'CapsLock',
    'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
    'ControlLeft': 'Control', 'ControlRight': 'Control',
    'AltLeft': 'Alt', 'AltRight': 'Alt',
    'Space': ' ', 'Enter': 'Enter', 'Backspace': 'Backspace',
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    'Delete': 'Delete', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'Insert': 'Insert',
    'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3', 'Numpad4': '4',
    'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
    'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadMultiply': '*',
    'NumpadDivide': '/', 'NumpadEnter': 'Enter', 'NumpadDecimal': '.',
    'Backquote': '`', 'Minus': '-', 'Equal': '=',
    'BracketLeft': '[', 'BracketRight': ']', 'Backslash': '\\',
    'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.', 'Slash': '/'
  }
  return keyMap[code] || code
}

export {
  InputDispatcher,
  GestureHandler,
  createGestureHandler,
  convertToInputCommand,
  normalizeCoordinate,
  normalizeButton,
  getKeyFromCode
}

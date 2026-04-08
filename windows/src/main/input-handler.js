const { screen } = require('electron')
const { validateInputCommand, parseInputCommand, INPUT_TYPES, isDeltaInputType, isBatchInputType } = require('../../shared/input-protocol')

let robot = null
let logger = null
let initialized = false
let cursorHidden = false
let hiddenCursorX = 0
let hiddenCursorY = 0

function initLogger(logInstance) {
  logger = logInstance
  if (!initialized) {
    initialized = true
    initRobot()
  }
}

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  } else if (level === 'error') {
    console.error('[输入控制]', message, data || '')
  }
}

function initRobot() {
  log('info', '正在初始化输入控制...')
  
  try {
    robot = require('robotjs')
    log('info', 'robotjs 加载成功!')
    const pos = robot.getMousePos()
    currentMouseX = pos.x
    currentMouseY = pos.y
  } catch (e) {
    log('error', '无法加载 robotjs:', e.message)
    robot = null
  }
}

let currentMouseX = 0
let currentMouseY = 0
let pressedModifiers = {
  Control: false,
  Shift: false,
  Alt: false,
  Meta: false
}
let pressedButtons = {
  left: false,
  right: false,
  middle: false
}
let pressedKeys = new Set()

const INPUT_RATE_LIMIT = {
  mousemove: { interval: 8, lastTime: 0 },
  mousemove_delta: { interval: 8, lastTime: 0 },
  wheel: { interval: 16, lastTime: 0 },
  wheel_batch: { interval: 16, lastTime: 0 },
  default: { interval: 0, lastTime: 0 }
}

function checkRateLimit(inputType) {
  const limit = INPUT_RATE_LIMIT[inputType] || INPUT_RATE_LIMIT.default
  if (limit.interval === 0) return true
  
  const now = Date.now()
  if (now - limit.lastTime < limit.interval) {
    return false
  }
  limit.lastTime = now
  return true
}

function updateNetworkLatency(latency) {
}

const BUTTON_MAP = {
  0: 'left',
  1: 'middle', 
  2: 'right'
}

const KEY_CODE_MAP = {
  'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e',
  'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j',
  'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o',
  'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't',
  'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z',
  'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
  'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
  'Space': 'space',
  'Enter': 'enter',
  'Backspace': 'backspace',
  'Tab': 'tab',
  'Escape': 'escape',
  'Delete': 'delete',
  'Insert': 'insert',
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
  'Home': 'home',
  'End': 'end',
  'PageUp': 'pageup',
  'PageDown': 'pagedown',
  'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5', 'F6': 'f6',
  'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
  'Minus': '-', 'Equal': '=',
  'BracketLeft': '[', 'BracketRight': ']',
  'Backslash': '\\', 'Semicolon': ';', 'Quote': "'",
  'Comma': ',', 'Period': '.', 'Slash': '/',
  'Backquote': '`',
  'Numpad0': 'numpad_0', 'Numpad1': 'numpad_1', 'Numpad2': 'numpad_2',
  'Numpad3': 'numpad_3', 'Numpad4': 'numpad_4', 'Numpad5': 'numpad_5',
  'Numpad6': 'numpad_6', 'Numpad7': 'numpad_7', 'Numpad8': 'numpad_8',
  'Numpad9': 'numpad_9',
  'NumpadMultiply': 'numpad_multiply', 'NumpadAdd': 'numpad_add',
  'NumpadSubtract': 'numpad_subtract', 'NumpadDecimal': 'numpad_decimal',
  'NumpadDivide': 'numpad_divide', 'NumpadEnter': 'enter',
  'ControlLeft': 'control', 'ControlRight': 'control',
  'ShiftLeft': 'shift', 'ShiftRight': 'shift',
  'AltLeft': 'alt', 'AltRight': 'alt',
  'MetaLeft': 'command', 'MetaRight': 'command',
  'CapsLock': 'caps_lock', 'NumLock': 'num_lock', 'ScrollLock': 'scroll_lock'
}

function handleRemoteInput(event, inputData) {
  if (!robot) {
    return
  }
  
  if (!checkRateLimit(inputData.inputType)) {
    return
  }
  
  try {
    const validation = validateInputCommand(inputData)
    if (!validation.valid) {
      log('error', '输入验证失败:', validation.errors)
      return
    }
    
    const input = parseInputCommand(inputData)
    if (!input) {
      log('error', '输入解析失败')
      return
    }
    
    const { 
      inputType, 
      x, 
      y, 
      dx,
      dy,
      button, 
      deltaY, 
      deltaX,
      accumulatedDeltaY,
      accumulatedDeltaX,
      key, 
      code, 
      keyCode,
      ctrlKey,
      shiftKey,
      altKey,
      metaKey
    } = input
    
    const primaryDisplay = screen.getPrimaryDisplay()
    const screenWidth = primaryDisplay.size.width
    const screenHeight = primaryDisplay.size.height

    switch (inputType) {
      case INPUT_TYPES.MOUSE_MOVE:
        handleMouseMove(x, y, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_MOVE_DELTA:
        handleMouseMoveDelta(dx, dy, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_DOWN:
        handleMouseDown(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_UP:
        handleMouseUp(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_WHEEL:
        handleMouseWheel(deltaY, deltaX, x, y, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_WHEEL_BATCH:
        handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX, screenWidth, screenHeight)
        break

      case INPUT_TYPES.KEY_DOWN:
        handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case INPUT_TYPES.KEY_UP:
        handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case INPUT_TYPES.MOUSE_CLICK:
        handleClick(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_DBLCLICK:
        handleDoubleClick(x, y, button, screenWidth, screenHeight)
        break

      default:
        log('warn', '未知的输入类型:', inputType)
    }
  } catch (error) {
    log('error', '远程输入错误:', error.message)
  }
}

function normalizeAndClamp(x, y, screenWidth, screenHeight) {
  const normalizedX = Math.max(0, Math.min(1, x || 0))
  const normalizedY = Math.max(0, Math.min(1, y || 0))
  
  const pixelX = Math.round(normalizedX * screenWidth)
  const pixelY = Math.round(normalizedY * screenHeight)
  
  return {
    x: Math.max(0, Math.min(screenWidth, pixelX)),
    y: Math.max(0, Math.min(screenHeight, pixelY))
  }
}

function handleMouseMove(x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    robot.moveMouse(pos.x, pos.y)
  }
}

function handleMouseMoveDelta(dx, dy, screenWidth, screenHeight) {
  if (dx === undefined || dy === undefined) return
  
  const targetX = currentMouseX + Math.round(dx)
  const targetY = currentMouseY + Math.round(dy)
  
  currentMouseX = Math.max(0, Math.min(screenWidth, targetX))
  currentMouseY = Math.max(0, Math.min(screenHeight, targetY))
  
  robot.moveMouse(currentMouseX, currentMouseY)
}

function handleMouseDown(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    robot.moveMouse(pos.x, pos.y)
  }
  
  const mouseButton = getButtonName(button)
  
  if (!pressedButtons[mouseButton]) {
    pressedButtons[mouseButton] = true
    robot.mouseToggle('down', mouseButton)
  }
}

function handleMouseUp(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    robot.moveMouse(pos.x, pos.y)
  }
  
  const mouseButton = getButtonName(button)
  
  if (pressedButtons[mouseButton]) {
    pressedButtons[mouseButton] = false
    robot.mouseToggle('up', mouseButton)
  }
}

function handleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  currentMouseX = pos.x
  currentMouseY = pos.y
  
  robot.moveMouse(pos.x, pos.y)
  
  const mouseButton = getButtonName(button)
  robot.mouseClick(mouseButton)
}

function handleDoubleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  currentMouseX = pos.x
  currentMouseY = pos.y
  
  robot.moveMouse(pos.x, pos.y)
  
  const mouseButton = getButtonName(button)
  robot.mouseClick(mouseButton, true)
}

function handleMouseWheel(deltaY, deltaX, x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    robot.moveMouse(pos.x, pos.y)
  }
  
  if (deltaY) {
    const scrollAmount = Math.round(deltaY / 120)
    robot.scrollMouse(0, -scrollAmount)
  }
  
  if (deltaX) {
    const scrollAmountX = Math.round(deltaX / 120)
    robot.scrollMouse(-scrollAmountX, 0)
  }
}

function handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX, screenWidth, screenHeight) {
  if (accumulatedDeltaY) {
    const scrollAmount = Math.round(accumulatedDeltaY / 120)
    robot.scrollMouse(0, -scrollAmount)
  }
  
  if (accumulatedDeltaX) {
    const scrollAmountX = Math.round(accumulatedDeltaX / 120)
    robot.scrollMouse(-scrollAmountX, 0)
  }
}

function handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) return
  
  try {
    if (ctrlKey !== undefined && ctrlKey !== pressedModifiers.Control) {
      pressedModifiers.Control = ctrlKey
      robot.keyToggle('control', ctrlKey ? 'down' : 'up')
    }
    
    if (shiftKey !== undefined && shiftKey !== pressedModifiers.Shift) {
      pressedModifiers.Shift = shiftKey
      robot.keyToggle('shift', shiftKey ? 'down' : 'up')
    }
    
    if (altKey !== undefined && altKey !== pressedModifiers.Alt) {
      pressedModifiers.Alt = altKey
      robot.keyToggle('alt', altKey ? 'down' : 'up')
    }
    
    if (metaKey !== undefined && metaKey !== pressedModifiers.Meta) {
      pressedModifiers.Meta = metaKey
      robot.keyToggle('command', metaKey ? 'down' : 'up')
    }
    
    if (!isModifierKeyCode(code)) {
      const robotKey = KEY_CODE_MAP[code] || key || code.toLowerCase()
      
      if (!pressedKeys.has(code)) {
        pressedKeys.add(code)
        robot.keyToggle(robotKey, 'down')
      }
    }
  } catch (e) {
    log('error', 'keydown 错误:', e.message)
  }
}

function handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) return
  
  try {
    if (!isModifierKeyCode(code)) {
      const robotKey = KEY_CODE_MAP[code] || key || code.toLowerCase()
      
      if (pressedKeys.has(code)) {
        pressedKeys.delete(code)
        robot.keyToggle(robotKey, 'up')
      }
    }
    
    if (ctrlKey === false && pressedModifiers.Control) {
      pressedModifiers.Control = false
      robot.keyToggle('control', 'up')
    }
    
    if (shiftKey === false && pressedModifiers.Shift) {
      pressedModifiers.Shift = false
      robot.keyToggle('shift', 'up')
    }
    
    if (altKey === false && pressedModifiers.Alt) {
      pressedModifiers.Alt = false
      robot.keyToggle('alt', 'up')
    }
    
    if (metaKey === false && pressedModifiers.Meta) {
      pressedModifiers.Meta = false
      robot.keyToggle('command', 'up')
    }
  } catch (e) {
    log('error', 'keyup 错误:', e.message)
  }
}

function getButtonName(button) {
  if (typeof button === 'string') {
    const lowerButton = button.toLowerCase()
    if (lowerButton === 'right') return 'right'
    if (lowerButton === 'middle') return 'middle'
    return 'left'
  }
  if (typeof button === 'number') {
    return BUTTON_MAP[button] || 'left'
  }
  return 'left'
}

function isModifierKeyCode(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

function resetModifiers() {
  log('info', '重置输入修饰键状态')
  try {
    if (robot) {
      if (pressedModifiers.Control) {
        robot.keyToggle('control', 'up')
      }
      if (pressedModifiers.Shift) {
        robot.keyToggle('shift', 'up')
      }
      if (pressedModifiers.Alt) {
        robot.keyToggle('alt', 'up')
      }
      if (pressedModifiers.Meta) {
        robot.keyToggle('command', 'up')
      }
      
      if (pressedButtons.left) {
        robot.mouseToggle('up', 'left')
        pressedButtons.left = false
      }
      if (pressedButtons.right) {
        robot.mouseToggle('up', 'right')
        pressedButtons.right = false
      }
      if (pressedButtons.middle) {
        robot.mouseToggle('up', 'middle')
        pressedButtons.middle = false
      }
      
      for (const code of pressedKeys) {
        const robotKey = KEY_CODE_MAP[code] || code.toLowerCase()
        robot.keyToggle(robotKey, 'up')
      }
    }
    pressedKeys.clear()
  } catch (e) {
    log('error', '重置错误:', e.message)
  }
  
  pressedModifiers = {
    Control: false,
    Shift: false,
    Alt: false,
    Meta: false
  }
}

function resetAllInputState() {
  log('info', '重置所有输入状态')
  resetModifiers()
}

function hideCursor() {
  if (cursorHidden) return
  try {
    if (robot) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const screenWidth = primaryDisplay.size.width
      const screenHeight = primaryDisplay.size.height
      
      const pos = robot.getMousePos()
      hiddenCursorX = pos.x
      hiddenCursorY = pos.y
      currentMouseX = pos.x
      currentMouseY = pos.y
      
      robot.moveMouse(screenWidth - 1, screenHeight - 1)
      
      cursorHidden = true
      log('info', '隐藏远程光标（移动到右下角）')
    }
  } catch (e) {
    log('error', '隐藏光标失败:', e.message)
  }
}

function showCursor() {
  if (!cursorHidden) return
  try {
    if (robot) {
      robot.moveMouse(hiddenCursorX, hiddenCursorY)
      currentMouseX = hiddenCursorX
      currentMouseY = hiddenCursorY
      log('info', '显示远程光标')
    }
    cursorHidden = false
  } catch (e) {
    log('error', '显示光标失败:', e.message)
  }
}

function cleanup() {
  resetAllInputState()
  showCursor()
  currentMouseX = 0
  currentMouseY = 0
  pressedKeys = new Set()
  pressedButtons = { left: false, right: false, middle: false }
  pressedModifiers = { Control: false, Shift: false, Alt: false, Meta: false }
  Object.values(INPUT_RATE_LIMIT).forEach(limit => { limit.lastTime = 0 })
  log('info', '输入处理器已清理')
}

module.exports = {
  handleRemoteInput,
  resetModifiers,
  resetAllInputState,
  cleanup,
  initLogger,
  updateNetworkLatency,
  flushInterpolationQueue: () => {},
  hideCursor,
  showCursor
}

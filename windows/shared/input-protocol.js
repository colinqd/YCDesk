/**
 * YCDesk 输入协议模块
 * 
 * 定义跨平台输入命令的标准格式和处理函数
 * 用于 Android/Windows 主控端 -> Windows 被控端 的输入传输
 * 
 * 数据流:
 * 主控端 用户输入 → InputDispatcher → createInputCommand() → 
 * WebRTC数据通道 → 被控端 接收 → parseInputCommand() → 执行输入
 */

const INPUT_TYPES = {
  MOUSE_MOVE: 'mousemove',
  MOUSE_MOVE_ABSOLUTE: 'mousemove_absolute',
  MOUSE_MOVE_DELTA: 'mousemove_delta',
  MOUSE_DOWN: 'mousedown',
  MOUSE_UP: 'mouseup',
  MOUSE_WHEEL: 'wheel',
  MOUSE_WHEEL_BATCH: 'wheel_batch',
  MOUSE_CLICK: 'click',
  MOUSE_DBLCLICK: 'dblclick',
  KEY_DOWN: 'keydown',
  KEY_UP: 'keyup',
  UNLOCK_SCREEN: 'unlock_screen'
}

const MOUSE_BUTTONS = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2
}

const THROTTLE_CONFIG = {
  MOUSE_MOVE_INTERVAL_MS: 8,
  MOUSE_MOVE_MIN_DISTANCE_PX: 2,
  WHEEL_BATCH_INTERVAL_MS: 16,
  IDLE_TIMEOUT_MS: 100
}

function createInputCommand(inputType, data = {}) {
  const command = {
    type: 'input',
    inputType: inputType,
    timestamp: Date.now()
  }
  
  // 解锁命令特殊处理
  if (inputType === INPUT_TYPES.UNLOCK_SCREEN && data.password !== undefined) {
    command.password = data.password
    return command
  }
  
  if (data.x !== undefined) {
    command.x = normalizeCoordinate(data.x, data.maxX)
  }
  if (data.y !== undefined) {
    command.y = normalizeCoordinate(data.y, data.maxY)
  }
  if (data.dx !== undefined) {
    command.dx = data.dx
  }
  if (data.dy !== undefined) {
    command.dy = data.dy
  }
  if (data.button !== undefined) {
    command.button = normalizeButton(data.button)
  }
  if (data.deltaY !== undefined) {
    command.deltaY = data.deltaY
  }
  if (data.deltaX !== undefined) {
    command.deltaX = data.deltaX
  }
  if (data.accumulatedDeltaY !== undefined) {
    command.accumulatedDeltaY = data.accumulatedDeltaY
  }
  if (data.accumulatedDeltaX !== undefined) {
    command.accumulatedDeltaX = data.accumulatedDeltaX
  }
  if (data.code !== undefined) {
    command.code = data.code
  }
  if (data.key !== undefined) {
    command.key = data.key
  }
  if (data.keyCode !== undefined) {
    command.keyCode = data.keyCode
  }
  if (data.ctrlKey !== undefined) {
    command.ctrlKey = data.ctrlKey
  }
  if (data.shiftKey !== undefined) {
    command.shiftKey = data.shiftKey
  }
  if (data.altKey !== undefined) {
    command.altKey = data.altKey
  }
  if (data.metaKey !== undefined) {
    command.metaKey = data.metaKey
  }
  if (data.sequenceId !== undefined) {
    command.sequenceId = data.sequenceId
  }
  
  return command
}

function normalizeCoordinate(value, maxValue = 65535) {
  if (value >= 0 && value <= 1) {
    return value
  }
  if (maxValue > 0) {
    return value / maxValue
  }
  return value
}

function normalizeButton(button) {
  if (typeof button === 'number') {
    return button
  }
  if (typeof button === 'string') {
    switch (button.toLowerCase()) {
      case 'left':
        return MOUSE_BUTTONS.LEFT
      case 'middle':
        return MOUSE_BUTTONS.MIDDLE
      case 'right':
        return MOUSE_BUTTONS.RIGHT
      default:
        return MOUSE_BUTTONS.LEFT
    }
  }
  return MOUSE_BUTTONS.LEFT
}

function parseInputCommand(command) {
  if (command.type !== 'input') {
    return null
  }
  
  const result = {
    inputType: command.inputType,
    x: command.x,
    y: command.y,
    dx: command.dx,
    dy: command.dy,
    button: command.button,
    deltaY: command.deltaY,
    deltaX: command.deltaX,
    accumulatedDeltaY: command.accumulatedDeltaY,
    accumulatedDeltaX: command.accumulatedDeltaX,
    code: command.code,
    key: command.key,
    keyCode: command.keyCode,
    ctrlKey: command.ctrlKey || false,
    shiftKey: command.shiftKey || false,
    altKey: command.altKey || false,
    metaKey: command.metaKey || false,
    timestamp: command.timestamp,
    sequenceId: command.sequenceId
  }
  
  // 解锁命令特殊处理
  if (command.inputType === INPUT_TYPES.UNLOCK_SCREEN && command.password !== undefined) {
    result.password = command.password
  }
  
  return result
}

const KEY_CODE_MAP = {
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
  'Backquote': '`',
  'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3',
  'Numpad4': '4', 'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
  'NumpadMultiply': '*', 'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadDecimal': '.',
  'NumpadDivide': '/', 'NumpadEnter': 'Enter',
  'ControlLeft': 'Control', 'ControlRight': 'Control',
  'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
  'AltLeft': 'Alt', 'AltRight': 'Alt',
  'MetaLeft': 'Meta', 'MetaRight': 'Meta',
  'CapsLock': 'CapsLock', 'NumLock': 'NumLock', 'ScrollLock': 'ScrollLock'
}

function validateInputCommand(command) {
  const errors = []
  
  if (!command || typeof command !== 'object') {
    errors.push('命令必须是对象')
    return { valid: false, errors }
  }
  
  if (command.type !== 'input') {
    errors.push('命令类型必须是 "input"')
  }
  
  if (!command.inputType || typeof command.inputType !== 'string') {
    errors.push('缺少有效的 inputType')
  } else {
    const validTypes = Object.values(INPUT_TYPES)
    if (!validTypes.includes(command.inputType)) {
      errors.push(`无效的 inputType: ${command.inputType}`)
    }
  }
  
  // 解锁命令特殊验证
  if (command.inputType === INPUT_TYPES.UNLOCK_SCREEN) {
    if (command.password === undefined || command.password === '') {
      errors.push('解锁命令必须包含 password')
    }
    return { valid: errors.length === 0, errors }
  }
  
  if (command.x !== undefined && typeof command.x !== 'number') {
    errors.push('x 必须是数字')
  }
  if (command.y !== undefined && typeof command.y !== 'number') {
    errors.push('y 必须是数字')
  }
  if (command.dx !== undefined && typeof command.dx !== 'number') {
    errors.push('dx 必须是数字')
  }
  if (command.dy !== undefined && typeof command.dy !== 'number') {
    errors.push('dy 必须是数字')
  }
  if (command.button !== undefined) {
    if (typeof command.button !== 'number' || command.button < 0 || command.button > 2) {
      errors.push('button 必须是 0-2 的数字')
    }
  }
  
  return { valid: errors.length === 0, errors }
}

function getKeyFromCode(code) {
  return KEY_CODE_MAP[code] || code
}

function isModifierKey(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

function isDeltaInputType(inputType) {
  return inputType === INPUT_TYPES.MOUSE_MOVE_DELTA
}

function isBatchInputType(inputType) {
  return inputType === INPUT_TYPES.MOUSE_WHEEL_BATCH
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INPUT_TYPES,
    MOUSE_BUTTONS,
    THROTTLE_CONFIG,
    createInputCommand,
    parseInputCommand,
    validateInputCommand,
    normalizeCoordinate,
    normalizeButton,
    getKeyFromCode,
    isModifierKey,
    isDeltaInputType,
    isBatchInputType,
    KEY_CODE_MAP
  }
} else {
  window.INPUT_TYPES = INPUT_TYPES
  window.MOUSE_BUTTONS = MOUSE_BUTTONS
  window.THROTTLE_CONFIG = THROTTLE_CONFIG
  window.createInputCommand = createInputCommand
  window.parseInputCommand = parseInputCommand
  window.validateInputCommand = validateInputCommand
  window.normalizeCoordinate = normalizeCoordinate
  window.normalizeButton = normalizeButton
  window.getKeyFromCode = getKeyFromCode
  window.isModifierKey = isModifierKey
  window.isDeltaInputType = isDeltaInputType
  window.isBatchInputType = isBatchInputType
  window.KEY_CODE_MAP = KEY_CODE_MAP
}

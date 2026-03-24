const INPUT_TYPES = {
  MOUSE_MOVE: 'mousemove',
  MOUSE_DOWN: 'mousedown',
  MOUSE_UP: 'mouseup',
  MOUSE_WHEEL: 'wheel',
  KEY_DOWN: 'keydown',
  KEY_UP: 'keyup'
}

const MOUSE_BUTTONS = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2
}

function createInputCommand(inputType, data = {}) {
  const command = {
    type: 'input',
    inputType: inputType,
    timestamp: Date.now()
  }
  
  if (data.x !== undefined) {
    command.x = normalizeCoordinate(data.x, data.maxX)
  }
  if (data.y !== undefined) {
    command.y = normalizeCoordinate(data.y, data.maxY)
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
  
  return {
    inputType: command.inputType,
    x: command.x,
    y: command.y,
    button: command.button,
    deltaY: command.deltaY,
    deltaX: command.deltaX,
    code: command.code,
    key: command.key,
    keyCode: command.keyCode,
    ctrlKey: command.ctrlKey || false,
    shiftKey: command.shiftKey || false,
    altKey: command.altKey || false,
    metaKey: command.metaKey || false
  }
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
  'Backquote': '`', 'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3',
  'Numpad4': '4', 'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
  'NumpadMultiply': '*', 'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadDecimal': '.',
  'NumpadDivide': '/', 'NumpadEnter': 'Enter',
  'ControlLeft': 'Control', 'ControlRight': 'Control',
  'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
  'AltLeft': 'Alt', 'AltRight': 'Alt',
  'MetaLeft': 'Meta', 'MetaRight': 'Meta',
  'CapsLock': 'CapsLock', 'NumLock': 'NumLock', 'ScrollLock': 'ScrollLock'
}

function getKeyFromCode(code) {
  return KEY_CODE_MAP[code] || code
}

function isModifierKey(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

module.exports = {
  INPUT_TYPES,
  MOUSE_BUTTONS,
  createInputCommand,
  parseInputCommand,
  normalizeCoordinate,
  normalizeButton,
  getKeyFromCode,
  isModifierKey,
  KEY_CODE_MAP
}

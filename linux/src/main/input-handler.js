const { screen } = require('electron')
const { validateInputCommand, parseInputCommand, INPUT_TYPES } = require('../../shared/input-protocol')

let robot = null
let logger = null
let initialized = false

const KEY_CODE_MAP = {
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
  'Numpad0': 'numpad_0', 'Numpad1': 'numpad_1', 'Numpad2': 'numpad_2',
  'Numpad3': 'numpad_3', 'Numpad4': 'numpad_4', 'Numpad5': 'numpad_5',
  'Numpad6': 'numpad_6', 'Numpad7': 'numpad_7', 'Numpad8': 'numpad_8',
  'Numpad9': 'numpad_9',
  'NumpadMultiply': 'numpad_multiply', 'NumpadAdd': 'numpad_add',
  'NumpadSubtract': 'numpad_subtract', 'NumpadDecimal': 'numpad_decimal',
  'NumpadDivide': 'numpad_divide',
  'ControlLeft': 'control', 'ControlRight': 'control',
  'ShiftLeft': 'shift', 'ShiftRight': 'shift',
  'AltLeft': 'alt', 'AltRight': 'alt',
  'MetaLeft': 'command', 'MetaRight': 'command',
  'CapsLock': 'caps_lock', 'NumLock': 'num_lock', 'ScrollLock': 'scroll_lock',
  'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
  'Semicolon': ';', 'Quote': '\'', 'Backquote': '`', 'Backslash': '\\',
  'Comma': ',', 'Period': '.', 'Slash': '/'
}

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
    console.error('[InputHandler] ${message}', data || '')
  }
}

function initRobot() {
  try {
    robot = require('robotjs')
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
let wheelAccumulatorY = 0
let wheelAccumulatorX = 0

const BUTTON_MAP = {
  0: 'left',
  1: 'middle',
  2: 'right'
}

function getRobotKey(code) {
  if (KEY_CODE_MAP[code]) return KEY_CODE_MAP[code]
  return code.toLowerCase()
}

function resetAllInputState() {
  pressedModifiers = {
    Control: false,
    Shift: false,
    Alt: false,
    Meta: false
  }
  pressedButtons = {
    left: false,
    right: false,
    middle: false
  }
  pressedKeys.clear()
  wheelAccumulatorY = 0
  wheelAccumulatorX = 0

  if (robot) {
    try {
      if (pressedModifiers.Control) robot.keyToggle('control', 'up')
      if (pressedModifiers.Shift) robot.keyToggle('shift', 'up')
      if (pressedModifiers.Alt) robot.keyToggle('alt', 'up')
      if (pressedModifiers.Meta) robot.keyToggle('command', 'up')
    } catch (e) { /* 按键复位失败，状态已重置 */ }
  }
}

async function handleRemoteInput(event, inputData) {
  log('info', 'handleRemoteInput called:', {
    type: inputData?.type,
    inputType: inputData?.inputType
  })

  if (!robot) {
    log('error', 'robotjs 未初始化，无法处理输入')
    return
  }

  try {
    const validation = validateInputCommand(inputData)
    if (!validation.valid) {
      log('warn', '输入验证失败:', validation.errors)
      return
    }

    const input = parseInputCommand(inputData)
    if (!input) {
      log('warn', '输入解析失败')
      return
    }

    const {
      inputType, x, y, button, key, code, keyCode, ctrlKey, shiftKey, altKey, metaKey, deltaY, deltaX
    } = input

    const primaryDisplay = screen.getPrimaryDisplay()
    const screenWidth = primaryDisplay.size.width
    const screenHeight = primaryDisplay.size.height

    switch (inputType) {
      case INPUT_TYPES.MOUSE_MOVE:
      case 'mousemove': {
        const targetX = Math.round(x * screenWidth)
        const targetY = Math.round(y * screenHeight)
        robot.moveMouse(targetX, targetY)
        currentMouseX = targetX
        currentMouseY = targetY
        break
      }

      case INPUT_TYPES.MOUSE_DOWN:
      case 'mousedown': {
        const targetX = Math.round(x * screenWidth)
        const targetY = Math.round(y * screenHeight)
        robot.moveMouse(targetX, targetY)
        currentMouseX = targetX
        currentMouseY = targetY

        const btn = BUTTON_MAP[button] || 'left'
        robot.mouseToggle('down', btn)
        pressedButtons[btn] = true
        break
      }

      case INPUT_TYPES.MOUSE_UP:
      case 'mouseup': {
        const targetX = Math.round(x * screenWidth)
        const targetY = Math.round(y * screenHeight)
        robot.moveMouse(targetX, targetY)
        currentMouseX = targetX
        currentMouseY = targetY

        const btn = BUTTON_MAP[button] || 'left'
        robot.mouseToggle('up', btn)
        pressedButtons[btn] = false
        break
      }

      case INPUT_TYPES.MOUSE_WHEEL:
      case 'wheel': {
        if (deltaY) {
          wheelAccumulatorY += deltaY
        }
        if (deltaX) {
          wheelAccumulatorX += deltaX
        }

        if (Math.abs(wheelAccumulatorY) >= 10) {
          robot.scrollMouse(0, Math.round(wheelAccumulatorY / 10))
          wheelAccumulatorY = 0
        }
        if (Math.abs(wheelAccumulatorX) >= 10) {
          robot.scrollMouse(Math.round(wheelAccumulatorX / 10), 0)
          wheelAccumulatorX = 0
        }
        break
      }

      case INPUT_TYPES.KEY_DOWN:
      case 'keydown': {
        if (key && key.length === 1) {
          robot.typeString(key)
        } else if (code) {
          const robotKey = getRobotKey(code)
          if (robotKey) {
            robot.keyToggle(robotKey, 'down')
            pressedKeys.add(robotKey)
          }
        }

        if (ctrlKey && !pressedModifiers.Control) {
          robot.keyToggle('control', 'down')
          pressedModifiers.Control = true
        }
        if (shiftKey && !pressedModifiers.Shift) {
          robot.keyToggle('shift', 'down')
          pressedModifiers.Shift = true
        }
        if (altKey && !pressedModifiers.Alt) {
          robot.keyToggle('alt', 'down')
          pressedModifiers.Alt = true
        }
        if (metaKey && !pressedModifiers.Meta) {
          robot.keyToggle('command', 'down')
          pressedModifiers.Meta = true
        }
        break
      }

      case INPUT_TYPES.KEY_UP:
      case 'keyup': {
        if (code) {
          const robotKey = getRobotKey(code)
          if (robotKey) {
            robot.keyToggle(robotKey, 'up')
            pressedKeys.delete(robotKey)
          }
        }

        if (!ctrlKey && pressedModifiers.Control) {
          robot.keyToggle('control', 'up')
          pressedModifiers.Control = false
        }
        if (!shiftKey && pressedModifiers.Shift) {
          robot.keyToggle('shift', 'up')
          pressedModifiers.Shift = false
        }
        if (!altKey && pressedModifiers.Alt) {
          robot.keyToggle('alt', 'up')
          pressedModifiers.Alt = false
        }
        if (!metaKey && pressedModifiers.Meta) {
          robot.keyToggle('command', 'up')
          pressedModifiers.Meta = false
        }
        break
      }
    }

  } catch (error) {
    log('error', '处理输入时出错:', error.message)
  }
}

function resetModifiers() {
  resetAllInputState()
  return { success: true }
}

function cleanup() {
  resetAllInputState()
}

module.exports = {
  initLogger,
  handleRemoteInput,
  resetModifiers,
  resetAllInputState,
  cleanup
}
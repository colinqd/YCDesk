/**
 * 键盘按键码表与辅助函数
 *
 * 包含 robotjs 按键映射、按钮映射、修饰键状态等。
 * 不依赖 robotjs 或日志模块，纯数据 + 纯函数。
 */

// ---- 鼠标按钮映射 ----

const BUTTON_MAP = {
  0: 'left',
  1: 'middle',
  2: 'right'
}

// ---- 修饰键与按键状态 ----

const pressedModifiers = {
  Control: false,
  Shift: false,
  Alt: false,
  Meta: false
}

const pressedButtons = {
  left: false,
  right: false,
  middle: false
}

const pressedKeys = new Set()

// ---- robotjs 按键名称映射 ----

const ROBOTJS_KEY_MAP = {
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
  'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4',
  'F5': 'f5', 'F6': 'f6', 'F7': 'f7', 'F8': 'f8',
  'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
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

// ---- 键盘映射函数 ----
// 引用 shared/input-protocol 的 KEY_CODE_MAP 做补充映射
let sharedKeyCodeMap = null

function setSharedKeyCodeMap(map) {
  sharedKeyCodeMap = map
}

function getRobotjsKey(code) {
  if (ROBOTJS_KEY_MAP[code]) return ROBOTJS_KEY_MAP[code]
  if (sharedKeyCodeMap && sharedKeyCodeMap[code]) {
    const mapped = sharedKeyCodeMap[code]
    if (mapped.length === 1) return mapped.toLowerCase()
    return mapped.toLowerCase()
  }
  return code.toLowerCase()
}

// ---- 按钮名辅助 ----

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

// ---- 修饰键判断 ----

const MODIFIER_KEY_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'CapsLock', 'NumLock', 'ScrollLock'
])

function isModifierKeyCode(code) {
  return MODIFIER_KEY_CODES.has(code)
}

// ---- 状态查询 & 重置 ----

function resetPressedState() {
  pressedModifiers.Control = false
  pressedModifiers.Shift = false
  pressedModifiers.Alt = false
  pressedModifiers.Meta = false
  pressedButtons.left = false
  pressedButtons.right = false
  pressedButtons.middle = false
  pressedKeys.clear()
}

module.exports = {
  BUTTON_MAP,
  ROBOTJS_KEY_MAP,
  pressedModifiers,
  pressedButtons,
  pressedKeys,
  setSharedKeyCodeMap,
  getRobotjsKey,
  getButtonName,
  isModifierKeyCode,
  resetPressedState
}

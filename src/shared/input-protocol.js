/**
 * YCDesk 输入协议模块
 * 
 * 定义跨平台输入命令的标准格式和处理函数
 * 用于 Android 主控端 -> Windows 被控端 的输入传输
 * 
 * 数据流:
 * Android 用户输入 → InputDispatcher → createInputCommand() → 
 * WebRTC数据通道 → Windows 接收 → parseInputCommand() → 执行输入
 */

/**
 * 输入类型常量定义
 * 注意：这些值必须与各端保持一致，否则输入将无法识别
 */
const INPUT_TYPES = {
  MOUSE_MOVE: 'mousemove',      // 鼠标移动
  MOUSE_DOWN: 'mousedown',      // 鼠标按下
  MOUSE_UP: 'mouseup',          // 鼠标释放
  MOUSE_WHEEL: 'wheel',         // 鼠标滚轮
  MOUSE_CLICK: 'click',         // 鼠标单击
  MOUSE_DBLCLICK: 'dblclick',   // 鼠标双击
  KEY_DOWN: 'keydown',          // 键盘按下
  KEY_UP: 'keyup'               // 键盘释放
}

/**
 * 鼠标按钮映射
 * 0 = 左键, 1 = 中键, 2 = 右键
 */
const MOUSE_BUTTONS = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2
}

/**
 * 创建标准化的输入命令
 * 
 * @param {string} inputType - 输入类型，来自 INPUT_TYPES
 * @param {Object} data - 输入数据
 * @param {number} [data.x] - 鼠标X坐标（0-1归一化或像素值）
 * @param {number} [data.y] - 鼠标Y坐标（0-1归一化或像素值）
 * @param {number} [data.maxX] - 最大X坐标（用于归一化）
 * @param {number} [data.maxY] - 最大Y坐标（用于归一化）
 * @param {number|string} [data.button] - 鼠标按钮
 * @param {number} [data.deltaY] - 垂直滚轮滚动量
 * @param {number} [data.deltaX] - 水平滚轮滚动量
 * @param {string} [data.code] - 键盘代码（如 'KeyA', 'Space'）
 * @param {string} [data.key] - 按键字符
 * @param {number} [data.keyCode] - 键码（旧版API）
 * @param {boolean} [data.ctrlKey] - Ctrl键是否按下
 * @param {boolean} [data.shiftKey] - Shift键是否按下
 * @param {boolean} [data.altKey] - Alt键是否按下
 * @param {boolean} [data.metaKey] - Meta键（Windows键/Command键）是否按下
 * @returns {Object} 标准化的输入命令对象
 */
function createInputCommand(inputType, data = {}) {
  const command = {
    type: 'input',
    inputType: inputType,
    timestamp: Date.now()
  }
  
  // 归一化X坐标（如果提供）
  if (data.x !== undefined) {
    command.x = normalizeCoordinate(data.x, data.maxX)
  }
  // 归一化Y坐标（如果提供）
  if (data.y !== undefined) {
    command.y = normalizeCoordinate(data.y, data.maxY)
  }
  // 标准化鼠标按钮
  if (data.button !== undefined) {
    command.button = normalizeButton(data.button)
  }
  // 滚轮数据
  if (data.deltaY !== undefined) {
    command.deltaY = data.deltaY
  }
  if (data.deltaX !== undefined) {
    command.deltaX = data.deltaX
  }
  // 键盘数据
  if (data.code !== undefined) {
    command.code = data.code
  }
  if (data.key !== undefined) {
    command.key = data.key
  }
  if (data.keyCode !== undefined) {
    command.keyCode = data.keyCode
  }
  // 修饰键状态
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

/**
 * 归一化坐标值
 * 将像素坐标转换为 0-1 范围的归一化值
 * 
 * @param {number} value - 原始坐标值
 * @param {number} [maxValue=65535] - 最大坐标值（屏幕宽度/高度）
 * @returns {number} 归一化后的坐标（0-1）
 */
function normalizeCoordinate(value, maxValue = 65535) {
  // 如果已经是归一化值（0-1之间），直接返回
  if (value >= 0 && value <= 1) {
    return value
  }
  // 如果提供了最大值，进行归一化
  if (maxValue > 0) {
    return value / maxValue
  }
  // 默认返回原值
  return value
}

/**
 * 标准化鼠标按钮值
 * 接受数字或字符串形式的按钮标识，统一返回数字格式
 * 
 * @param {number|string} button - 按钮标识
 * @returns {number} 标准化的按钮编号（0=左键, 1=中键, 2=右键）
 */
function normalizeButton(button) {
  // 如果已经是数字，直接返回
  if (typeof button === 'number') {
    return button
  }
  // 如果是字符串，转换为对应数字
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
  // 默认返回左键
  return MOUSE_BUTTONS.LEFT
}

/**
 * 解析输入命令
 * 在被控端接收数据后，解析为可用的输入对象
 * 
 * @param {Object} command - 从数据通道接收的命令对象
 * @returns {Object|null} 解析后的输入对象，无效命令返回null
 */
function parseInputCommand(command) {
  // 验证命令类型
  if (command.type !== 'input') {
    return null
  }
  
  // 返回标准化的输入对象，设置默认值
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

/**
 * 键盘代码映射表
 * 将Web标准key code映射为可读字符
 * 用于跨平台键盘输入兼容性
 */
const KEY_CODE_MAP = {
  // 数字键
  'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
  'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
  // 字母键
  'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e',
  'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j',
  'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o',
  'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't',
  'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z',
  // 特殊键
  'Space': ' ', 'Enter': 'Enter', 'Backspace': 'Backspace', 'Tab': 'Tab',
  'Escape': 'Escape', 'Delete': 'Delete', 'Insert': 'Insert',
  // 方向键
  'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown', 'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
  // 导航键
  'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
  // 功能键
  'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
  'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
  // 符号键
  'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
  'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.', 'Slash': '/',
  'Backquote': '`',
  // 数字小键盘
  'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3',
  'Numpad4': '4', 'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
  'NumpadMultiply': '*', 'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadDecimal': '.',
  'NumpadDivide': '/', 'NumpadEnter': 'Enter',
  // 修饰键
  'ControlLeft': 'Control', 'ControlRight': 'Control',
  'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
  'AltLeft': 'Alt', 'AltRight': 'Alt',
  'MetaLeft': 'Meta', 'MetaRight': 'Meta',
  // 锁定键
  'CapsLock': 'CapsLock', 'NumLock': 'NumLock', 'ScrollLock': 'ScrollLock'
}

/**
 * 从键盘代码获取对应字符
 * 
 * @param {string} code - 键盘代码（如 'KeyA'）
 * @returns {string} 对应的字符或原代码
 */
function getKeyFromCode(code) {
  return KEY_CODE_MAP[code] || code
}

/**
 * 判断是否为修饰键
 * 
 * @param {string} code - 键盘代码
 * @returns {boolean} 是否为修饰键
 */
function isModifierKey(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

// 导出模块（兼容Node.js和浏览器）
if (typeof module !== 'undefined' && module.exports) {
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
} else {
  // 浏览器环境
  window.INPUT_TYPES = INPUT_TYPES
  window.MOUSE_BUTTONS = MOUSE_BUTTONS
  window.createInputCommand = createInputCommand
  window.parseInputCommand = parseInputCommand
  window.normalizeCoordinate = normalizeCoordinate
  window.normalizeButton = normalizeButton
  window.getKeyFromCode = getKeyFromCode
  window.isModifierKey = isModifierKey
  window.KEY_CODE_MAP = KEY_CODE_MAP
}

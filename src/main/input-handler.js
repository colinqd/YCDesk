const { screen } = require('electron')
const { mouse, keyboard, Point, Button, Key } = require('@nut-tree/nut-js')
const { validateInputCommand, parseInputCommand } = require('../shared/input-protocol')

let lastMouseX = 0
let lastMouseY = 0
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

const BUTTON_MAP = {
  0: 'left',
  1: 'middle', 
  2: 'right'
}

/**
 * 处理远程输入命令
 * 
 * @param {Object} event - IPC 事件对象
 * @param {Object} inputData - 输入数据对象
 */
function handleRemoteInput(event, inputData) {
  try {
    const validation = validateInputCommand(inputData)
    if (!validation.valid) {
      console.error('[输入验证失败:', validation.errors)
      return
    }
    
    const input = parseInputCommand(inputData)
    if (!input) {
      console.error('[输入解析失败]')
      return
    }
    
    const { 
      inputType, 
      x, 
      y, 
      button, 
      deltaY, 
      deltaX,
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

    console.log('处理远程输入:', inputType, { 
      x, y, button, deltaY, deltaX, key, code, 
      ctrlKey, shiftKey, altKey, metaKey 
    })

    switch (inputType) {
      case 'mousemove':
        handleMouseMove(x, y, screenWidth, screenHeight)
        break

      case 'mousedown':
        handleMouseDown(x, y, button, screenWidth, screenHeight)
        break

      case 'mouseup':
        handleMouseUp(x, y, button, screenWidth, screenHeight)
        break

      case 'wheel':
        handleMouseWheel(deltaY, deltaX)
        break

      case 'keydown':
        handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case 'keyup':
        handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case 'click':
        handleClick(x, y, button, screenWidth, screenHeight)
        break

      case 'dblclick':
        handleDoubleClick(x, y, button, screenWidth, screenHeight)
        break

      default:
        console.log('未知的输入类型:', inputType)
    }
  } catch (error) {
    console.error('[IPC Error] remote-input:', error)
  }
}

/**
 * 归一化并限制坐标值
 * 注意：输入已经是 0-1 归一化坐标，不需要再次归一化
 * 
 * @param {number} x - X 坐标（0-1 归一化）
 * @param {number} y - Y 坐标（0-1 归一化）
 * @param {number} screenWidth - 屏幕宽度
 * @param {number} screenHeight - 屏幕高度
 * @returns {Object} 包含 x 和 y 的对象
 */
function normalizeAndClamp(x, y, screenWidth, screenHeight) {
  // 输入已经是归一化坐标，直接使用
  // 只需要限制在 0-1 范围内
  const normalizedX = Math.max(0, Math.min(1, x || 0))
  const normalizedY = Math.max(0, Math.min(1, y || 0))
  
  const pixelX = Math.round(normalizedX * screenWidth)
  const pixelY = Math.round(normalizedY * screenHeight)
  
  return {
    x: Math.max(0, Math.min(screenWidth, pixelX)),
    y: Math.max(0, Math.min(screenHeight, pixelY))
  }
}

/**
 * 处理鼠标移动事件
 * 
 * @param {number} x - 归一化的 X 坐标 (0-1)
 * @param {number} y - 归一化的 Y 坐标 (0-1)
 * @param {number} screenWidth - 屏幕宽度
 * @param {number} screenHeight - 屏幕高度
 */
function handleMouseMove(x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
    
    mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
    console.log('鼠标移动到:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标按下事件
 * 
 * @param {number} x - 归一化的 X 坐标 (0-1)
 * @param {number} y - 归一化的 Y 坐标 (0-1)
 * @param {number} button - 鼠标按钮 (0=左键, 1=中键, 2=右键)
 * @param {number} screenWidth - 屏幕宽度
 * @param {number} screenHeight - 屏幕高度
 */
function handleMouseDown(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
    mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
  }
  
  const mouseButton = getButtonName(button)
  const nutButton = getNutButton(mouseButton)
  
  if (!pressedButtons[mouseButton]) {
    mouse.pressButton(nutButton).catch(e => console.error('鼠标按下失败:', e))
    pressedButtons[mouseButton] = true
    console.log('鼠标按下:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标释放事件
 * 
 * @param {number} x - 归一化的 X 坐标 (0-1)
 * @param {number} y - 归一化的 Y 坐标 (0-1)
 * @param {number} button - 鼠标按钮 (0=左键, 1=中键, 2=右键)
 * @param {number} screenWidth - 屏幕宽度
 * @param {number} screenHeight - 屏幕高度
 */
function handleMouseUp(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
    mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
  }
  
  const mouseButton = getButtonName(button)
  const nutButton = getNutButton(mouseButton)
  
  if (pressedButtons[mouseButton]) {
    mouse.releaseButton(nutButton).catch(e => console.error('鼠标释放失败:', e))
    pressedButtons[mouseButton] = false
    console.log('鼠标释放:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标点击事件
 * 
 * @param {number} x - 归一化的 X 坐标 (0-1)
 * @param {number} y - 归一化的 Y 坐标 (0-1)
 * @param {number} button - 鼠标按钮 (0=左键, 1=中键, 2=右键)
 * @param {number} screenWidth - 屏幕宽度
 * @param {screenHeight} screenHeight - 屏幕高度
 */
function handleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  lastMouseX = pos.x
  lastMouseY = pos.y
  
  mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
  
  const mouseButton = getButtonName(button)
  const nutButton = getNutButton(mouseButton)
  
  setTimeout(async () => {
    try {
      await mouse.pressButton(nutButton)
      await new Promise(resolve => setTimeout(resolve, 50))
      await mouse.releaseButton(nutButton)
      console.log('鼠标单击:', mouseButton, '位置:', lastMouseX, lastMouseY)
    } catch (e) {
      console.error('鼠标单击失败:', e)
    }
  }, 10)
}

/**
 * 处理鼠标双击事件
 * 
 * @param {number} x - 归一化的 X 坐标 (0-1)
 * @param {number} y - 归一化的 Y 坐标 (0-1)
 * @param {number} button - 鼠标按钮 (0=左键, 1=中键, 2=右键)
 * @param {number} screenWidth - 屏幕宽度
 * @param {number} screenHeight - 屏幕高度
 */
function handleDoubleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  lastMouseX = pos.x
  lastMouseY = pos.y
  
  mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
  
  const mouseButton = getButtonName(button)
  const nutButton = getNutButton(mouseButton)
  
  setTimeout(async () => {
    try {
      await mouse.pressButton(nutButton)
      await new Promise(resolve => setTimeout(resolve, 50))
      await mouse.releaseButton(nutButton)
      await new Promise(resolve => setTimeout(resolve, 100))
      await mouse.pressButton(nutButton)
      await new Promise(resolve => setTimeout(resolve, 50))
      await mouse.releaseButton(nutButton)
      console.log('鼠标双击:', mouseButton, '位置:', lastMouseX, lastMouseY)
    } catch (e) {
      console.error('鼠标双击失败:', e)
    }
  }, 10)
}

/**
 * 处理鼠标滚轮事件
 * 
 * @param {number} deltaY - 垂直滚动量
 * @param {number} deltaX - 水平滚动量
 */
function handleMouseWheel(deltaY, deltaX) {
  if (deltaY) {
    const scrollDelta = Math.sign(deltaY) * Math.min(Math.abs(deltaY), 120)
    mouse.wheel(Math.round(scrollDelta)).catch(e => console.error('鼠标滚轮失败:', e))
    console.log('鼠标滚轮垂直:', scrollDelta)
  }
  
  if (deltaX) {
    const scrollDeltaX = Math.sign(deltaX) * Math.min(Math.abs(deltaX), 120)
    mouse.wheel(Math.round(scrollDeltaX)).catch(e => console.error('鼠标水平滚轮失败:', e))
    console.log('鼠标滚轮水平:', scrollDeltaX)
  }
}

/**
 * 处理键盘按下事件
 * 
 * @param {string} code - 键盘代码
 * @param {string} key - 按键字符
 * @param {boolean} ctrlKey - Ctrl 键是否按下
 * @param {boolean} shiftKey - Shift 键是否按下
 * @param {boolean} altKey - Alt 键是否按下
 * @param {boolean} metaKey - Meta 键是否按下
 */
function handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('键盘按下: 缺少code参数')
    return
  }
  
  try {
    if (ctrlKey !== undefined && ctrlKey !== pressedModifiers.Control) {
      if (ctrlKey) {
        keyboard.pressKey(Key.LeftControl).catch(e => console.error('Control键按下失败:', e))
      } else {
        keyboard.releaseKey(Key.LeftControl).catch(e => console.error('Control键释放失败:', e))
      }
      pressedModifiers.Control = ctrlKey
    }
    
    if (shiftKey !== undefined && shiftKey !== pressedModifiers.Shift) {
      if (shiftKey) {
        keyboard.pressKey(Key.LeftShift).catch(e => console.error('Shift键按下失败:', e))
      } else {
        keyboard.releaseKey(Key.LeftShift).catch(e => console.error('Shift键释放失败:', e))
      }
      pressedModifiers.Shift = shiftKey
    }
    
    if (altKey !== undefined && altKey !== pressedModifiers.Alt) {
      if (altKey) {
        keyboard.pressKey(Key.LeftAlt).catch(e => console.error('Alt键按下失败:', e))
      } else {
        keyboard.releaseKey(Key.LeftAlt).catch(e => console.error('Alt键释放失败:', e))
      }
      pressedModifiers.Alt = altKey
    }
    
    if (metaKey !== undefined && metaKey !== pressedModifiers.Meta) {
      if (metaKey) {
        keyboard.pressKey(Key.LeftWin).catch(e => console.error('Meta键按下失败:', e))
      } else {
        keyboard.releaseKey(Key.LeftWin).catch(e => console.error('Meta键释放失败:', e))
      }
      pressedModifiers.Meta = metaKey
    }
    
    const nutKey = getKey(code)
    if (nutKey && !isModifierKeyCode(code)) {
      keyboard.pressKey(nutKey).catch(e => console.error('键盘按下失败:', e))
      console.log('键盘按下:', code, 'key:', key, 'nutKey:', nutKey)
    } else if (!nutKey) {
      console.log('键盘按下: 未找到键码映射 -', code)
    }
  } catch (e) {
    console.log('Key press error:', e)
  }
}

/**
 * 处理键盘释放事件
 * 
 * @param {string} code - 键盘代码
 * @param {string} key - 按键字符
 * @param {boolean} ctrlKey - Ctrl 键是否按下
 * @param {boolean} shiftKey - Shift 键是否按下
 * @param {boolean} altKey - Alt 键是否按下
 * @param {boolean} metaKey - Meta 键是否按下
 */
function handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('键盘释放: 缺少code参数')
    return
  }
  
  try {
    const nutKey = getKey(code)
    if (nutKey && !isModifierKeyCode(code)) {
      keyboard.releaseKey(nutKey).catch(e => console.error('键盘释放失败:', e))
      console.log('键盘释放:', code, 'key:', key, 'nutKey:', nutKey)
    }
    
    if (ctrlKey === false && pressedModifiers.Control) {
      keyboard.releaseKey(Key.LeftControl).catch(e => console.error('Control键释放失败:', e))
      pressedModifiers.Control = false
    }
    
    if (shiftKey === false && pressedModifiers.Shift) {
      keyboard.releaseKey(Key.LeftShift).catch(e => console.error('Shift键释放失败:', e))
      pressedModifiers.Shift = false
    }
    
    if (altKey === false && pressedModifiers.Alt) {
      keyboard.releaseKey(Key.LeftAlt).catch(e => console.error('Alt键释放失败:', e))
      pressedModifiers.Alt = false
    }
    
    if (metaKey === false && pressedModifiers.Meta) {
      keyboard.releaseKey(Key.LeftWin).catch(e => console.error('Meta键释放失败:', e))
      pressedModifiers.Meta = false
    }
  } catch (e) {
    console.log('Key release error:', e)
  }
}

/**
 * 获取按钮名称
 * 
 * @param {number|string} button - 按钮标识
 * @returns {string} 按钮名称 ('left', 'middle', 'right')
 */
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

/**
 * 获取 nut.js 的按钮常量
 * 
 * @param {string} buttonName - 按钮名称
 * @returns {Button} nut.js 按钮常量
 */
function getNutButton(buttonName) {
  switch (buttonName) {
    case 'left':
      return Button.LEFT
    case 'right':
      return Button.RIGHT
    case 'middle':
      return Button.MIDDLE
    default:
      return Button.LEFT
  }
}

/**
 * 将 Web 键盘代码映射到 nut-js Key 枚举
 * 
 * @param {string} code - Web 键盘代码
 * @returns {Key} nut-js Key 枚举值
 */
function getKey(code) {
  const keyMap = {
    // 字母键
    'KeyA': Key.A, 'KeyB': Key.B, 'KeyC': Key.C, 'KeyD': Key.D, 'KeyE': Key.E,
    'KeyF': Key.F, 'KeyG': Key.G, 'KeyH': Key.H, 'KeyI': Key.I, 'KeyJ': Key.J,
    'KeyK': Key.K, 'KeyL': Key.L, 'KeyM': Key.M, 'KeyN': Key.N, 'KeyO': Key.O,
    'KeyP': Key.P, 'KeyQ': Key.Q, 'KeyR': Key.R, 'KeyS': Key.S, 'KeyT': Key.T,
    'KeyU': Key.U, 'KeyV': Key.V, 'KeyW': Key.W, 'KeyX': Key.X, 'KeyY': Key.Y,
    'KeyZ': Key.Z,
    // 数字键
    'Digit0': Key.Num0, 'Digit1': Key.Num1, 'Digit2': Key.Num2, 
    'Digit3': Key.Num3, 'Digit4': Key.Num4, 'Digit5': Key.Num5,
    'Digit6': Key.Num6, 'Digit7': Key.Num7, 'Digit8': Key.Num8, 'Digit9': Key.Num9,
    // 功能键
    'F1': Key.F1, 'F2': Key.F2, 'F3': Key.F3, 'F4': Key.F4,
    'F5': Key.F5, 'F6': Key.F6, 'F7': Key.F7, 'F8': Key.F8,
    'F9': Key.F9, 'F10': Key.F10, 'F11': Key.F11, 'F12': Key.F12,
    // 特殊键
    'Space': Key.Space, 'Enter': Key.Enter, 'Backspace': Key.Backspace,
    'Tab': Key.Tab, 'Escape': Key.Escape, 'Delete': Key.Delete,
    'Insert': Key.Insert, 'Home': Key.Home, 'End': Key.End,
    'PageUp': Key.PageUp, 'PageDown': Key.PageDown,
    // 方向键
    'ArrowUp': Key.Up, 'ArrowDown': Key.Down,
    'ArrowLeft': Key.Left, 'ArrowRight': Key.Right,
    // 符号键
    'Minus': Key.Minus, 'Equal': Key.Equal,
    'BracketLeft': Key.LeftBracket, 'BracketRight': Key.RightBracket,
    'Backslash': Key.Backslash, 'Semicolon': Key.Semicolon,
    'Quote': Key.Quote, 'Comma': Key.Comma, 'Period': Key.Period,
    'Slash': Key.Slash, 'Backquote': Key.Grave,
    // 修饰键
    'ControlLeft': Key.LeftControl, 'ControlRight': Key.RightControl,
    'ShiftLeft': Key.LeftShift, 'ShiftRight': Key.RightShift,
    'AltLeft': Key.LeftAlt, 'AltRight': Key.RightAlt,
    'MetaLeft': Key.LeftWin, 'MetaRight': Key.RightWin,
    'CapsLock': Key.CapsLock, 'NumLock': Key.NumLock, 'ScrollLock': Key.ScrollLock
  }
  return keyMap[code] || null
}

/**
 * 判断是否为修饰键
 * 
 * @param {string} code - 键盘代码
 * @returns {boolean} 是否为修饰键
 */
function isModifierKeyCode(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

/**
 * 重置所有修饰键和鼠标按钮状态
 */
function resetModifiers() {
  try {
    if (pressedModifiers.Control) {
      keyboard.releaseKey(Key.LeftControl).catch(e => console.error('Control键释放失败:', e))
    }
    if (pressedModifiers.Shift) {
      keyboard.releaseKey(Key.LeftShift).catch(e => console.error('Shift键释放失败:', e))
    }
    if (pressedModifiers.Alt) {
      keyboard.releaseKey(Key.LeftAlt).catch(e => console.error('Alt键释放失败:', e))
    }
    if (pressedModifiers.Meta) {
      keyboard.releaseKey(Key.LeftWin).catch(e => console.error('Meta键释放失败:', e))
    }
    
    if (pressedButtons.left) {
      mouse.releaseButton(Button.LEFT).catch(e => console.error('左键释放失败:', e))
      pressedButtons.left = false
    }
    if (pressedButtons.right) {
      mouse.releaseButton(Button.RIGHT).catch(e => console.error('右键释放失败:', e))
      pressedButtons.right = false
    }
    if (pressedButtons.middle) {
      mouse.releaseButton(Button.MIDDLE).catch(e => console.error('中键释放失败:', e))
      pressedButtons.middle = false
    }
  } catch (e) {
    console.log('Reset modifiers error:', e)
  }
  
  pressedModifiers = {
    Control: false,
    Shift: false,
    Alt: false,
    Meta: false
  }
}

module.exports = {
  handleRemoteInput,
  resetModifiers
}

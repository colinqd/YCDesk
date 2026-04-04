const { screen } = require('electron')
const { validateInputCommand, parseInputCommand } = require('../../shared/input-protocol')

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

    console.log('[远程输入] 类型:', inputType, { 
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
        console.log('[远程输入] 未知的输入类型:', inputType)
    }
  } catch (error) {
    console.error('[远程输入] 错误:', error)
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
 */
function handleMouseMove(x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
    
    console.log('[鼠标] 移动到:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标按下事件
 */
function handleMouseDown(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
  }
  
  const mouseButton = getButtonName(button)
  
  if (!pressedButtons[mouseButton]) {
    pressedButtons[mouseButton] = true
    console.log('[鼠标] 按下:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标释放事件
 */
function handleMouseUp(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    lastMouseX = pos.x
    lastMouseY = pos.y
  }
  
  const mouseButton = getButtonName(button)
  
  if (pressedButtons[mouseButton]) {
    pressedButtons[mouseButton] = false
    console.log('[鼠标] 释放:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }
}

/**
 * 处理鼠标点击事件
 */
function handleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  lastMouseX = pos.x
  lastMouseY = pos.y
  
  const mouseButton = getButtonName(button)
  
  setTimeout(() => {
    console.log('[鼠标] 单击:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }, 10)
}

/**
 * 处理鼠标双击事件
 */
function handleDoubleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  lastMouseX = pos.x
  lastMouseY = pos.y
  
  const mouseButton = getButtonName(button)
  
  setTimeout(() => {
    console.log('[鼠标] 双击:', mouseButton, '位置:', lastMouseX, lastMouseY)
  }, 10)
}

/**
 * 处理鼠标滚轮事件
 */
function handleMouseWheel(deltaY, deltaX) {
  if (deltaY) {
    const scrollAmount = Math.round(deltaY / 120)
    console.log('[鼠标] 滚轮垂直:', scrollAmount)
  }
  
  if (deltaX) {
    const scrollAmountX = Math.round(deltaX / 120)
    console.log('[鼠标] 滚轮水平:', scrollAmountX)
  }
}

/**
 * 处理键盘按下事件
 */
function handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('[键盘] 按下: 缺少code参数')
    return
  }
  
  try {
    if (ctrlKey !== undefined && ctrlKey !== pressedModifiers.Control) {
      pressedModifiers.Control = ctrlKey
      console.log('[键盘] Ctrl:', ctrlKey ? '按下' : '释放')
    }
    
    if (shiftKey !== undefined && shiftKey !== pressedModifiers.Shift) {
      pressedModifiers.Shift = shiftKey
      console.log('[键盘] Shift:', shiftKey ? '按下' : '释放')
    }
    
    if (altKey !== undefined && altKey !== pressedModifiers.Alt) {
      pressedModifiers.Alt = altKey
      console.log('[键盘] Alt:', altKey ? '按下' : '释放')
    }
    
    if (metaKey !== undefined && metaKey !== pressedModifiers.Meta) {
      pressedModifiers.Meta = metaKey
      console.log('[键盘] Meta:', metaKey ? '按下' : '释放')
    }
    
    if (!isModifierKeyCode(code)) {
      console.log('[键盘] 按下:', code, 'key:', key)
    }
  } catch (e) {
    console.log('[键盘] 按下错误:', e)
  }
}

/**
 * 处理键盘释放事件
 */
function handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('[键盘] 释放: 缺少code参数')
    return
  }
  
  try {
    if (!isModifierKeyCode(code)) {
      console.log('[键盘] 释放:', code, 'key:', key)
    }
    
    if (ctrlKey === false && pressedModifiers.Control) {
      pressedModifiers.Control = false
      console.log('[键盘] Ctrl: 释放')
    }
    
    if (shiftKey === false && pressedModifiers.Shift) {
      pressedModifiers.Shift = false
      console.log('[键盘] Shift: 释放')
    }
    
    if (altKey === false && pressedModifiers.Alt) {
      pressedModifiers.Alt = false
      console.log('[键盘] Alt: 释放')
    }
    
    if (metaKey === false && pressedModifiers.Meta) {
      pressedModifiers.Meta = false
      console.log('[键盘] Meta: 释放')
    }
  } catch (e) {
    console.log('[键盘] 释放错误:', e)
  }
}

/**
 * 获取按钮名称
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
 * 判断是否为修饰键
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
      console.log('[重置] Ctrl: 释放')
    }
    if (pressedModifiers.Shift) {
      console.log('[重置] Shift: 释放')
    }
    if (pressedModifiers.Alt) {
      console.log('[重置] Alt: 释放')
    }
    if (pressedModifiers.Meta) {
      console.log('[重置] Meta: 释放')
    }
    
    if (pressedButtons.left) {
      console.log('[重置] 左键: 释放')
      pressedButtons.left = false
    }
    if (pressedButtons.right) {
      console.log('[重置] 右键: 释放')
      pressedButtons.right = false
    }
    if (pressedButtons.middle) {
      console.log('[重置] 中键: 释放')
      pressedButtons.middle = false
    }
  } catch (e) {
    console.log('[重置] 错误:', e)
  }
  
  pressedModifiers = {
    Control: false,
    Shift: false,
    Alt: false,
    Meta: false
  }
}

/**
 * 重置所有输入状态（完整重置）
 * 在连接断开或发生错误时调用
 */
function resetAllInputState() {
  console.log('[重置] 所有输入状态...')
  
  try {
    Object.keys(pressedModifiers).forEach(key => {
      if (pressedModifiers[key]) {
        console.log('[重置]', key, ': 释放')
        pressedModifiers[key] = false
      }
    })
    
    Object.keys(pressedButtons).forEach(button => {
      if (pressedButtons[button]) {
        console.log('[重置]', button, '按钮: 释放')
        pressedButtons[button] = false
      }
    })
    
    console.log('[重置] 所有输入状态已重置')
  } catch (e) {
    console.error('[重置] 错误:', e)
  }
}

module.exports = {
  handleRemoteInput,
  resetModifiers,
  resetAllInputState
}

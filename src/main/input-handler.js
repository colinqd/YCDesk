const { screen } = require('electron')
const { mouse, keyboard, Point, Button } = require('@nut-tree/nut-js')

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

function handleRemoteInput(event, inputData) {
  try {
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
    } = inputData
    
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
    console.error('处理远程输入失败:', error)
  }
}

function normalizeAndClamp(x, y, screenWidth, screenHeight) {
  const normalizedX = normalizeCoord(x)
  const normalizedY = normalizeCoord(y)
  
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
    lastMouseX = pos.x
    lastMouseY = pos.y
    
    mouse.move(new Point(lastMouseX, lastMouseY)).catch(e => console.error('鼠标移动失败:', e))
    console.log('鼠标移动到:', lastMouseX, lastMouseY)
  }
}

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

function handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('键盘按下: 缺少code参数')
    return
  }
  
  try {
    if (ctrlKey !== undefined && ctrlKey !== pressedModifiers.Control) {
      if (ctrlKey) {
        keyboard.pressKey('Control').catch(e => console.error('Control键按下失败:', e))
      } else {
        keyboard.releaseKey('Control').catch(e => console.error('Control键释放失败:', e))
      }
      pressedModifiers.Control = ctrlKey
    }
    
    if (shiftKey !== undefined && shiftKey !== pressedModifiers.Shift) {
      if (shiftKey) {
        keyboard.pressKey('Shift').catch(e => console.error('Shift键按下失败:', e))
      } else {
        keyboard.releaseKey('Shift').catch(e => console.error('Shift键释放失败:', e))
      }
      pressedModifiers.Shift = shiftKey
    }
    
    if (altKey !== undefined && altKey !== pressedModifiers.Alt) {
      if (altKey) {
        keyboard.pressKey('Alt').catch(e => console.error('Alt键按下失败:', e))
      } else {
        keyboard.releaseKey('Alt').catch(e => console.error('Alt键释放失败:', e))
      }
      pressedModifiers.Alt = altKey
    }
    
    if (metaKey !== undefined && metaKey !== pressedModifiers.Meta) {
      if (metaKey) {
        keyboard.pressKey('Meta').catch(e => console.error('Meta键按下失败:', e))
      } else {
        keyboard.releaseKey('Meta').catch(e => console.error('Meta键释放失败:', e))
      }
      pressedModifiers.Meta = metaKey
    }
    
    if (!isModifierKeyCode(code)) {
      keyboard.pressKey(code).catch(e => console.error('键盘按下失败:', e))
      console.log('键盘按下:', code, 'key:', key)
    }
  } catch (e) {
    console.log('Key press error:', e)
  }
}

function handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) {
    console.log('键盘释放: 缺少code参数')
    return
  }
  
  try {
    if (!isModifierKeyCode(code)) {
      keyboard.releaseKey(code).catch(e => console.error('键盘释放失败:', e))
      console.log('键盘释放:', code, 'key:', key)
    }
    
    if (ctrlKey === false && pressedModifiers.Control) {
      keyboard.releaseKey('Control').catch(e => console.error('Control键释放失败:', e))
      pressedModifiers.Control = false
    }
    
    if (shiftKey === false && pressedModifiers.Shift) {
      keyboard.releaseKey('Shift').catch(e => console.error('Shift键释放失败:', e))
      pressedModifiers.Shift = false
    }
    
    if (altKey === false && pressedModifiers.Alt) {
      keyboard.releaseKey('Alt').catch(e => console.error('Alt键释放失败:', e))
      pressedModifiers.Alt = false
    }
    
    if (metaKey === false && pressedModifiers.Meta) {
      keyboard.releaseKey('Meta').catch(e => console.error('Meta键释放失败:', e))
      pressedModifiers.Meta = false
    }
  } catch (e) {
    console.log('Key release error:', e)
  }
}

function normalizeCoord(value) {
  if (value >= 0 && value <= 1) {
    return value
  }
  if (value > 1) {
    return value / 65535
  }
  return 0
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

function isModifierKeyCode(code) {
  return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
          'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
          'CapsLock', 'NumLock', 'ScrollLock'].includes(code)
}

function resetModifiers() {
  try {
    if (pressedModifiers.Control) {
      keyboard.releaseKey('Control').catch(e => console.error('Control键释放失败:', e))
    }
    if (pressedModifiers.Shift) {
      keyboard.releaseKey('Shift').catch(e => console.error('Shift键释放失败:', e))
    }
    if (pressedModifiers.Alt) {
      keyboard.releaseKey('Alt').catch(e => console.error('Alt键释放失败:', e))
    }
    if (pressedModifiers.Meta) {
      keyboard.releaseKey('Meta').catch(e => console.error('Meta键释放失败:', e))
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

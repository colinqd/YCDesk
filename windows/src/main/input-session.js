const { screen } = require('electron')
const { validateInputCommand, INPUT_TYPES, isDeltaInputType, isBatchInputType } = require('../../shared/input-protocol')

const BUTTON_MAP = { 0: 'left', 1: 'middle', 2: 'right' }
const MIN_CLICK_INTERVAL_MS = 60
const DEDUP_MOUSEUP_WINDOW_MS = 100

class InputSession {
  constructor(sessionId, inputChannel, options = {}) {
    this.sessionId = sessionId
    this.inputChannel = inputChannel
    this.robot = options.robot || null
    this.logger = options.logger || null
    this.unlockInProgress = false

    this.currentMouseX = 0
    this.currentMouseY = 0
    this.lastMousedownTime = 0
    this.lastMouseupTime = 0

    this.pressedModifiers = { Control: false, Shift: false, Alt: false, Meta: false }
    this.pressedButtons = { left: false, right: false, middle: false }
    this.pressedKeys = new Set()

    this.wheelAccumulatorY = 0
    this.wheelAccumulatorX = 0
  }

  log(level, message, data) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, data)
    } else if (level === 'error') {
      console.error('[InputSession:' + this.sessionId + ']', message, data || '')
    }
  }

  initRobot() {
    try {
      this.robot = require('robotjs')
      const pos = this.robot.getMousePos()
      this.currentMouseX = pos.x
      this.currentMouseY = pos.y
      this.log('info', 'robotjs 加载成功! (session ' + this.sessionId + ')')
    } catch (e) {
      this.log('error', '无法加载 robotjs:', e.message)
      this.robot = null
    }
  }

  async handleRemoteInput(event, inputData) {
    // 先检查是否是解锁命令或锁屏命令，这些不需要robot
    const isUnlockCommand = 
      (inputData?.type === 'input' && (inputData?.inputType === 'unlock_screen' || inputData?.inputType === INPUT_TYPES.UNLOCK_SCREEN)) ||
      (inputData?.inputType === 'unlock_screen' || inputData?.inputType === INPUT_TYPES.UNLOCK_SCREEN) ||
      (inputData?.type === 'unlock_screen')

    if (isUnlockCommand) {
      this.log('info', '收到远程解锁请求')
      const { handleUnlockScreen } = require('./input-handler')
      const unlockResult = await handleUnlockScreen(inputData.password || (inputData.data && inputData.data.password))
      return unlockResult
    }

    const isLockCommand = 
      (inputData?.type === 'input' && (inputData?.inputType === 'lock_screen' || inputData?.inputType === INPUT_TYPES.LOCK_SCREEN)) ||
      (inputData?.inputType === 'lock_screen' || inputData?.inputType === INPUT_TYPES.LOCK_SCREEN) ||
      (inputData?.type === 'lock_screen')

    if (isLockCommand) {
      this.log('info', '收到远程锁屏请求')
      this.handleLockScreen()
      return { success: true }
    }

    // 之后才是需要robot的操作
    if (!this.robot) {
      this.log('warn', '输入控制未初始化')
      return { success: false, error: '输入控制未初始化' }
    }

    const screenSize = screen.getPrimaryDisplay().workAreaSize
    const screenWidth = screenSize.width
    const screenHeight = screenSize.height

    try {
      const validation = validateInputCommand(inputData)
      if (!validation.valid) {
        this.log('warn', '输入命令验证失败:', validation.errors)
        return { success: false, error: '无效命令: ' + validation.errors.join(', ') }
      }

      switch (inputData.inputType) {
        case INPUT_TYPES.MOUSE_MOVE:
          this.normalizeAndClamp(inputData.x, inputData.y, screenWidth, screenHeight)
          break

        case INPUT_TYPES.MOUSE_MOVE_DELTA:
          this.handleMouseMoveDelta(inputData.dx, inputData.dy, screenWidth, screenHeight)
          break

        case INPUT_TYPES.MOUSE_DOWN:
          this.handleMouseDown(
            inputData.x, inputData.y, inputData.button,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.MOUSE_UP:
          await this.handleMouseUp(
            inputData.x, inputData.y, inputData.button,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.MOUSE_CLICK:
          this.handleClick(
            inputData.x, inputData.y, inputData.button,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.MOUSE_DBLCLICK:
          this.handleDoubleClick(
            inputData.x, inputData.y, inputData.button,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.MOUSE_WHEEL:
          this.handleMouseWheel(
            inputData.deltaY || 0,
            inputData.deltaX || 0,
            inputData.x || 0.5, inputData.y || 0.5,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.MOUSE_WHEEL_BATCH:
          this.handleMouseWheelBatch(
            inputData.accumulatedDeltaY || 0,
            inputData.accumulatedDeltaX || 0,
            screenWidth, screenHeight
          )
          break

        case INPUT_TYPES.KEY_DOWN:
          this.handleKeyDown(
            inputData.code, inputData.key,
            inputData.ctrlKey, inputData.shiftKey,
            inputData.altKey, inputData.metaKey
          )
          break

        case INPUT_TYPES.KEY_UP:
          this.handleKeyUp(
            inputData.code, inputData.key,
            inputData.ctrlKey, inputData.shiftKey,
            inputData.altKey, inputData.metaKey
          )
          break

        case INPUT_TYPES.TEXT_INPUT:
          this.handleTextInput(inputData.text)
          break

        default:
          this.log('warn', '未知输入类型:', inputData.inputType)
      }
    } catch (error) {
      this.log('error', '处理输入失败:', error.message)
    }
  }

  normalizeAndClamp(x, y, screenWidth, screenHeight) {
    const clampedX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const clampedY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))
    try {
      this.robot.moveMouse(clampedX, clampedY)
      this.currentMouseX = clampedX
      this.currentMouseY = clampedY
    } catch (e) {
      this.log('error', '鼠标移动失败:', e.message)
    }
  }

  handleMouseMoveDelta(dx, dy, screenWidth, screenHeight) {
    const newX = this.currentMouseX + dx
    const newY = this.currentMouseY + dy
    const clampedX = Math.max(0, Math.min(screenWidth, Math.round(newX)))
    const clampedY = Math.max(0, Math.min(screenHeight, Math.round(newY)))
    try {
      this.robot.moveMouse(clampedX, clampedY)
      this.currentMouseX = clampedX
      this.currentMouseY = clampedY
    } catch (e) {
      this.log('error', '鼠标移动失败:', e.message)
    }
  }

  handleMouseDown(x, y, button, screenWidth, screenHeight) {
    const now = Date.now()
    const absX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const absY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))

    if (now - this.lastMousedownTime < MIN_CLICK_INTERVAL_MS) return
    this.lastMousedownTime = now

    const buttonName = BUTTON_MAP[button] || 'left'
    if (this.pressedButtons[buttonName]) return

    this.pressedButtons[buttonName] = true
    try {
      this.robot.moveMouse(absX, absY)
      this.currentMouseX = absX
      this.currentMouseY = absY
      this.robot.mouseToggle('down', buttonName)
    } catch (e) {
      this.log('error', '鼠标按下失败:', e.message)
    }
  }

  async sleepAsyncMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async handleMouseUp(x, y, button, screenWidth, screenHeight) {
    const now = Date.now()
    if (now - this.lastMouseupTime < DEDUP_MOUSEUP_WINDOW_MS) return
    this.lastMouseupTime = now

    const absX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const absY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))
    const buttonName = BUTTON_MAP[button] || 'left'

    if (!this.pressedButtons[buttonName]) return

    try {
      this.robot.moveMouse(absX, absY)
      this.currentMouseX = absX
      this.currentMouseY = absY
      this.robot.mouseToggle('up', buttonName)
      this.pressedButtons[buttonName] = false
    } catch (e) {
      this.log('error', '鼠标释放失败:', e.message)
      this.pressedButtons[buttonName] = false
    }
  }

  handleClick(x, y, button, screenWidth, screenHeight) {
    const absX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const absY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))
    const buttonName = BUTTON_MAP[button] || 'left'
    try {
      this.robot.moveMouse(absX, absY)
      this.currentMouseX = absX
      this.currentMouseY = absY
      this.robot.mouseClick(buttonName)
    } catch (e) {
      this.log('error', '鼠标点击失败:', e.message)
    }
  }

  handleDoubleClick(x, y, button, screenWidth, screenHeight) {
    const absX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const absY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))
    const buttonName = BUTTON_MAP[button] || 'left'
    try {
      this.robot.moveMouse(absX, absY)
      this.currentMouseX = absX
      this.currentMouseY = absY
      this.robot.mouseClick(buttonName, true)
    } catch (e) {
      this.log('error', '鼠标双击失败:', e.message)
    }
  }

  handleMouseWheel(deltaY, deltaX, x, y, screenWidth, screenHeight) {
    const absX = Math.max(0, Math.min(screenWidth, Math.round(x * screenWidth)))
    const absY = Math.max(0, Math.min(screenHeight, Math.round(y * screenHeight)))
    try {
      this.robot.moveMouse(absX, absY)
      this.currentMouseX = absX
      this.currentMouseY = absY
      if (deltaY !== 0) this.robot.scrollMouse(0, deltaY > 0 ? 1 : -1)
      if (deltaX !== 0) this.robot.scrollMouse(deltaX > 0 ? 1 : -1, 0)
    } catch (e) {
      this.log('error', '滚轮操作失败:', e.message)
    }
  }

  handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX, screenWidth, screenHeight) {
    const scrollY = Math.round(accumulatedDeltaY / 53)
    const scrollX = Math.round(accumulatedDeltaX / 53)
    try {
      if (scrollY !== 0) this.robot.scrollMouse(0, scrollY > 0 ? 1 : -1)
      if (scrollX !== 0) this.robot.scrollMouse(scrollX > 0 ? 1 : -1, 0)
      this.wheelAccumulatorY = 0
      this.wheelAccumulatorX = 0
    } catch (e) {
      this.log('error', '批量滚轮失败:', e.message)
    }
  }

  handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
    const robotKey = this.getRobotjsKey(code || key)
    if (!robotKey) return

    try {
      if (ctrlKey && !this.pressedModifiers.Control) { this.robot.keyToggle('control', 'down'); this.pressedModifiers.Control = true }
      if (shiftKey && !this.pressedModifiers.Shift) { this.robot.keyToggle('shift', 'down'); this.pressedModifiers.Shift = true }
      if (altKey && !this.pressedModifiers.Alt) { this.robot.keyToggle('alt', 'down'); this.pressedModifiers.Alt = true }
      if (metaKey && !this.pressedModifiers.Meta) { this.robot.keyToggle('command', 'down'); this.pressedModifiers.Meta = true }

      this.robot.keyToggle(robotKey, 'down')
      this.pressedKeys.add(robotKey)
    } catch (e) {
      this.log('error', '按键模拟失败:', e.message)
    }
  }

  handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
    const robotKey = this.getRobotjsKey(code || key)
    if (!robotKey) return

    try {
      this.robot.keyToggle(robotKey, 'up')
      this.pressedKeys.delete(robotKey)

      if (!ctrlKey && this.pressedModifiers.Control) { this.robot.keyToggle('control', 'up'); this.pressedModifiers.Control = false }
      if (!shiftKey && this.pressedModifiers.Shift) { this.robot.keyToggle('shift', 'up'); this.pressedModifiers.Shift = false }
      if (!altKey && this.pressedModifiers.Alt) { this.robot.keyToggle('alt', 'up'); this.pressedModifiers.Alt = false }
      if (!metaKey && this.pressedModifiers.Meta) { this.robot.keyToggle('command', 'up'); this.pressedModifiers.Meta = false }
    } catch (e) {
      this.log('error', '释放按键失败:', e.message)
    }
  }

  getRobotjsKey(code) {
    if (!code) return null
    const keyName = String(code).trim()
    if (keyName.length === 1) return keyName
    const codePrefixMap = {
      'Key': key => key.slice(3).toLowerCase(),
      'Digit': key => key.slice(5),
      'Numpad': key => 'numpad_' + key.slice(6).toLowerCase(),
      'Arrow': key => key.slice(5).toLowerCase(),
      'F': key => 'f' + key.slice(1)
    }
    for (const [prefix, mapper] of Object.entries(codePrefixMap)) {
      if (keyName.startsWith(prefix) && keyName !== prefix) return mapper(keyName)
    }
    const specialMap = {
      'Space': 'space', 'Enter': 'enter', 'Tab': 'tab', 'Escape': 'escape',
      'Backspace': 'backspace', 'Delete': 'delete', 'Insert': 'insert',
      'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
      'CapsLock': 'capslock', 'NumLock': 'numlock', 'ScrollLock': 'scrolllock',
      'ShiftLeft': 'shift', 'ShiftRight': 'shift',
      'ControlLeft': 'control', 'ControlRight': 'control',
      'AltLeft': 'alt', 'AltRight': 'alt',
      'MetaLeft': 'command', 'MetaRight': 'command',
      'PrintScreen': 'printscreen', 'Pause': 'pause',
      'Semicolon': ';', 'Equal': '=', 'Comma': ',', 'Minus': '-',
      'Period': '.', 'Slash': '/', 'Backquote': '`',
      'BracketLeft': '[', 'BracketRight': ']', 'Backslash': '\\',
      'Quote': '\'', 'IntlBackslash': '\\',
      'OSLeft': 'command', 'OSRight': 'command'
    }
    return specialMap[keyName] || keyName.toLowerCase()
  }

  handleTextInput(text) {
    if (!text || !this.robot) return
    try {
      this.robot.typeString(text)
    } catch (e) {
      this.log('error', '文本输入失败:', e.message)
    }
  }

  handleLockScreen() {
    this.log('info', '[InputSession] handleLockScreen 被调用，准备转发到 input-handler')
    try {
      const { handleLockScreen } = require('./input-handler')
      if (typeof handleLockScreen === 'function') {
        this.log('info', '[InputSession] 成功导入 handleLockScreen 函数，开始执行')
        handleLockScreen()
        this.log('info', '[InputSession] handleLockScreen 执行完毕')
      } else {
        this.log('error', '[InputSession] handleLockScreen 不是函数:', typeof handleLockScreen)
      }
    } catch (e) {
      this.log('error', '[InputSession] 调用 handleLockScreen 失败:', e.message)
      this.log('error', '[InputSession] 错误堆栈:', e.stack)
    }
  }

  resetModifiers() {
    const modifierKeys = ['control', 'shift', 'alt', 'command']
    const modifierMap = { Control: 'control', Shift: 'shift', Alt: 'alt', Meta: 'command' }
    if (this.robot) {
      try {
        for (const [name, key] of Object.entries(modifierMap)) {
          if (this.pressedModifiers[name]) {
            this.robot.keyToggle(key, 'up')
          }
        }
      } catch (e) { /* 按键复位失败，状态已重置 */ }
    }
    this.pressedModifiers = { Control: false, Shift: false, Alt: false, Meta: false }
  }

  resetAllInputState() {
    this.resetModifiers()

    for (const btn of ['left', 'right', 'middle']) {
      if (this.pressedButtons[btn] && this.robot) {
        try { this.robot.mouseToggle('up', btn) } catch (e) { /* 鼠标按键复位失败，状态已重置 */ }
      }
    }
    this.pressedButtons = { left: false, right: false, middle: false }
    this.pressedKeys.clear()
  }

  cleanup() {
    this.resetAllInputState()
    this.currentMouseX = 0
    this.currentMouseY = 0
    this.lastMousedownTime = 0
    this.lastMouseupTime = 0
    this.wheelAccumulatorY = 0
    this.wheelAccumulatorX = 0
    this.inputChannel = null
    this.log('info', '输入会话已清理: ' + this.sessionId)
  }
}

module.exports = InputSession
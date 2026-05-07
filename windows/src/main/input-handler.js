const { screen } = require('electron')
const { exec, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const { validateInputCommand, parseInputCommand, INPUT_TYPES, isDeltaInputType, isBatchInputType, KEY_CODE_MAP: SHARED_KEY_CODE_MAP } = require('../../shared/input-protocol')
const credentialsManager = require('./credentials-manager')
const sharedMemoryManager = require('./shared-memory-manager')

let robot = null
let logger = null
let initialized = false
let unlockInProgress = false

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
let lastMousedownTime = 0
let lastMouseupTime = 0
const MIN_CLICK_INTERVAL_MS = 60
const DEDUP_MOUSEUP_WINDOW_MS = 100
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
  'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5', 'F6': 'f6',
  'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
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

function getRobotjsKey(code) {
  if (ROBOTJS_KEY_MAP[code]) return ROBOTJS_KEY_MAP[code]
  if (SHARED_KEY_CODE_MAP[code]) {
    const mapped = SHARED_KEY_CODE_MAP[code]
    if (mapped.length === 1) return mapped.toLowerCase()
    return mapped.toLowerCase()
  }
  return code.toLowerCase()
}

const DIAG_LOG_FILE = 'C:\\ProgramData\\YCDesk\\input_handler.log'

function diagLog(message) {
  try {
    const flagDir = 'C:\\ProgramData\\YCDesk'
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true })
    const ts = new Date().toISOString()
    fs.appendFileSync(DIAG_LOG_FILE, `[${ts}] ${message}\n`, 'utf8')
  } catch (e) {}
}

async function handleRemoteInput(event, inputData) {
  diagLog(`handleRemoteInput called: type=${inputData?.type} inputType=${inputData?.inputType} hasPassword=${!!inputData?.password}`)
  log('info', '=== handleRemoteInput 被调用 ===')
  log('info', '收到的 inputData:', { 
    type: inputData?.type, 
    inputType: inputData?.inputType,
    password: inputData?.password ? `length ${inputData.password.length}` : null
  })
  log('info', '完整 inputData:', inputData)

  const isUnlockCommand = 
    (inputData?.type === 'input' && (inputData?.inputType === 'unlock_screen' || inputData?.inputType === INPUT_TYPES.UNLOCK_SCREEN)) ||
    (inputData?.inputType === 'unlock_screen' || inputData?.inputType === INPUT_TYPES.UNLOCK_SCREEN) ||
    (inputData?.type === 'unlock_screen')

  if (isUnlockCommand) {
    diagLog('unlock command detected, calling handleUnlockScreen')
    log('info', '=== 解锁命令被识别 ===')
    const remotePassword = inputData.password || (inputData.data && inputData.data.password)
    log('info', '远程密码:', remotePassword ? `length ${remotePassword.length}` : 'null')
    await handleUnlockScreen(remotePassword || '')
    return
  }
  
  if (!robot) {
    diagLog('robot not initialized, cannot process non-unlock input')
    log('warn', 'robot未初始化，无法处理输入')
    return
  }
  
  try {
    // 验证其他输入命令
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
      case INPUT_TYPES.MOUSE_MOVE_ABSOLUTE:
        handleMouseMove(x, y, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_MOVE_DELTA:
        handleMouseMoveDelta(dx, dy, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_DOWN:
        handleMouseDown(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_UP:
        await handleMouseUp(x, y, button, screenWidth, screenHeight)
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
  lastMousedownTime = Date.now()
}

function sleepSyncMs(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {}
}

function sleepAsyncMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function handleMouseUp(x, y, button, screenWidth, screenHeight) {
  const now = Date.now()
  const mouseButton = getButtonName(button)

  if (!pressedButtons[mouseButton]) {
    if (now - lastMouseupTime < DEDUP_MOUSEUP_WINDOW_MS) {
      return
    }

    if (now - lastMousedownTime < DEDUP_MOUSEUP_WINDOW_MS) {
      pressedButtons[mouseButton] = true
    } else {
      if (x !== undefined && y !== undefined) {
        const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
        currentMouseX = pos.x
        currentMouseY = pos.y
        robot.moveMouse(pos.x, pos.y)
      }
      pressedButtons[mouseButton] = true
      robot.mouseToggle('down', mouseButton)
      lastMousedownTime = Date.now()
    }
  }

  if (x !== undefined && y !== undefined && pressedButtons[mouseButton]) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    robot.moveMouse(pos.x, pos.y)
  }

  const elapsed = Date.now() - lastMousedownTime
  if (elapsed < MIN_CLICK_INTERVAL_MS) {
    await sleepAsyncMs(MIN_CLICK_INTERVAL_MS - elapsed)
  }

  pressedButtons[mouseButton] = false
  robot.mouseToggle('up', mouseButton)
  lastMouseupTime = Date.now()
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
    wheelAccumulatorY += deltaY
    const scrollAmount = Math.trunc(wheelAccumulatorY / 40)
    if (scrollAmount !== 0) {
      robot.scrollMouse(0, -scrollAmount)
      wheelAccumulatorY -= scrollAmount * 40
    }
  }
  
  if (deltaX) {
    wheelAccumulatorX += deltaX
    const scrollAmountX = Math.trunc(wheelAccumulatorX / 40)
    if (scrollAmountX !== 0) {
      robot.scrollMouse(-scrollAmountX, 0)
      wheelAccumulatorX -= scrollAmountX * 40
    }
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
      const robotKey = getRobotjsKey(code) || key || code.toLowerCase()
      
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
      const robotKey = getRobotjsKey(code) || key || code.toLowerCase()

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
        const robotKey = getRobotjsKey(code) || code.toLowerCase()
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

async function handleUnlockScreen(remotePassword) {
  diagLog(`handleUnlockScreen START, remotePassword length=${remotePassword ? remotePassword.length : 0}`)
  log('info', '═══════════════════════════════════════════')
  log('info', '[解锁] handleUnlockScreen 开始执行')
  log('info', `[解锁] remotePassword 存在: ${!!remotePassword}, 长度: ${remotePassword ? remotePassword.length : 0}`)

  if (unlockInProgress) {
    diagLog('handleUnlockScreen: unlock already in progress, ignoring')
    log('warn', '[解锁] 解锁已在进行中，忽略重复请求')
    return
  }

  unlockInProgress = true

  try {
    const hasRemotePassword = remotePassword && remotePassword.length > 0
    log('info', `[解锁] remotePassword 存在: ${hasRemotePassword}, 长度: ${hasRemotePassword ? remotePassword.length : 0}`)

    let passwordToUse = null
    let passwordSource = null
    let usernameToUse = null

    try {
      diagLog('handleUnlockScreen: reading local password...')
      log('info', '[解锁] 尝试读取本地保存的密码...')
      const localResult = await credentialsManager.getUnlockPassword()
      log('info', `[解锁] 本地密码结果: ${JSON.stringify(localResult)}`)
      if (localResult.success && localResult.password) {
        passwordToUse = localResult.password
        passwordSource = '本地'
        diagLog(`handleUnlockScreen: local password found, length=${passwordToUse.length}`)
        log('info', `[解锁] 使用本地保存的密码，长度: ${passwordToUse.length}`)
      } else {
        diagLog('handleUnlockScreen: no local password')
        log('info', '[解锁] 本地密码读取失败或无密码')
      }
    } catch (e) {
      diagLog(`handleUnlockScreen: local password read error: ${e.message}`)
      log('error', `[解锁] 读取本地密码出错: ${e.message}`)
    }

    if (!passwordToUse && hasRemotePassword) {
      passwordToUse = remotePassword
      passwordSource = '远程'
      diagLog(`handleUnlockScreen: using remote password, length=${passwordToUse.length}`)
      log('info', `[解锁] 使用远程传入的密码，长度: ${passwordToUse.length}`)
    }

    // 方案 0: 临时文件 + 解锁辅助脚本（最简单最可靠）
    if (passwordToUse) {
      log('info', '[解锁] 方案 0: 写入临时密码文件...')
      try {
        const shmResult = await sharedMemoryManager.writePasswordSimple(passwordToUse)
        log('info', `[解锁] 临时文件写入结果: ${JSON.stringify(shmResult)}`)
        if (shmResult.success) {
          log('info', '[解锁] ✅ 密码已写入临时文件')

          // 调用解锁辅助脚本
          const helperPath = path.join(__dirname, '../resources/unlock-helper.ps1')
          log('info', `[解锁] 调用解锁辅助脚本: ${helperPath}`)

          const psPath = path.join(process.env.SystemRoot || 'C:\\Windows',
            'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

          if (fs.existsSync(helperPath)) {
            const psChild = execFile(psPath, [
              '-ExecutionPolicy', 'Bypass',
              '-NoProfile',
              '-WindowStyle', 'Normal',
              '-File', helperPath
            ], { timeout: 30000 }, (err, stdout, stderr) => {
              if (err) {
                log('warn', `[解锁] 辅助脚本执行失败: ${err.message}`)
                if (stdout) log('info', `[解锁] 辅助脚本 stdout: ${stdout.trim()}`)
                if (stderr) log('info', `[解锁] 辅助脚本 stderr: ${stderr.trim()}`)
              } else {
                log('info', `[解锁] ✅ 辅助脚本执行成功: ${stdout.trim()}`)
              }
            })
          } else {
            log('warn', `[解锁] 辅助脚本不存在: ${helperPath}`)
          }
        }
      } catch (e) {
        log('warn', `[解锁] 临时文件写入失败: ${e.message}`)
      }
    }

    // 获取当前用户名
    usernameToUse = process.env.USERNAME || process.env.USER || 'Administrator'
    log('info', `[解锁] 当前用户名: ${usernameToUse}`)

    // 始终尝试 Credential Provider 解锁（不依赖注册表检查）
    // CP 通过标志文件工作，即使注册表检查失败也应尝试
    diagLog(`handleUnlockScreen: trying CP with user=${usernameToUse}, hasPwd=${!!passwordToUse}`)
    log('info', '[解锁] 尝试 Credential Provider 解锁...')
    try {
      let cpUsername = usernameToUse || process.env.USERNAME || 'Administrator'
      let cpPassword = passwordToUse || ''
      
      const cpResult = await credentialsManager.unlockWithCredentialProvider(cpUsername, cpPassword)
      diagLog(`handleUnlockScreen: CP result: ${JSON.stringify(cpResult)}`)
      log('info', `[解锁] Credential Provider 结果: ${JSON.stringify(cpResult)}`)
      if (cpResult.success) {
        diagLog('handleUnlockScreen: CP credentials set, CP DLL will auto-detect via polling')
        log('info', '[解锁] ✅ Credential Provider 凭据已设置，CP DLL 轮询检测中')
        log('info', '═══════════════════════════════════════════')
        return
      }
      log('warn', `[解锁] Credential Provider 设置失败: ${cpResult.message}`)
    } catch (e) {
      diagLog(`handleUnlockScreen: CP exception: ${e.message}`)
      log('warn', `[解锁] Credential Provider 异常: ${e.message}`)
    }

    const { getServiceIntegration } = require('./service-integration')
    const serviceIntegration = getServiceIntegration()
    const serviceModeEnabled = serviceIntegration.isServiceModeEnabled()

    log('info', `[解锁] 服务模式状态: ${serviceModeEnabled ? '已启用' : '未启用'}, 密码来源: ${passwordSource || '无'}`)

    if (serviceModeEnabled && passwordToUse) {
      log('info', '[解锁] 尝试通过服务模式解锁...')
      try {
        log('info', `[解锁] 调用 serviceIntegration.unlockScreen(密码长度=${passwordToUse.length})`)
        const result = await serviceIntegration.unlockScreen(passwordToUse)
        log('info', `[解锁] 服务模式完整返回: ${JSON.stringify(result)}`)
        log('info', `[解锁] result.success=${result?.success}`)
        log('info', `[解锁] result.data=${JSON.stringify(result?.data || {})}`)
        log('info', `[解锁] result.data.success=${result?.data?.success}`)
        if (result && result.data && result.data.success) {
          log('info', '[解锁] ✅ 服务模式解锁成功，结束流程')
          log('info', '═══════════════════════════════════════════')
          return
        }
        log('warn', '[解锁] 服务模式返回未成功，尝试其他方式')
      } catch (e) {
        log('warn', `[解锁] 服务模式解锁出错: ${e.message}`)
        log('warn', `[解锁] 错误堆栈: ${e.stack || '无'}`)
      }
    } else if (serviceModeEnabled && !passwordToUse) {
      log('warn', '[解锁] 服务模式已启用但无可用密码，跳过服务模式')
    }

    if (passwordToUse) {
      log('info', `[解锁] 尝试 SendInput API 解锁（密码来源: ${passwordSource}, 长度: ${passwordToUse.length}）...`)
      try {
        await unlockViaSendInput(passwordToUse)
        log('info', '[解锁] ✅ SendInput 解锁已执行，结束流程')
        log('info', '═══════════════════════════════════════════')
        return
      } catch (e) {
        log('warn', `[解锁] SendInput 解锁失败: ${e.message}`)
        log('warn', `[解锁] 错误堆栈: ${e.stack || '无'}`)
      }
    } else {
      log('warn', '[解锁] 没有可用密码，跳过 SendInput 方式')
    }

    if (passwordToUse && robot) {
      log('info', `[解锁] 尝试 robotjs 模拟键盘解锁（长度: ${passwordToUse.length}）...`)
      try {
        await unlockViaRobotjs(passwordToUse)
        log('info', '[解锁] ✅ robotjs 解锁已执行，结束流程')
        log('info', '═══════════════════════════════════════════')
        return
      } catch (e) {
        log('warn', `[解锁] robotjs 解锁失败: ${e.message}`)
        log('warn', `[解锁] 错误堆栈: ${e.stack || '无'}`)
      }
    } else if (!robot) {
      log('warn', '[解锁] robot 模块未加载，跳过 robotjs 方式')
    } else {
      log('warn', '[解锁] 没有可用密码，跳过 robotjs 方式')
    }

    log('info', '[解锁] 尝试 tscon.exe 解锁（无需密码）...')
    try {
      const tsconResult = await unlockViaTscon()
      if (tsconResult) {
        log('info', '[解锁] ✅ tscon.exe 解锁成功')
        log('info', '═══════════════════════════════════════════')
        return
      }
    } catch (e) {
      log('warn', `[解锁] tscon.exe 解锁失败: ${e.message}`)
      log('warn', `[解锁] 错误堆栈: ${e.stack || '无'}`)
    }

    log('warn', '[解锁] ❌ 所有解锁方式均失败')
    log('info', '═══════════════════════════════════════════')
  } finally {
    unlockInProgress = false
    log('info', '[解锁] unlockInProgress 标志已重置')
  }
}

async function unlockViaTscon() {
  log('info', '[tscon] ========== unlockViaTscon 开始 ==========')
  return new Promise((resolve, reject) => {
    log('info', '[tscon] 正在获取当前控制台会话ID...')

    const powershellPath = process.env.SYSTEMROOT ? `${process.env.SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe'
    execFile(powershellPath, [
      '-Command',
      `try { $sessions = query session; $consoleLine = $sessions | Where-Object { $_ -match 'console' }; if ($consoleLine) { ($consoleLine -split '\\s+')[2] } else { (query session | Where-Object { $_ -match '^>' }) -split '\\s+' | Select-Object -Index 2 } } catch { $env:SESSIONNAME -replace '.*?(\\d+)', '$1' }`
    ], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        log('warn', `[tscon] 获取会话ID失败: ${err.message}`)
        reject(err)
        return
      }

      const sessionId = stdout.trim()
      log('info', `[tscon] 获取到会话ID: "${sessionId}"`)

      if (!sessionId || !/^\d+$/.test(sessionId)) {
        log('warn', `[tscon] 会话ID无效: "${sessionId}"，尝试使用默认会话ID 1`)
        const defaultSessionId = '1'
        log('info', `[tscon] 使用默认会话ID: ${defaultSessionId}`)
        executeTscon(defaultSessionId, resolve, reject)
      } else {
        log('info', `[tscon] 使用获取到的会话ID: ${sessionId}`)
        executeTscon(sessionId, resolve, reject)
      }
    })
  })
}

function executeTscon(sessionId, resolve, reject) {
  const taskName = 'YCDeskUnlock'
  log('info', `[tscon] 清理旧任务: ${taskName}`)

  execFile('schtasks', ['/delete', '/tn', taskName, '/f'], { timeout: 3000 }, (deleteErr) => {
    if (deleteErr) {
      log('info', `[tscon] 旧任务不存在或清理失败（可忽略）: ${deleteErr.message}`)
    } else {
      log('info', '[tscon] 旧任务已清理')
    }

    const tsconCmd = `tscon.exe ${sessionId} /dest:console`
    log('info', `[tscon] 准备创建计划任务: "${tsconCmd}"`)

    execFile('schtasks', [
      '/create', '/tn', taskName,
      '/tr', tsconCmd,
      '/sc', 'once', '/st', '00:00',
      '/ru', 'SYSTEM', '/f'
    ], { timeout: 5000 }, (createErr) => {
      if (createErr) {
        log('error', `[tscon] 创建计划任务失败: ${createErr.message}`)
        reject(createErr)
        return
      }

      log('info', '[tscon] 计划任务创建成功，正在执行...')
      execFile('schtasks', ['/run', '/tn', taskName], { timeout: 5000 }, (runErr) => {
        log('info', '[tscon] 计划任务执行完毕，正在清理...')
        execFile('schtasks', ['/delete', '/tn', taskName, '/f'], { timeout: 3000 }, () => {
          if (runErr) {
            log('warn', `[tscon] 执行计划任务失败: ${runErr.message}`)
            reject(runErr)
          } else {
            log('info', '[tscon] ✅ tscon.exe 解锁命令已成功执行')
            log('info', '[tscon] ========== unlockViaTscon 结束 ==========')
            resolve(true)
          }
        })
      })
    })
  })
}

async function unlockViaSendInput(password) {
  log('info', `[SendInput] ========== unlockViaSendInput 开始，密码长度: ${password.length} ==========`)
  const b64Password = Buffer.from(password, 'utf16le').toString('base64')
  log('info', `[SendInput] Base64密码长度: ${b64Password.length}`)

  const escapedPassword = b64Password.replace(/'/g, "''").replace(/"/g, '`"').replace(/\$/g, '`$').replace(/`/g, '``')

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class InputHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public KEYBDINPUT ki;
        public uint padding1;
        public uint padding2;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public static void TypeString(string text) {
        foreach (char c in text) {
            INPUT[] inputs = new INPUT[2];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].ki.wScan = (ushort)c;
            inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].ki.wScan = (ushort)c;
            inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
        }
    }

    public static void TapKey(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = vk;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = vk;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

# Step 1: 唤醒锁屏界面（多次按空格确保激活）
for ($i = 0; $i -lt 5; $i++) {
    [InputHelper]::TapKey(0x20)
    Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 1000

# Step 2: 清除可能存在的旧输入（多次Backspace）
for ($i = 0; $i -lt 50; $i++) {
    [InputHelper]::TapKey(0x08)
    Start-Sleep -Milliseconds 50
}
Start-Sleep -Milliseconds 500

# Step 3: 输入密码
$pwdBytes = [System.Convert]::FromBase64String("${escapedPassword}")
$pwdText = [System.Text.Encoding]::Unicode.GetString($pwdBytes)

# 逐字符输入，确保每个字符都有足够延迟
foreach ($c in $pwdText.ToCharArray()) {
    [InputHelper]::TypeString($c.ToString())
    Start-Sleep -Milliseconds 100
}

# Step 4: 等待一会儿再按回车
Start-Sleep -Milliseconds 1000
[InputHelper]::TapKey(0x0D)
`

  log('info', '[SendInput] 正在执行 PowerShell 解锁脚本...')
  const powershellPath = process.env.SYSTEMROOT ? `${process.env.SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe'
  log('info', `[SendInput] PowerShell 路径: ${powershellPath}`)
  return new Promise((resolve, reject) => {
    const child = execFile(powershellPath, [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-NoProfile',
      '-Command', psScript
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log('warn', `[SendInput] 解锁脚本出错: ${err.message}`)
        if (stdout) log('info', `[SendInput] stdout: ${stdout.trim()}`)
        if (stderr) log('info', `[SendInput] stderr: ${stderr.trim()}`)
        reject(err)
      } else {
        log('info', '[SendInput] ✅ 解锁脚本执行成功')
        if (stdout) log('info', `[SendInput] stdout: ${stdout.trim()}`)
        if (stderr) log('info', `[SendInput] stderr: ${stderr.trim()}`)
        log('info', '[SendInput] ========== unlockViaSendInput 结束 ==========')
        resolve()
      }
    })

    child.on('error', (e) => {
      log('error', `[SendInput] PowerShell 进程错误: ${e.message}`)
      reject(e)
    })
  })
}

async function unlockViaRobotjs(password) {
  log('info', `[robotjs] ========== unlockViaRobotjs 开始，密码长度: ${password.length} ==========`)
  const primaryDisplay = screen.getPrimaryDisplay()
  const centerX = Math.floor(primaryDisplay.size.width / 2)
  const centerY = Math.floor(primaryDisplay.size.height / 2)
  log('info', `[robotjs] 屏幕尺寸: ${primaryDisplay.size.width}x${primaryDisplay.size.height}, 中心: (${centerX}, ${centerY})`)

  log('info', '[robotjs] 按任意键唤醒屏幕...')
  robot.keyTap('shift')
  await sleep(1000)

  log('info', '[robotjs] 点击屏幕中央聚焦...')
  robot.moveMouse(centerX, centerY)
  await sleep(100)
  robot.mouseClick()
  await sleep(1500)

  log('info', '[robotjs] 再次点击确保聚焦密码框...')
  robot.mouseClick()
  await sleep(1000)

  log('info', `[robotjs] 输入密码: ${password.length} 个字符...`)
  
  for (let i = 0; i < password.length; i++) {
    const char = password[i]
    log('info', `[robotjs] 输入第 ${i + 1} 个字符: '${char}'`)
    robot.typeString(char)
    await sleep(100)
  }

  await sleep(500)
  log('info', '[robotjs] 按回车确认...')
  robot.keyTap('enter')
  await sleep(500)
  log('info', '[robotjs] ✅ unlockViaRobotjs 执行完成')
  log('info', '[robotjs] ========== unlockViaRobotjs 结束 ==========')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanup() {
  resetAllInputState()
  currentMouseX = 0
  currentMouseY = 0
  pressedKeys = new Set()
  pressedButtons = { left: false, right: false, middle: false }
  pressedModifiers = { Control: false, Shift: false, Alt: false, Meta: false }
  log('info', '输入处理器已清理')
}

module.exports = {
  handleRemoteInput,
  handleUnlockScreen,
  resetModifiers,
  resetAllInputState,
  cleanup,
  initLogger,
  flushInterpolationQueue: () => {}
}

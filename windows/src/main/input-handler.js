const { screen } = require('electron')
const { exec, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const { parseInputCommand, INPUT_TYPES, KEY_CODE_MAP } = require('../../shared/input-protocol')
const credentialsManager = require('./credentials-manager')
const sharedMemoryManager = require('./shared-memory-manager')

const keycodes = require('./keycodes')
const mouse = require('./mouse-normalizer')
const { getVkCode } = require('./key-to-vk')

// SendInput 后端（通过 input-sendinput.createClient 共享惰性初始化）
let _firstInputLogged = false
let _siUnavailableLogged = false

function _execKeyToggle(keyName, direction) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) {
    const vk = getVkCode(keyName)
    if (vk) {
      if (direction === 'down') si.keyDown(vk)
      else si.keyUp(vk)
    }
  } else if (!_siUnavailableLogged) {
    _siUnavailableLogged = true
    log('error', '[输入] SendInput 不可用，按键输入被丢弃')
  }
}

function _execTypeString(text) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) si.typeString(text)
  else if (!_siUnavailableLogged) {
    _siUnavailableLogged = true
    log('error', '[输入] SendInput 不可用，文本输入被丢弃: ' + text.substring(0, 20))
  }
}

function _execMouseToggle(direction, btnName) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) {
    const btnNum = btnName === 'right' ? 2 : (btnName === 'middle' ? 1 : 0)
    if (direction === 'down') si.mouseDown(btnNum)
    else si.mouseUp(btnNum)
  } else if (!_siUnavailableLogged) {
    _siUnavailableLogged = true
    log('error', '[输入] SendInput 不可用，鼠标输入被丢弃')
  }
}

// 向 keycodes 注册 shared 按键映射表
keycodes.setSharedKeyCodeMap(KEY_CODE_MAP)

const {
  pressedModifiers,
  pressedKeys,
  resetPressedState
} = keycodes

const { setMouseLogger } = mouse

let logger = null
let initialized = false
let unlockInProgress = false
let _screenWidth = 0
let _screenHeight = 0

function _updateScreenCache() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    _screenWidth = primaryDisplay.size.width
    _screenHeight = primaryDisplay.size.height
  } catch (e) { /* 初始化时可能尚无显示信息 */ }
}

function initLogger(logInstance) {
  logger = logInstance
  setMouseLogger(logInstance)
  if (!initialized) {
    initialized = true
    _updateScreenCache()
    screen.on('display-metrics-changed', _updateScreenCache)
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
  log('info', '初始化输入控制: 使用 SendInput (PowerShell C#)')
  log('info', 'SendInput 将在首次使用时延迟初始化')
}

const DIAG_LOG_FILE = 'C:\\ProgramData\\YCDesk\\input_handler.log'
let _diagEnabled = false

function setDiagEnabled(enabled) {
  _diagEnabled = !!enabled
}

function diagLog(message) {
  if (!_diagEnabled) return
  try {
    const flagDir = 'C:\\ProgramData\\YCDesk'
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true })
    const ts = new Date().toISOString()
    fs.appendFileSync(DIAG_LOG_FILE, `[${ts}] ${message}\n`, 'utf8')
  } catch (e) { /* 诊断日志写入失败不影响主功能 */ }
}

async function handleRemoteInput(event, inputData) {
  // 核诊断：直接写文件确认 handleRemoteInput 被调用
  try {
    const flagDir = 'C:\\ProgramData\\YCDesk'
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true })
    fs.appendFileSync('C:\\ProgramData\\YCDesk\\diag_handler.log', '[' + new Date().toISOString() + '] handleRemoteInput: ' + (inputData?.inputType || '?') + ' siAvailable=' + require("./input-sendinput").isAvailable + '\n', 'utf8')
  } catch (e) {}

  if (!_firstInputLogged) {
    _firstInputLogged = true
    log('info', '[输入] handleRemoteInput 首次被调用，inputType=' + (inputData?.inputType || '?') + ', siAvailable=' + require("./input-sendinput").isAvailable)
  }

  const isUnlockCommand =
    inputData?.inputType === 'unlock_screen' || inputData?.inputType === INPUT_TYPES.UNLOCK_SCREEN

  if (isUnlockCommand) {
    diagLog('unlock command detected, calling handleUnlockScreen')
    log('info', '=== 解锁命令被识别 ===')
    const remotePassword = inputData.password || (inputData.data && inputData.data.password)
    log('info', '远程密码:', remotePassword ? `length ${remotePassword.length}` : 'null')
    await handleUnlockScreen(remotePassword || '')
    return
  }

  const isLockCommand =
    inputData?.inputType === 'lock_screen' || inputData?.inputType === INPUT_TYPES.LOCK_SCREEN

  if (isLockCommand) {
    diagLog('lock command detected, calling handleLockScreen')
    log('info', '=== 锁屏命令被识别 ===')
    handleLockScreen()
    return
  }

  try {
    const input = parseInputCommand(inputData)
    if (!input) {
      log('warn', '输入解析失败')
      return
    }

    const {
      inputType,
      x, y, dx, dy,
      button, deltaY, deltaX,
      accumulatedDeltaY, accumulatedDeltaX,
      key, code, keyCode,
      ctrlKey, shiftKey, altKey, metaKey,
      text
    } = input

    const screenWidth = _screenWidth || screen.getPrimaryDisplay().size.width
	    const screenHeight = _screenHeight || screen.getPrimaryDisplay().size.height

    switch (inputType) {
      case INPUT_TYPES.MOUSE_MOVE:
        mouse.handleMouseMove(x, y, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_MOVE_DELTA:
        mouse.handleMouseMoveDelta(dx, dy, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_DOWN:
        mouse.handleMouseDown(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_UP:
        await mouse.handleMouseUp(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_WHEEL:
        mouse.handleMouseWheel(deltaY, deltaX, x, y, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_WHEEL_BATCH:
        mouse.handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX)
        break

      case INPUT_TYPES.KEY_DOWN:
        handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case INPUT_TYPES.KEY_UP:
        handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey)
        break

      case INPUT_TYPES.MOUSE_CLICK:
        mouse.handleClick(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.MOUSE_DBLCLICK:
        mouse.handleDoubleClick(x, y, button, screenWidth, screenHeight)
        break

      case INPUT_TYPES.LOCK_SCREEN:
        handleLockScreen()
        break

      case INPUT_TYPES.TEXT_INPUT:
        handleTextInput(text || '')
        break

      default:
        log('warn', '未知的输入类型:', inputType)
    }
  } catch (error) {
    log('error', '远程输入错误:', error.message)
  }
}

function handleLockScreen() {
  log('info', '[锁屏] ========== handleLockScreen 开始执行 ==========')
  diagLog('handleLockScreen START')

  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const rundll32Path = path.join(systemRoot, 'System32', 'rundll32.exe')

  log('info', '[锁屏] 系统目录: ' + systemRoot)
  log('info', '[锁屏] rundll32路径: ' + rundll32Path)
  diagLog('rundll32路径: ' + rundll32Path)

  try {
    log('info', '[锁屏] 方法1: 使用完整路径执行 rundll32.exe')
    diagLog('尝试方法1: 完整路径')

    execFile(rundll32Path, ['user32.dll,LockWorkStation'], (err) => {
      if (err) {
        log('error', '[锁屏] 方法1失败:', err.message)
        diagLog('方法1失败: ' + err.message)

        log('info', '[锁屏] 方法2: 尝试 PowerShell')
        diagLog('尝试方法2: PowerShell')

        const psPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

        execFile(psPath, [
          '-ExecutionPolicy', 'Bypass',
          '-NoProfile',
          '-WindowStyle', 'Hidden',
          '-Command',
          '(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { $_.Quit() }; rundll32.exe user32.dll,LockWorkStation'
        ], { timeout: 10000 }, (psErr) => {
          if (psErr) {
            log('error', '[锁屏] 方法2失败:', psErr.message)
            diagLog('方法2失败: ' + psErr.message)

            log('info', '[锁屏] 方法3: 尝试直接调用 user32.dll')
            diagLog('尝试方法3: user32.dll')

            exec('cmd /c "rundll32.exe user32.dll,LockWorkStation"', (cmdErr) => {
              if (cmdErr) {
                log('error', '[锁屏] 方法3失败:', cmdErr.message)
                diagLog('方法3失败: ' + cmdErr.message)
              } else {
                log('info', '[锁屏] 方法3成功')
                diagLog('方法3成功')
              }
            })
          } else {
            log('info', '[锁屏] 方法2成功')
            diagLog('方法2成功')
          }
        })
      } else {
        log('info', '[锁屏] 方法1成功')
        diagLog('方法1成功')
      }
    })
  } catch (e) {
    log('error', '[锁屏] 异常:', e.message)
    diagLog('异常: ' + e.message)
  }

  log('info', '[锁屏] ========== handleLockScreen 完成 ==========')
  diagLog('handleLockScreen END')
}

function handleTextInput(text) {
  if (!text) return
  try {
    _execTypeString(text)
    log('info', '[文本输入] 已输入: ' + text)
  } catch (e) {
    log('error', '[文本输入] 失败: ' + e.message)
  }
}

// ---- 键盘事件处理 ----

function handleKeyDown(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) return

  try {
    if (ctrlKey !== undefined && ctrlKey !== pressedModifiers.Control) {
      pressedModifiers.Control = ctrlKey
      _execKeyToggle('control', ctrlKey ? 'down' : 'up')
    }

    if (shiftKey !== undefined && shiftKey !== pressedModifiers.Shift) {
      pressedModifiers.Shift = shiftKey
      _execKeyToggle('shift', shiftKey ? 'down' : 'up')
    }

    if (altKey !== undefined && altKey !== pressedModifiers.Alt) {
      pressedModifiers.Alt = altKey
      _execKeyToggle('alt', altKey ? 'down' : 'up')
    }

    if (metaKey !== undefined && metaKey !== pressedModifiers.Meta) {
      pressedModifiers.Meta = metaKey
      _execKeyToggle('command', metaKey ? 'down' : 'up')
    }

    if (!keycodes.isModifierKeyCode(code)) {
      const robotKey = keycodes.getRobotjsKey(code) || key || code.toLowerCase()

      if (!pressedKeys.has(code)) {
        pressedKeys.add(code)
        _execKeyToggle(robotKey, 'down')
      }
    }
  } catch (e) {
    log('error', 'keydown 错误:', e.message)
  }
}

function handleKeyUp(code, key, ctrlKey, shiftKey, altKey, metaKey) {
  if (!code) return

  try {
    if (!keycodes.isModifierKeyCode(code)) {
      const robotKey = keycodes.getRobotjsKey(code) || key || code.toLowerCase()

      if (pressedKeys.has(code)) {
        pressedKeys.delete(code)
        _execKeyToggle(robotKey, 'up')
      }
    }

    if (ctrlKey === false && pressedModifiers.Control) {
      pressedModifiers.Control = false
      _execKeyToggle('control', 'up')
    }

    if (shiftKey === false && pressedModifiers.Shift) {
      pressedModifiers.Shift = false
      _execKeyToggle('shift', 'up')
    }

    if (altKey === false && pressedModifiers.Alt) {
      pressedModifiers.Alt = false
      _execKeyToggle('alt', 'up')
    }

    if (metaKey === false && pressedModifiers.Meta) {
      pressedModifiers.Meta = false
      _execKeyToggle('command', 'up')
    }
  } catch (e) {
    log('error', 'keyup 错误:', e.message)
  }
}

// ---- 状态重置 ----

function resetModifiers() {
  log('info', '重置输入修饰键状态')
  try {
    if (pressedModifiers.Control) {
      _execKeyToggle('control', 'up')
    }
    if (pressedModifiers.Shift) {
      _execKeyToggle('shift', 'up')
    }
    if (pressedModifiers.Alt) {
      _execKeyToggle('alt', 'up')
    }
    if (pressedModifiers.Meta) {
      _execKeyToggle('command', 'up')
    }

    for (const btn of ['left', 'right', 'middle']) {
      if (keycodes.pressedButtons[btn]) {
        _execMouseToggle('up', btn)
      }
    }

    for (const code of pressedKeys) {
      const robotKey = keycodes.getRobotjsKey(code) || code.toLowerCase()
      _execKeyToggle(robotKey, 'up')
    }
    pressedKeys.clear()
  } catch (e) {
    log('error', '重置错误:', e.message)
  }

  pressedModifiers.Control = false
  pressedModifiers.Shift = false
  pressedModifiers.Alt = false
  pressedModifiers.Meta = false
}

function resetAllInputState() {
  log('info', '重置所有输入状态')
  resetModifiers()
  mouse.resetMouseState()
  keycodes.resetPressedState()
}

// ---- 解锁屏幕 ----

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

    // 方案 0: 临时文件 + 解锁辅助脚本
    if (passwordToUse) {
      log('info', '[解锁] 方案 0: 写入临时密码文件...')
      try {
        const shmResult = await sharedMemoryManager.writePasswordSimple(passwordToUse)
        log('info', `[解锁] 临时文件写入结果: ${JSON.stringify(shmResult)}`)
        if (shmResult.success) {
          log('info', '[解锁] ✅ 密码已写入临时文件')

          const helperPath = path.join(__dirname, '../resources/unlock-helper.ps1')
          log('info', `[解锁] 调用解锁辅助脚本: ${helperPath}`)

          const psPath = path.join(process.env.SystemRoot || 'C:\\Windows',
            'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

          if (fs.existsSync(helperPath)) {
            execFile(psPath, [
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

    // 始终尝试 Credential Provider 解锁
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
        if (result && result.data && result.data.success) {
          log('info', '[解锁] ✅ 服务模式解锁成功，结束流程')
          log('info', '═══════════════════════════════════════════')
          return
        }
        log('warn', '[解锁] 服务模式返回未成功，尝试其他方式')
      } catch (e) {
        log('warn', `[解锁] 服务模式解锁出错: ${e.message}`)
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
      }
    } else {
      log('warn', '[解锁] 没有可用密码，跳过 SendInput 方式')
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
        executeTscon('1', resolve, reject)
      } else {
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

# Step 1: 唤醒锁屏界面
for ($i = 0; $i -lt 5; $i++) {
    [InputHelper]::TapKey(0x20)
    Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 1000

# Step 2: 清除可能存在的旧输入
for ($i = 0; $i -lt 50; $i++) {
    [InputHelper]::TapKey(0x08)
    Start-Sleep -Milliseconds 50
}
Start-Sleep -Milliseconds 500

# Step 3: 输入密码
$pwdBytes = [System.Convert]::FromBase64String("${escapedPassword}")
$pwdText = [System.Text.Encoding]::Unicode.GetString($pwdBytes)

foreach ($c in $pwdText.ToCharArray()) {
    [InputHelper]::TypeString($c.ToString())
    Start-Sleep -Milliseconds 100
}

# Step 4: 等待后按回车
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

function cleanup() {
  resetAllInputState()
  mouse.resetMouseState()
  keycodes.resetPressedState()
  log('info', '输入处理器已清理')
}

module.exports = {
  handleRemoteInput,
  handleUnlockScreen,
  handleLockScreen,
  resetModifiers,
  resetAllInputState,
  cleanup,
  initLogger,
  setDiagEnabled
}

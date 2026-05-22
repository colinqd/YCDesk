/**
 * 鼠标坐标归一化与事件处理
 *
 * 使用 SendInput (PowerShell C#) 执行鼠标操作，
 * 不需要 robotjs 原生模块。
 */

const { pressedButtons, getButtonName } = require('./keycodes')

// ---- 注入的依赖 ----

let logger = null

function setMouseLogger(loggerRef) {
  logger = loggerRef
}

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  } else if (level === 'error') {
    console.error('[鼠标]', message, data || '')
  }
}

// ---- SendInput 后端（通过 input-sendinput.createClient 共享惰性初始化）
let _siUnavailableLogged = false

function _logSiUnavailable(label) {
  if (_siUnavailableLogged) return
  _siUnavailableLogged = true
  log('error', '[鼠标] SendInput 不可用，' + label + '被丢弃')
  try {
    if (!fs.existsSync('C:\\ProgramData\\YCDesk')) fs.mkdirSync('C:\\ProgramData\\YCDesk', { recursive: true })
    fs.appendFileSync('C:\\ProgramData\\YCDesk\\diag_handler.log', '[' + new Date().toISOString() + '] mouse-normalizer: SendInput不可用 - ' + label + '\n', 'utf8')
  } catch (e) {}
}

function _execMoveMouse(x, y, sw, sh) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) {
    const nx = Math.round((x / sw) * 65535)
    const ny = Math.round((y / sh) * 65535)
    si.moveMouse(Math.max(0, Math.min(65535, nx)), Math.max(0, Math.min(65535, ny)))
  } else {
    _logSiUnavailable('鼠标移动')
  }
}

function _execMouseToggle(direction, btnName) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) {
    const btnNum = btnName === 'right' ? 2 : (btnName === 'middle' ? 1 : 0)
    if (direction === 'down') si.mouseDown(btnNum)
    else si.mouseUp(btnNum)
  } else {
    _logSiUnavailable('鼠标按键')
  }
}

function _execMouseClick(btnName) {
  const si = require("./input-sendinput").createClient(logger)
  if (si) {
    const btnNum = btnName === 'right' ? 2 : (btnName === 'middle' ? 1 : 0)
    si.mouseClick(btnNum)
  } else {
    _logSiUnavailable('鼠标点击')
  }
}

function _execScrollMouse(x, y) {
  const si = require("./input-sendinput").createClient(logger)
  if (si && y !== 0) {
    si.mouseWheel(-y * 120)
  } else if (!si) {
    _logSiUnavailable('滚轮')
  }
}

// ---- 鼠标状态 ----

let currentMouseX = 0
let currentMouseY = 0
let lastMousedownTime = 0
let lastMouseupTime = 0
let wheelAccumulatorY = 0
let wheelAccumulatorX = 0

const MIN_CLICK_INTERVAL_MS = 60
const DEDUP_MOUSEUP_WINDOW_MS = 100

// ---- 归一化 ----

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

// ---- 鼠标事件处理 ----

function handleMouseMove(x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)
  }
}

function handleMouseMoveDelta(dx, dy, screenWidth, screenHeight) {
  if (dx === undefined || dy === undefined) return

  const targetX = currentMouseX + Math.round(dx)
  const targetY = currentMouseY + Math.round(dy)

  currentMouseX = Math.max(0, Math.min(screenWidth, targetX))
  currentMouseY = Math.max(0, Math.min(screenHeight, targetY))

  _execMoveMouse(currentMouseX, currentMouseY, screenWidth, screenHeight)
}

function handleMouseDown(x, y, button, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)
  }

  const mouseButton = getButtonName(button)

  if (!pressedButtons[mouseButton]) {
    pressedButtons[mouseButton] = true
    _execMouseToggle('down', mouseButton)
  }
  lastMousedownTime = Date.now()
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
        _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)
      }
      pressedButtons[mouseButton] = true
      _execMouseToggle('down', mouseButton)
      lastMousedownTime = Date.now()
    }
  }

  if (x !== undefined && y !== undefined && pressedButtons[mouseButton]) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    currentMouseX = pos.x
    currentMouseY = pos.y
    _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)
  }

  const elapsed = Date.now() - lastMousedownTime
  if (elapsed < MIN_CLICK_INTERVAL_MS) {
    await sleepAsyncMs(MIN_CLICK_INTERVAL_MS - elapsed)
  }

  pressedButtons[mouseButton] = false
  _execMouseToggle('up', mouseButton)
  lastMouseupTime = Date.now()
}

function handleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  currentMouseX = pos.x
  currentMouseY = pos.y

  _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)

  const mouseButton = getButtonName(button)
  _execMouseClick(mouseButton)
}

function handleDoubleClick(x, y, button, screenWidth, screenHeight) {
  const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
  currentMouseX = pos.x
  currentMouseY = pos.y

  _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)

  const mouseButton = getButtonName(button)
  _execMouseClick(mouseButton)
  _execMouseClick(mouseButton) // double = two clicks
}

function handleMouseWheel(deltaY, deltaX, x, y, screenWidth, screenHeight) {
  if (x !== undefined && y !== undefined) {
    const pos = normalizeAndClamp(x, y, screenWidth, screenHeight)
    _execMoveMouse(pos.x, pos.y, screenWidth, screenHeight)
  }

  if (deltaY) {
    wheelAccumulatorY += deltaY
    const scrollAmount = Math.trunc(wheelAccumulatorY / 40)
    if (scrollAmount !== 0) {
      _execScrollMouse(0, -scrollAmount)
      wheelAccumulatorY -= scrollAmount * 40
    }
  }

  if (deltaX) {
    wheelAccumulatorX += deltaX
    const scrollAmountX = Math.trunc(wheelAccumulatorX / 40)
    if (scrollAmountX !== 0) {
      _execScrollMouse(-scrollAmountX, 0)
      wheelAccumulatorX -= scrollAmountX * 40
    }
  }
}

function handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX) {
  if (accumulatedDeltaY) {
    const scrollAmount = Math.round(accumulatedDeltaY / 120)
    _execScrollMouse(0, -scrollAmount)
  }

  if (accumulatedDeltaX) {
    const scrollAmountX = Math.round(accumulatedDeltaX / 120)
    _execScrollMouse(-scrollAmountX, 0)
  }
}

// ---- 状态查询 ----

function getMousePosition() {
  return { x: currentMouseX, y: currentMouseY }
}

function resetMouseState() {
  currentMouseX = 0
  currentMouseY = 0
  wheelAccumulatorY = 0
  wheelAccumulatorX = 0
  lastMousedownTime = 0
  lastMouseupTime = 0
}

module.exports = {
  setMouseLogger,
  normalizeAndClamp,
  handleMouseMove,
  handleMouseMoveDelta,
  handleMouseDown,
  handleMouseUp,
  handleClick,
  handleDoubleClick,
  handleMouseWheel,
  handleMouseWheelBatch,
  getMousePosition,
  resetMouseState
}

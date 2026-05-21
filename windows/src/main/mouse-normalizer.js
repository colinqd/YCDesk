/**
 * 鼠标坐标归一化与事件处理
 *
 * 依赖 robotjs 原生模块执行鼠标操作。
 * 通过 setMouseRobot() 注入 robot 引用，setMouseLogger() 注入日志实例。
 */

const { pressedButtons, getButtonName } = require('./keycodes')

// ---- 注入的依赖 ----

let robot = null
let logger = null

function setMouseRobot(robotRef) {
  robot = robotRef
}

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
  while (Date.now() < end) { /* busy-wait */ }
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

function handleMouseWheelBatch(accumulatedDeltaY, accumulatedDeltaX) {
  if (accumulatedDeltaY) {
    const scrollAmount = Math.round(accumulatedDeltaY / 120)
    robot.scrollMouse(0, -scrollAmount)
  }

  if (accumulatedDeltaX) {
    const scrollAmountX = Math.round(accumulatedDeltaX / 120)
    robot.scrollMouse(-scrollAmountX, 0)
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
  setMouseRobot,
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

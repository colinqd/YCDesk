import s from './state.js'
import { getKeyFromCode, convertToInputCommand } from './input.js'
import { createInputCommand, INPUT_TYPES } from '../shared/input-protocol.js'

function cycleKeyboardPosition() {
  if (typeof window.showToast === 'function') window.showToast('键盘位置: 底部')
}

function cycleKeyboardSize() {
  const currentIndex = s.keyboardSizes.indexOf(s.currentKeyboardSize)
  const nextIndex = (currentIndex + 1) % s.keyboardSizes.length
  s.currentKeyboardSize = s.keyboardSizes[nextIndex]
  applyKeyboardSize()
  const sizeNames = {
    'small': '小',
    'medium': '中',
    'large': '大'
  }
  if (typeof window.showToast === 'function') window.showToast(`键盘大小: ${sizeNames[s.currentKeyboardSize]}`)
  saveKeyboardSettings()
}

function cycleKeyboardOpacity() {
  const currentIndex = s.keyboardOpacities.indexOf(s.currentKeyboardOpacity)
  const nextIndex = (currentIndex + 1) % s.keyboardOpacities.length
  s.currentKeyboardOpacity = s.keyboardOpacities[nextIndex]
  applyKeyboardOpacity()
  if (typeof window.showToast === 'function') window.showToast(`键盘透明度: ${s.currentKeyboardOpacity}%`)
  saveKeyboardSettings()
}

function applyKeyboardPosition() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const remoteScreen = document.getElementById('remoteScreen')
  
  if (!keyboardOverlay) return
  
  s.keyboardPositions.forEach(pos => {
    keyboardOverlay.classList.remove(`position-${pos}`)
  })
  keyboardOverlay.classList.add('position-bottom')
  
  keyboardOverlay.style.left = ''
  keyboardOverlay.style.top = ''
  keyboardOverlay.style.right = ''
  keyboardOverlay.style.bottom = ''
  keyboardOverlay.style.transform = ''
  
  setTimeout(() => {
    if (remoteScreen && keyboardOverlay) {
      const remoteRect = remoteScreen.getBoundingClientRect()
      const keyboardRect = keyboardOverlay.getBoundingClientRect()
      
      const leftPos = remoteRect.left + (remoteRect.width - keyboardRect.width) / 2
      
      keyboardOverlay.style.position = 'fixed'
      keyboardOverlay.style.left = `${leftPos}px`
      keyboardOverlay.style.bottom = `${window.innerHeight - remoteRect.bottom}px`
      keyboardOverlay.style.top = 'auto'
      keyboardOverlay.style.transform = 'none'
      
      if (typeof window.log === 'function') window.log(`键盘位置: left=${leftPos.toFixed(0)}, bottom=${(window.innerHeight - remoteRect.bottom).toFixed(0)}`)
    }
    
    ensureKeyboardInBounds()
  }, 50)
}

function ensureKeyboardInBounds() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const remoteScreen = document.getElementById('remoteScreen')
  
  if (!keyboardOverlay || !remoteScreen) return
  
  const remoteRect = remoteScreen.getBoundingClientRect()
  const keyboardRect = keyboardOverlay.getBoundingClientRect()
  
  let needsAdjustment = false
  let newLeft = keyboardRect.left
  
  if (keyboardRect.left < remoteRect.left) {
    newLeft = remoteRect.left
    needsAdjustment = true
  }
  
  if (keyboardRect.right > remoteRect.right) {
    newLeft = remoteRect.right - keyboardRect.width
    needsAdjustment = true
  }
  
  if (needsAdjustment) {
    keyboardOverlay.style.left = `${newLeft}px`
    keyboardOverlay.style.right = 'auto'
    if (typeof window.log === 'function') window.log(`键盘位置已调整以保持在远程屏幕内`)
  }
}

function applyKeyboardSize() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  if (!keyboardOverlay) return
  
  s.keyboardSizes.forEach(size => {
    keyboardOverlay.classList.remove(`size-${size}`)
  })
  keyboardOverlay.classList.add(`size-${s.currentKeyboardSize}`)
}

function applyKeyboardOpacity() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const controlOverlay = document.getElementById('controlOverlay')
  
  if (keyboardOverlay) {
    s.keyboardOpacities.forEach(opacity => {
      keyboardOverlay.classList.remove(`opacity-${opacity}`)
    })
    keyboardOverlay.classList.add(`opacity-${s.currentKeyboardOpacity}`)
  }
  
  if (controlOverlay) {
    s.keyboardOpacities.forEach(opacity => {
      controlOverlay.classList.remove(`opacity-${opacity}`)
    })
    controlOverlay.classList.add(`opacity-${s.currentKeyboardOpacity}`)
  }
}

function saveKeyboardSettings() {
  try {
    localStorage.setItem('ycdesk_keyboard_position', s.currentKeyboardPosition)
    localStorage.setItem('ycdesk_keyboard_size', s.currentKeyboardSize)
    localStorage.setItem('ycdesk_keyboard_opacity', s.currentKeyboardOpacity)
  } catch (e) {
    console.log('保存键盘设置失败:', e)
  }
}

function loadKeyboardSettings() {
  try {
    const savedPosition = localStorage.getItem('ycdesk_keyboard_position')
    const savedSize = localStorage.getItem('ycdesk_keyboard_size')
    const savedOpacity = localStorage.getItem('ycdesk_keyboard_opacity')
    
    if (savedPosition && s.keyboardPositions.includes(savedPosition)) {
      s.currentKeyboardPosition = savedPosition
    }
    if (savedSize && s.keyboardSizes.includes(savedSize)) {
      s.currentKeyboardSize = savedSize
    }
    if (savedOpacity && s.keyboardOpacities.includes(savedOpacity)) {
      s.currentKeyboardOpacity = savedOpacity
    }
  } catch (e) {
    console.log('加载键盘设置失败:', e)
  }
}

function setupKeyboardDrag() {
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const dragHandle = document.getElementById('keyboardDragHandle')
  
  if (!keyboardOverlay || !dragHandle) return
  
  dragHandle.addEventListener('touchstart', (e) => {
    s.isDraggingKeyboard = true
    const touch = e.touches[0]
    s.dragStartX = touch.clientX
    s.dragStartY = touch.clientY
    
    const rect = keyboardOverlay.getBoundingClientRect()
    s.dragStartLeft = rect.left
    s.dragStartTop = rect.top
    
    e.preventDefault()
  }, { passive: false })
  
  document.addEventListener('touchmove', (e) => {
    if (!s.isDraggingKeyboard) return
    
    const touch = e.touches[0]
    const deltaX = touch.clientX - s.dragStartX
    const deltaY = touch.clientY - s.dragStartY
    
    let newLeft = s.dragStartLeft + deltaX
    let newTop = s.dragStartTop + deltaY
    
    const remoteScreen = document.getElementById('remoteScreen')
    if (remoteScreen) {
      const remoteRect = remoteScreen.getBoundingClientRect()
      const keyboardRect = keyboardOverlay.getBoundingClientRect()
      
      newLeft = Math.max(remoteRect.left, Math.min(remoteRect.right - keyboardRect.width, newLeft))
      newTop = Math.max(remoteRect.top, Math.min(remoteRect.bottom - keyboardRect.height, newTop))
    } else {
      const maxLeft = window.innerWidth - keyboardOverlay.offsetWidth
      const maxTop = window.innerHeight - keyboardOverlay.offsetHeight
      
      newLeft = Math.max(0, Math.min(maxLeft, newLeft))
      newTop = Math.max(0, Math.min(maxTop, newTop))
    }
    
    keyboardOverlay.style.left = `${newLeft}px`
    keyboardOverlay.style.top = `${newTop}px`
    keyboardOverlay.style.bottom = 'auto'
    keyboardOverlay.style.transform = 'none'
    
    e.preventDefault()
  }, { passive: false })
  
  document.addEventListener('touchend', () => {
    s.isDraggingKeyboard = false
  })
}

function toggleKeyboard() {
  s.keyboardVisible = !s.keyboardVisible
  console.log('toggleKeyboard called, keyboardVisible=' + s.keyboardVisible)
  
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const remoteScreen = document.getElementById('remoteScreen')
  
  if (s.keyboardVisible) {
    applyKeyboardSize()
    applyKeyboardOpacity()
    
    if (s.currentKeyboardPosition !== 'center') {
      keyboardOverlay.style.left = ''
      keyboardOverlay.style.top = ''
      keyboardOverlay.style.transform = ''
    }
    
    if (keyboardOverlay) {
      keyboardOverlay.classList.add('active')
    }
    if (remoteScreen) {
      remoteScreen.classList.add('keyboard-visible')
    }
    if (typeof window.showToast === 'function') window.showToast('键盘已打开')
    console.log('HTML键盘已打开')
  } else {
    if (keyboardOverlay) {
      keyboardOverlay.classList.remove('active')
    }
    if (remoteScreen) {
      remoteScreen.classList.remove('keyboard-visible')
    }
    if (typeof window.showToast === 'function') window.showToast('键盘已关闭')
    console.log('HTML键盘已关闭')
  }
}

function sendKey(keyCode) {
  if (!s.dataChannel || s.dataChannel.readyState !== 'open') {
    console.error('数据通道未打开，无法发送按键')
    if (typeof window.showToast === 'function') window.showToast('数据通道未打开')
    return
  }
  
  const event = {
    type: 'keydown',
    code: keyCode,
    key: getKeyFromCode(keyCode),
    ctrlKey: s.activeModifiers.Control,
    shiftKey: s.activeModifiers.Shift,
    altKey: s.activeModifiers.Alt,
    metaKey: s.activeModifiers.Meta
  }
  
  console.log('发送键盘事件:', JSON.stringify(event))
  const inputCommand = convertToInputCommand(event)
  const message = JSON.stringify(inputCommand)

  // 优先使用 control 通道（可靠，已知可用）
  const dataReady = s.dataChannel && s.dataChannel.readyState === 'open';
  const inputReady = s.inputChannel && s.inputChannel.readyState === 'open';

  if (dataReady) {
    s.dataChannel.send(message);
  } else if (inputReady) {
    if (s.inputChannel.bufferedAmount < 65536) {
      s.inputChannel.send(message);
    }
  }

  setTimeout(() => {
    const upCommand = convertToInputCommand({
      type: 'keyup',
      code: keyCode,
      key: getKeyFromCode(keyCode),
      ctrlKey: s.activeModifiers.Control,
      shiftKey: s.activeModifiers.Shift,
      altKey: s.activeModifiers.Alt,
      metaKey: s.activeModifiers.Meta
    })
    const upMessage = JSON.stringify(upCommand)

    const dataReady2 = s.dataChannel && s.dataChannel.readyState === 'open';
    const inputReady2 = s.inputChannel && s.inputChannel.readyState === 'open';

    if (dataReady2) {
      s.dataChannel.send(upMessage);
    } else if (inputReady2) {
      if (s.inputChannel.bufferedAmount < 65536) {
        s.inputChannel.send(upMessage);
      }
    }
  }, 50)
  
  if (s.activeModifiers.Shift) {
    toggleModifier('Shift')
  }
}

function toggleModifier(modifier) {
  s.activeModifiers[modifier] = !s.activeModifiers[modifier]
  
  const keyIds = {
    'Control': ['keyControl', 'keyControl2'],
    'Shift': ['keyShift', 'keyShift2'],
    'Alt': ['keyAlt', 'keyAlt2'],
    'Meta': ['keyMeta'],
    'CapsLock': ['keyCapsLock']
  }
  
  const ids = keyIds[modifier] || []
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      if (s.activeModifiers[modifier]) {
        el.classList.add('active')
      } else {
        el.classList.remove('active')
      }
    }
  })
}

let lastSystemTextValue = ''
let isComposing = false  // 跟踪IME组合输入状态

function syncSystemKeyboardButtons() {
  const controlBtn = document.getElementById('controlSysKbBtn')
  const kbBtn = document.getElementById('systemKbBtn')
  if (controlBtn) {
    if (s.usingSystemKeyboard) controlBtn.classList.add('active')
    else controlBtn.classList.remove('active')
  }
  if (kbBtn) {
    if (s.usingSystemKeyboard) kbBtn.classList.add('active')
    else kbBtn.classList.remove('active')
  }
}

function toggleSystemKeyboard() {
  const bar = document.getElementById('systemKbBar')
  const input = document.getElementById('hiddenTextInput')
  const keyboardOverlay = document.getElementById('keyboardOverlay')

  if (!input || !bar) return

  s.usingSystemKeyboard = !s.usingSystemKeyboard

  if (s.usingSystemKeyboard) {
    keyboardOverlay.classList.remove('active')
    bar.classList.add('active')
    input.value = ''
    lastSystemTextValue = ''
    isComposing = false
    setTimeout(() => input.focus(), 200)
    if (typeof window.showToast === 'function') window.showToast('文字实时发送，按回车键确认')
  } else {
    bar.classList.remove('active')
    input.value = ''
    lastSystemTextValue = ''
    isComposing = false
    input.blur()
    if (s.keyboardVisible) {
      keyboardOverlay.classList.add('active')
    }
    if (typeof window.showToast === 'function') window.showToast('已切换回虚拟键盘')
  }

  syncSystemKeyboardButtons()
}

function setupSystemKeyboardListener() {
  const input = document.getElementById('hiddenTextInput')
  if (!input) return

  // ---- IME 事件 ----
  input.addEventListener('compositionstart', () => {
    isComposing = true
  })

  input.addEventListener('compositionupdate', () => {
    // 组合输入过程中不处理
  })

  input.addEventListener('compositionend', () => {
    isComposing = false
    lastSystemTextValue = input.value
    // 不再自动发送！文字保留在输入框，等待用户主动发送
  })

  // ---- input 事件：非 IME 时实时发送增量文本 ----
  input.addEventListener('input', () => {
    if (!s.usingSystemKeyboard) return
    if (isComposing) return
    const currentValue = input.value
    if (currentValue === lastSystemTextValue) return

    // 检测增量（新增字符），实时发送新字符
    if (currentValue.length > lastSystemTextValue.length) {
      const newText = currentValue.substring(lastSystemTextValue.length)
      sendTextInput(newText)
    }
    // 如果变短了（Backspace 已在 keydown 中处理过），只更新追踪值
    lastSystemTextValue = currentValue
  })

  // ---- keydown 拦截：转发功能键到远程 ----
  input.addEventListener('keydown', (e) => {
    if (!s.usingSystemKeyboard) return
    if (isComposing) return  // IME 组合中不拦截

    const specialKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert'
    ]

    if (specialKeys.includes(e.key)) {
      e.preventDefault()
      if (e.key === 'Enter' && e.shiftKey) {
        sendKeyWithMod('Enter', { shiftKey: true })
      } else {
        sendKey(e.code)
      }

      // Backspace 特殊处理：同步删除 input 中的最后一个字符
      if (e.key === 'Backspace' && input.value.length > 0) {
        input.value = input.value.slice(0, -1)
        lastSystemTextValue = input.value
      }
    }
  })
}

function toggleSpecialKeys() {
  const row = document.getElementById('kbSpecialKeysRow')
  const btn = document.getElementById('kbToggleSpecialKeys')
  if (!row || !btn) return
  row.classList.toggle('visible')
  btn.classList.toggle('expanded')
}

function setupSystemKbBarDrag() {
  const bar = document.getElementById('systemKbBar')
  const dragHandle = document.getElementById('kbDragHandle')
  if (!bar || !dragHandle) return

  let isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0

  dragHandle.addEventListener('touchstart', (e) => {
    isDragging = true
    const touch = e.touches[0]
    startX = touch.clientX; startY = touch.clientY
    const rect = bar.getBoundingClientRect()
    startLeft = rect.left; startTop = rect.top
    bar.style.left = rect.left + 'px'
    bar.style.top = rect.top + 'px'
    bar.style.bottom = 'auto'
    bar.style.transform = 'none'
    e.preventDefault()
  }, { passive: false })

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    const touch = e.touches[0]
    const newLeft = startLeft + (touch.clientX - startX)
    const newTop = startTop + (touch.clientY - startY)
    bar.style.left = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, newLeft)) + 'px'
    bar.style.top = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, newTop)) + 'px'
    e.preventDefault()
  }, { passive: false })

  document.addEventListener('touchend', () => { isDragging = false })
}

function sendEnterKey() {
  const dataReady = s.dataChannel && s.dataChannel.readyState === 'open'
  const inputReady = s.inputChannel && s.inputChannel.readyState === 'open'

  if (!dataReady && !inputReady) return

  const downCommand = convertToInputCommand({
    type: 'keydown',
    code: 'Enter',
    key: 'Enter',
    ctrlKey: s.activeModifiers.Control,
    shiftKey: s.activeModifiers.Shift,
    altKey: s.activeModifiers.Alt,
    metaKey: s.activeModifiers.Meta
  })
  const downMessage = JSON.stringify(downCommand)

  if (dataReady) {
    s.dataChannel.send(downMessage)
  } else if (inputReady) {
    if (s.inputChannel.bufferedAmount < 65536) {
      s.inputChannel.send(downMessage)
    }
  }

  setTimeout(() => {
    const upCommand = convertToInputCommand({
      type: 'keyup',
      code: 'Enter',
      key: 'Enter',
      ctrlKey: s.activeModifiers.Control,
      shiftKey: s.activeModifiers.Shift,
      altKey: s.activeModifiers.Alt,
      metaKey: s.activeModifiers.Meta
    })
    const upMessage = JSON.stringify(upCommand)

    const dataReady2 = s.dataChannel && s.dataChannel.readyState === 'open'
    const inputReady2 = s.inputChannel && s.inputChannel.readyState === 'open'

    if (dataReady2) {
      s.dataChannel.send(upMessage)
    } else if (inputReady2) {
      if (s.inputChannel.bufferedAmount < 65536) {
        s.inputChannel.send(upMessage)
      }
    }
  }, 50)
}

function sendTextInput(text) {
  if (!text) return

  const dataReady = s.dataChannel && s.dataChannel.readyState === 'open'
  const inputReady = s.inputChannel && s.inputChannel.readyState === 'open'

  if (!dataReady && !inputReady) return

  try {
    console.log('[DIAG] sendTextInput: text="' + text + '" len=' + text.length)
    const inputCommand = createInputCommand(
      INPUT_TYPES.TEXT_INPUT,
      { text: text }
    )
    const message = JSON.stringify(inputCommand)
    console.log('[DIAG] sendTextInput: command=', message.substring(0, 100))

    if (dataReady) {
      s.dataChannel.send(message)
      console.log('[DIAG] sendTextInput: 已通过 dataChannel 发送')
    } else if (inputReady) {
      if (s.inputChannel.bufferedAmount < 65536) {
        s.inputChannel.send(message)
        console.log('[DIAG] sendTextInput: 已通过 inputChannel 发送')
      }
    }
  } catch (e) {
    console.error('[DIAG] sendTextInput error:', e.message, e.stack)
  }
}

function sendKeyWithMod(keyCode, modifiers = {}) {
  if (!s.dataChannel || s.dataChannel.readyState !== 'open') {
    console.error('数据通道未打开，无法发送按键')
    return
  }

  const event = {
    type: 'keydown',
    code: keyCode,
    key: getKeyFromCode(keyCode),
    ctrlKey: modifiers.ctrlKey || false,
    shiftKey: modifiers.shiftKey || false,
    altKey: modifiers.altKey || false,
    metaKey: modifiers.metaKey || false
  }
  const inputCommand = convertToInputCommand(event)
  s.dataChannel.send(JSON.stringify(inputCommand))

  setTimeout(() => {
    const upEvent = { ...event, type: 'keyup' }
    const dataReady2 = s.dataChannel && s.dataChannel.readyState === 'open'
    if (dataReady2) {
      s.dataChannel.send(JSON.stringify(convertToInputCommand(upEvent)))
    }
  }, 50)
}

window.sendKey = sendKey
window.sendKeyWithMod = sendKeyWithMod
window.sendSystemNewline = function() {
  sendKeyWithMod('Enter', { shiftKey: true })
}

export {
  cycleKeyboardPosition,
  cycleKeyboardSize,
  cycleKeyboardOpacity,
  applyKeyboardPosition,
  ensureKeyboardInBounds,
  applyKeyboardSize,
  applyKeyboardOpacity,
  saveKeyboardSettings,
  loadKeyboardSettings,
  setupKeyboardDrag,
  toggleKeyboard,
  sendKey,
  sendKeyWithMod,
  toggleModifier,
  toggleSystemKeyboard,
  setupSystemKeyboardListener,
  toggleSpecialKeys,
  setupSystemKbBarDrag
}

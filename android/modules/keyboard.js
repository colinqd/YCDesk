import s from './state.js'
import { getKeyFromCode, convertToInputCommand } from './input.js'

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
  
  if (s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open') {
    if (s.inputChannel.bufferedAmount < 65536) {
      s.inputChannel.send(message)
    } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
      s.dataChannel.send(message)
    }
  } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
    s.dataChannel.send(message)
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
    
    if (s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open') {
      if (s.inputChannel.bufferedAmount < 65536) {
        s.inputChannel.send(upMessage)
      } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
        s.dataChannel.send(upMessage)
      }
    } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
      s.dataChannel.send(upMessage)
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

function toggleSystemKeyboard() {
  const input = document.getElementById('hiddenTextInput')
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  const btn = document.getElementById('systemKbBtn')
  
  if (!input) return
  
  s.usingSystemKeyboard = !s.usingSystemKeyboard
  
  if (s.usingSystemKeyboard) {
    keyboardOverlay.style.display = 'none'
    keyboardOverlay.classList.remove('active')
    input.classList.add('active')
    input.value = ''
    lastSystemTextValue = ''
    input.focus()
    if (btn) btn.classList.add('active')
    if (typeof window.showToast === 'function') window.showToast('已切换到系统输入法，支持中文输入')
  } else {
    input.classList.remove('active')
    input.value = ''
    lastSystemTextValue = ''
    input.blur()
    keyboardOverlay.style.display = ''
    if (s.keyboardVisible) {
      keyboardOverlay.classList.add('active')
    }
    if (btn) btn.classList.remove('active')
    if (typeof window.showToast === 'function') window.showToast('已切换回虚拟键盘')
  }
}

function setupSystemKeyboardListener() {
  const input = document.getElementById('hiddenTextInput')
  if (!input) return
  
  input.addEventListener('input', () => {
    if (!s.usingSystemKeyboard) return
    
    const currentValue = input.value
    if (currentValue === lastSystemTextValue) return
    
    if (currentValue.length > lastSystemTextValue.length) {
      const newText = currentValue.substring(lastSystemTextValue.length)
      sendTextInput(newText)
    }
    
    lastSystemTextValue = currentValue
  })
  
  input.addEventListener('blur', () => {
    if (s.usingSystemKeyboard) {
      toggleSystemKeyboard()
    }
  })
}

function sendTextInput(text) {
  if (!text) return
  
  const inputReady = s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open'
  const dataReady = s.dataChannel && s.dataChannel.readyState === 'open'
  
  if (!inputReady && !dataReady) return
  
  try {
    const inputCommand = window.createInputCommand(
      window.INPUT_TYPES.TEXT_INPUT,
      { text: text }
    )
    const message = JSON.stringify(inputCommand)
    
    if (inputReady) {
      if (s.inputChannel.bufferedAmount < 65536) {
        s.inputChannel.send(message)
      } else {
        s.dataChannel.send(message)
      }
    } else if (dataReady) {
      s.dataChannel.send(message)
    }
  } catch (e) {
    console.error('sendTextInput error:', e)
  }
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
  toggleModifier,
  toggleSystemKeyboard,
  setupSystemKeyboardListener
}

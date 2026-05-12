import s from './state.js'
import { InputDispatcher, createGestureHandler, convertToInputCommand } from './input.js'
import MatrixTransformer from '../shared/components/matrix-transformer.js'
import { registerPlugin } from '@capacitor/core'

const FloatingMouse = registerPlugin('FloatingMouse')

function updateVideoTransformGlobal() {
  const remoteVideo = document.getElementById('remoteVideo')
  if (remoteVideo) {
    remoteVideo.style.transform = `translate(${s.panX}px, ${s.panY}px) scale(${s.currentScale})`
  }
}

function resetZoomAndPan() {
  if (s.matrixTransformer) {
      s.matrixTransformer.reset();
      const videoContainer = document.getElementById('videoContainer');
      if (videoContainer) {
          s.matrixTransformer.applyTransform(videoContainer);
      }
      if (typeof window.showToast === 'function') window.showToast('已重置缩放和位置');
  } else {
      s.currentScale = 1;
      s.panX = 0;
      s.panY = 0;
      updateVideoTransformGlobal();
      if (typeof window.showToast === 'function') window.showToast('已重置缩放和位置');
  }
}

function toggleMouseMode() {
    s.isPointerMode = !s.isPointerMode
    
    const mouseModeBtn = document.getElementById('mouseModeBtn')
    
    if (s.isPointerMode) {
        showFloatingMouse().catch(e => { if (typeof window.log === 'function') window.log('显示悬浮鼠标失败: ' + e.message) })
        if (typeof window.showToast === 'function') window.showToast('指针模式已开启')
        if (mouseModeBtn) {
            mouseModeBtn.style.background = '#667eea'
            mouseModeBtn.style.color = 'white'
        }
    } else {
        hideFloatingMouse().catch(e => { if (typeof window.log === 'function') window.log('隐藏悬浮鼠标失败: ' + e.message) })
        if (typeof window.showToast === 'function') window.showToast('指针模式已关闭')
        if (mouseModeBtn) {
            mouseModeBtn.style.background = ''
            mouseModeBtn.style.color = ''
        }
    }
}

function toggleControlsHide() {
  s.controlsHidden = !s.controlsHidden
  const controlOverlay = document.getElementById('controlOverlay')
  const controlToggle = document.getElementById('controlToggle')
  
  if (controlOverlay && controlToggle) {
    if (s.controlsHidden) {
      controlOverlay.classList.add('hidden')
      controlToggle.classList.add('visible')
      if (typeof window.showToast === 'function') window.showToast('控制栏已隐藏')
    } else {
      controlOverlay.classList.remove('hidden')
      controlToggle.classList.remove('visible')
      if (typeof window.showToast === 'function') window.showToast('控制栏已显示')
    }
  }
}

function showControls() {
  s.controlsHidden = false
  const controlOverlay = document.getElementById('controlOverlay')
  const controlToggle = document.getElementById('controlToggle')
  
  if (controlOverlay && controlToggle) {
    controlOverlay.classList.remove('hidden')
    controlToggle.classList.remove('visible')
  }
}

function handleOrientationChange() {
  const remoteScreen = document.getElementById('remoteScreen')
  const isLandscape = window.innerWidth > window.innerHeight
  
  if (remoteScreen && remoteScreen.classList.contains('active')) {
    if (isLandscape) {
      remoteScreen.classList.add('landscape-mode')
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    } else {
      remoteScreen.classList.remove('landscape-mode')
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
    
    if (s.dataChannel && s.dataChannel.readyState === 'open') {
      const rotation = isLandscape ? 90 : 0
      const message = JSON.stringify(convertToInputCommand({
        type: 'screen-rotation',
        rotation: rotation
      }))
      if (s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open') {
        s.inputChannel.send(message)
      } else if (s.dataChannel && s.dataChannel.readyState === 'open') {
        s.dataChannel.send(message)
      }
    }
    
    setTimeout(() => {
      const remoteScreen = document.getElementById('remoteScreen')
      const videoContainer = document.getElementById('videoContainer')
      const videoWrapper = document.getElementById('videoWrapper')
      
      if (remoteScreen && videoContainer && videoWrapper) {
        const screenRect = remoteScreen.getBoundingClientRect()
        
        if (s.matrixTransformer) {
          s.matrixTransformer.setScreenSize(screenRect.width, screenRect.height)
          s.matrixTransformer.reset()
          s.matrixTransformer.applyContainerSize(videoContainer, videoWrapper)
          s.matrixTransformer.applyTransform(videoContainer)
        }
        
        if (s.inputDispatcher) {
          s.inputDispatcher.updateRemoteScreenRect()
        }
        
        if (typeof window.log === 'function') window.log('横竖屏切换: 屏幕尺寸更新为 ' + screenRect.width + 'x' + screenRect.height)
      }
    }, 300)
  }
}

async function showFloatingMouse() {
  try {
    const permResult = await FloatingMouse.hasPermission()
    if (typeof window.log === 'function') window.log('悬浮窗权限状态: ' + (permResult.granted ? '已授权' : '未授权'))
    
    if (!permResult.granted) {
      if (typeof window.log === 'function') window.log('正在请求悬浮窗权限...')
      const requestResult = await FloatingMouse.requestPermission()
      if (!requestResult.granted) {
        if (typeof window.showToast === 'function') window.showToast('请在设置中开启悬浮窗权限')
        return
      }
    }
    
    const result = await FloatingMouse.show()
    if (result.success) {
      if (typeof window.log === 'function') window.log('悬浮鼠标已显示')
    }
  } catch (e) {
    if (typeof window.log === 'function') window.log('显示悬浮鼠标失败: ' + e.message)
  }
}

async function hideFloatingMouse() {
  try {
    await FloatingMouse.hide()
    if (typeof window.log === 'function') window.log('悬浮鼠标已隐藏')
  } catch (e) {
    if (typeof window.log === 'function') window.log('隐藏悬浮鼠标失败: ' + e.message)
  }
}

function handleFloatingMouseEvent(event) {
  if (!s.dataChannel || s.dataChannel.readyState !== 'open') return
  
  if (event.type === 'mousemove' || event.type === 'mousedown' || event.type === 'mouseup' || 
      event.type === 'wheel' || event.type === 'dblclick' || event.type === 'dragstart' || event.type === 'dragend') {
      
      let inputCmd = null
      
      if (event.type === 'wheel') {
        inputCmd = convertToInputCommand({ type: 'wheel', deltaY: event.delta })
      } else {
        const videoContainer = document.getElementById('videoContainer')
        if (!videoContainer) return
        
        const rect = videoContainer.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        
        const localX = event.x - rect.left
        const localY = event.y - rect.top
        
        const x = localX / rect.width
        const y = localY / rect.height
        
        if (x < 0 || x > 1 || y < 0 || y > 1) return
        
        switch (event.type) {
          case 'mousemove':
            inputCmd = convertToInputCommand({ type: 'mousemove', x, y })
            break
          case 'mousedown':
            inputCmd = convertToInputCommand({ type: 'mousedown', x, y, button: event.button })
            break
          case 'mouseup':
            inputCmd = convertToInputCommand({ type: 'mouseup', x, y, button: event.button })
            break
          case 'dblclick':
            inputCmd = convertToInputCommand({ type: 'dblclick', x, y, button: event.button })
            break
          case 'dragstart':
            inputCmd = convertToInputCommand({ type: 'mousedown', x, y, button: event.button })
            break
          case 'dragend':
            inputCmd = convertToInputCommand({ type: 'mouseup', x, y, button: event.button })
            break
          default:
            return
        }
      }
      
      if (inputCmd) {
        const message = JSON.stringify(inputCmd)
        if (s.inputChannel && s.inputChannelReady && s.inputChannel.readyState === 'open') {
          if (s.inputChannel.bufferedAmount < 65536) {
            s.inputChannel.send(message)
          } else if (s.dataChannel.readyState === 'open') {
            s.dataChannel.send(message)
          }
        } else if (s.dataChannel.readyState === 'open') {
          s.dataChannel.send(message)
        }
      }
  }
}

function toggleFullscreen() {
  const remoteScreen = document.getElementById('remoteScreen')
  const remoteVideo = document.getElementById('remoteVideo')
  
  if (!s.isFullscreen) {
    if (remoteScreen) {
      remoteScreen.requestFullscreen().then(() => {
        s.isFullscreen = true
        if (typeof window.log === 'function') window.log('已进入全屏模式')
      }).catch(e => {
        if (typeof window.log === 'function') window.log('进入全屏失败: ' + e.message)
      })
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => {
        s.isFullscreen = false
        if (typeof window.log === 'function') window.log('已退出全屏模式')
      }).catch(e => {
        if (typeof window.log === 'function') window.log('退出全屏失败: ' + e.message)
      })
    }
  }
}

function handleRemoteLockStateChanged(data) {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('[Android UI] 处理远程锁屏状态变更: isLocked=' + data.isLocked)
  
  let lockOverlay = document.getElementById('lockOverlay')
  const videoContainer = document.getElementById('videoContainer')
  const remoteVideo = document.getElementById('remoteVideo')
  const lockCanvas = document.getElementById('lockScreenCanvas')
  
  if (data.isLocked) {
    log('[Android UI] 显示锁屏提示条和锁屏画面')
    
    if (!lockOverlay) {
      lockOverlay = document.createElement('div')
      lockOverlay.id = 'lockOverlay'
      lockOverlay.innerHTML = `
        <div class="lock-banner">
          <span class="lock-icon">🔒</span>
          <span class="lock-text">被控端已锁定 - 点击下方解锁按钮</span>
        </div>
      `
      document.body.appendChild(lockOverlay)
    }
    
    lockOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(231, 76, 60, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    `
    
    const lockBanner = lockOverlay.querySelector('.lock-banner')
    if (lockBanner) {
      lockBanner.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        color: white;
        font-size: 16px;
        font-weight: 500;
      `
    }
    
    const lockIcon = lockOverlay.querySelector('.lock-icon')
    if (lockIcon) {
      lockIcon.style.cssText = `
        font-size: 22px;
      `
    }
    
    const lockText = lockOverlay.querySelector('.lock-text')
    if (lockText) {
      lockText.style.cssText = `
        text-align: center;
      `
    }
    
    if (videoContainer) {
      videoContainer.style.filter = 'grayscale(0.4) brightness(0.85)'
      videoContainer.style.marginTop = '56px'
    }
    
    if (remoteVideo) remoteVideo.style.display = 'none'
    if (lockCanvas) lockCanvas.style.display = 'block'
    
    if (typeof window.showToast === 'function') window.showToast('被控端已锁定')
    
  } else {
    log('[Android UI] 隐藏锁屏提示条和锁屏画面')
    
    if (lockOverlay) {
      lockOverlay.style.display = 'none'
    }
    
    if (videoContainer) {
      videoContainer.style.filter = ''
      videoContainer.style.marginTop = '0'
    }
    
    if (remoteVideo) remoteVideo.style.display = 'block'
    if (lockCanvas) lockCanvas.style.display = 'none'
    
    if (typeof window.showToast === 'function') window.showToast('被控端已解锁')
    
    log('[Android UI] 解锁后发送视频刷新请求')
    if (typeof s !== 'undefined' && s.dataChannel && s.dataChannel.readyState === 'open') {
      setTimeout(function() {
        try {
          s.dataChannel.send(JSON.stringify({
            type: 'video-refresh-request',
            timestamp: Date.now()
          }))
          log('[Android UI] 视频刷新请求已发送')
        } catch (e) {
          log('[Android UI] 发送视频刷新请求失败: ' + e.message)
        }
      }, 500)
      
      setTimeout(function() {
        try {
          if (s.dataChannel && s.dataChannel.readyState === 'open') {
            s.dataChannel.send(JSON.stringify({
              type: 'video-refresh-request',
              timestamp: Date.now()
            }))
            log('[Android UI] 视频刷新请求已发送（备用）')
          }
        } catch (e) {}
      }, 2000)
    } else {
      log('[Android UI] 数据通道未就绪，无法发送视频刷新请求')
    }
  }
}

function handleLockScreenFrame(data) {
  const canvas = document.getElementById('lockScreenCanvas')
  if (!canvas) return
  if (!data.jpeg) return
  var img = new Image()
  img.onload = function() {
    canvas.width = img.width
    canvas.height = img.height
    var ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
  }
  img.src = 'data:image/jpeg;base64,' + data.jpeg
}

window.handleRemoteLockStateChanged = handleRemoteLockStateChanged
window.handleLockScreenFrame = handleLockScreenFrame

function setupRemoteScreenInteraction() {
    const log = typeof window.log === 'function' ? window.log : console.log
    log('初始化远程屏幕交互...')
    
    const remoteScreen = document.getElementById('remoteScreen');
    const videoContainer = document.getElementById('videoContainer');
    const videoWrapper = document.getElementById('videoWrapper');
    
    if (!remoteScreen || !videoContainer) {
        log('错误：找不到 remoteScreen 或 videoContainer 元素');
        return;
    }
    
    if (!s.matrixTransformer) {
        s.matrixTransformer = new MatrixTransformer();
    }
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const screenRect = remoteScreen.getBoundingClientRect();
            log('屏幕尺寸: ' + screenRect.width + 'x' + screenRect.height);
            
            s.matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
    
            videoContainer.style.width = screenRect.width + 'px';
            videoContainer.style.height = screenRect.height + 'px';
            videoContainer.style.left = '0px';
            videoContainer.style.top = '0px';
            
            if (videoWrapper) {
                videoWrapper.style.width = '100%';
                videoWrapper.style.height = '100%';
                videoWrapper.style.left = '0px';
                videoWrapper.style.top = '0px';
            }
            
            log('初始化 videoContainer 填满屏幕: ' + screenRect.width + 'x' + screenRect.height);
            
            s.inputDispatcher = new InputDispatcher(s.matrixTransformer);
            
            s.gestureHandler = createGestureHandler(
                s.matrixTransformer,
                s.inputDispatcher
            );
            
            const isTouchOnUI = (x, y) => {
                const controlOverlay = document.getElementById('controlOverlay');
                const controlToggle = document.getElementById('controlToggle');
                const statsOverlay = document.getElementById('statsOverlay');
                const keyboardOverlay = document.getElementById('keyboardOverlay');
                const lockOverlay = document.getElementById('lockOverlay');
                
                const uiElements = [controlOverlay, controlToggle, statsOverlay, keyboardOverlay, lockOverlay];
                
                for (const element of uiElements) {
                    if (element && element.style.display !== 'none') {
                        const rect = element.getBoundingClientRect();
                        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                            log('触摸在 UI 元素上: ' + element.id);
                            return true;
                        }
                    }
                }
                
                return false;
            };
            
            window.isTouchOnUI = isTouchOnUI;
            
            let isMiddleButtonDown = false;
            
            remoteScreen.addEventListener('mousedown', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                e.preventDefault();
                
                if (e.button === 1) {
                    isMiddleButtonDown = true;
                } else {
                    s.inputDispatcher.dispatchTouchInput(e.clientX, e.clientY, 'mousedown', e.button);
                }
            });
            
            remoteScreen.addEventListener('mouseup', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                e.preventDefault();
                
                if (e.button === 1) {
                    isMiddleButtonDown = false;
                } else {
                    s.inputDispatcher.dispatchTouchInput(e.clientX, e.clientY, 'mouseup', e.button);
                }
            });
            
            remoteScreen.addEventListener('mousemove', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                e.preventDefault();
                s.inputDispatcher.dispatchTouchInput(e.clientX, e.clientY, 'mousemove', 0);
            });
            
            remoteScreen.addEventListener('touchstart', (e) => {
                if (isTouchOnUI(e.touches[0]?.clientX, e.touches[0]?.clientY)) {
                    return;
                }
                s.gestureHandler.handleTouchStart(e);
            }, { passive: false });
            
            remoteScreen.addEventListener('touchmove', (e) => {
                if (isTouchOnUI(e.touches[0]?.clientX, e.touches[0]?.clientY)) {
                    return;
                }
                s.gestureHandler.handleTouchMove(e);
            }, { passive: false });
            
            remoteScreen.addEventListener('touchend', (e) => {
                s.gestureHandler.handleTouchEnd(e);
            }, { passive: false });
            
            remoteScreen.addEventListener('touchcancel', (e) => {
                s.gestureHandler.handleTouchEnd(e);
            }, { passive: false });
            
            remoteScreen.addEventListener('wheel', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                
                e.preventDefault();
                
                const deltaX = e.deltaX || 0;
                const deltaY = e.deltaY || 0;
                
                if (e.ctrlKey || isMiddleButtonDown) {
                    const scaleDelta = deltaY > 0 ? 0.9 : 1.1;
                    const newScale = s.matrixTransformer.scale * scaleDelta;
                    s.matrixTransformer.updateScale(newScale, e.clientX, e.clientY);
                    const videoContainer = document.getElementById('videoContainer');
                    if (videoContainer) {
                        s.matrixTransformer.applyTransform(videoContainer);
                    }
                    log('缩放: scale=' + newScale.toFixed(2) + ', center=(' + e.clientX + ', ' + e.clientY + ')');
                } else {
                    s.inputDispatcher.dispatchTouchInput(
                        e.clientX,
                        e.clientY,
                        'wheel',
                        0,
                        deltaY
                    );
                }
            }, { passive: false });
            
            remoteScreen.addEventListener('contextmenu', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                e.preventDefault();
                return false;
            });
            
            remoteScreen.addEventListener('selectstart', (e) => {
                if (isTouchOnUI(e.clientX, e.clientY)) {
                    return;
                }
                e.preventDefault();
                return false;
            });
        });
    });
}

export {
  updateVideoTransformGlobal,
  resetZoomAndPan,
  toggleMouseMode,
  toggleControlsHide,
  showControls,
  handleOrientationChange,
  showFloatingMouse,
  hideFloatingMouse,
  handleFloatingMouseEvent,
  toggleFullscreen,
  handleRemoteLockStateChanged,
  handleLockScreenFrame,
  setupRemoteScreenInteraction
}

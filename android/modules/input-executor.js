import s from './state.js'
import { registerPlugin } from '@capacitor/core'

const InputExecutor = registerPlugin('InputExecutor')

async function handleReceivedInput(inputData) {
  if (!s.isAndroidControlled) {
    if (typeof window.log === 'function') window.log('Android端不是被控模式，忽略输入')
    return
  }
  
  if (typeof window.log === 'function') window.log('处理接收到的输入: ' + inputData.inputType)
  
  try {
    switch (inputData.inputType) {
      case 'mousemove':
        await InputExecutor.executeMouseMove({
          x: inputData.x,
          y: inputData.y,
          screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'mousedown':
        await InputExecutor.executeMouseDown({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button,
          screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'mouseup':
        await InputExecutor.executeMouseUp({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button,
          screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'click':
        await InputExecutor.executeMouseDown({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button || 0,
          screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
        });
        await InputExecutor.executeMouseUp({
          x: inputData.x,
          y: inputData.y,
          button: inputData.button || 0,
          screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
          screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
        });
        break;
      case 'dblclick':
        for (let i = 0; i < 2; i++) {
          await InputExecutor.executeMouseDown({
            x: inputData.x,
            y: inputData.y,
            button: inputData.button || 0,
            screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
            screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
          });
          await InputExecutor.executeMouseUp({
            x: inputData.x,
            y: inputData.y,
            button: inputData.button || 0,
            screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
            screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
          });
        }
        break;
      case 'wheel':
        await InputExecutor.executeMouseWheel({
          deltaY: inputData.deltaY || 0
        });
        break;
      case 'keydown':
        await InputExecutor.executeKeyDown({
          key: inputData.key
        });
        break;
      case 'keyup':
        await InputExecutor.executeKeyUp({
          key: inputData.key
        });
        break;
      case 'lock_screen':
        await InputExecutor.executeLockScreen()
        if (typeof window.log === 'function') window.log('锁屏命令已执行')
        break
      case 'unlock_screen':
        await InputExecutor.executeUnlockScreen({ password: inputData.password || '' })
        if (typeof window.log === 'function') window.log('解锁命令已执行')
        break
      default:
        if (typeof window.log === 'function') window.log('未知输入类型: ' + inputData.inputType);
    }
  } catch (e) {
    if (typeof window.log === 'function') window.log('执行输入失败: ' + e.message)
  }
}

function simulateMouseMove(x, y) {
  if (typeof window.log === 'function') window.log('模拟鼠标移动: ' + x + ', ' + y)
  InputExecutor.executeMouseMove({
    x: x,
    y: y,
    screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => { if (typeof window.log === 'function') window.log('执行鼠标移动失败: ' + e.message) })
}

function simulateMouseDown(x, y, button) {
  if (typeof window.log === 'function') window.log('模拟鼠标按下: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeMouseDown({
    x: x,
    y: y,
    button: button,
    screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => { if (typeof window.log === 'function') window.log('执行鼠标按下失败: ' + e.message) })
}

function simulateMouseUp(x, y, button) {
  if (typeof window.log === 'function') window.log('模拟鼠标释放: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeMouseUp({
    x: x,
    y: y,
    button: button,
    screenWidth: s.matrixTransformer?.remoteScreenWidth || 1920,
    screenHeight: s.matrixTransformer?.remoteScreenHeight || 1080
  }).catch(e => { if (typeof window.log === 'function') window.log('执行鼠标释放失败: ' + e.message) })
}

function simulateWheel(deltaY, deltaX) {
  if (typeof window.log === 'function') window.log('模拟滚轮: deltaY=' + deltaY + ', deltaX=' + deltaX)
  InputExecutor.executeMouseWheel({
    deltaY: deltaY
  }).catch(e => { if (typeof window.log === 'function') window.log('执行滚轮失败: ' + e.message) })
}

function simulateKeyDown(code, key, modifiers) {
  if (typeof window.log === 'function') window.log('模拟键盘按下: ' + code + ', key: ' + key + 
      ', ctrl: ' + (modifiers.ctrlKey || false) +
      ', shift: ' + (modifiers.shiftKey || false) +
      ', alt: ' + (modifiers.altKey || false))
  InputExecutor.executeKeyDown({
    key: key
  }).catch(e => { if (typeof window.log === 'function') window.log('执行键盘按下失败: ' + e.message) })
}

function simulateKeyUp(code, key, modifiers) {
  if (typeof window.log === 'function') window.log('模拟键盘释放: ' + code + ', key: ' + key)
  InputExecutor.executeKeyUp({
    key: key
  }).catch(e => { if (typeof window.log === 'function') window.log('执行键盘释放失败: ' + e.message) })
}

export {
  handleReceivedInput,
  simulateMouseMove,
  simulateMouseDown,
  simulateMouseUp,
  simulateWheel,
  simulateKeyDown,
  simulateKeyUp
}

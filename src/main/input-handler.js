const { screen, Input } = require('electron')

let lastMouseX = 0
let lastMouseY = 0

function handleRemoteInput(event, inputData) {
  try {
    const { inputType, x, y, button, deltaY, key, code, keyCode } = inputData
    const primaryDisplay = screen.getPrimaryDisplay()
    const screenWidth = primaryDisplay.size.width
    const screenHeight = primaryDisplay.size.height

    switch (inputType) {
      case 'mousemove':
        if (x !== undefined && y !== undefined) {
          lastMouseX = Math.round(x * screenWidth)
          lastMouseY = Math.round(y * screenHeight)
          Input.setMousePosition(lastMouseX, lastMouseY)
        }
        break

      case 'mousedown':
        if (x !== undefined && y !== undefined) {
          lastMouseX = Math.round(x * screenWidth)
          lastMouseY = Math.round(y * screenHeight)
          Input.setMousePosition(lastMouseX, lastMouseY)
        }
        const mouseDownButton = button === 2 ? 'right' : button === 1 ? 'middle' : 'left'
        Input.pressMouse(mouseDownButton)
        break

      case 'mouseup':
        if (x !== undefined && y !== undefined) {
          lastMouseX = Math.round(x * screenWidth)
          lastMouseY = Math.round(y * screenHeight)
          Input.setMousePosition(lastMouseX, lastMouseY)
        }
        const mouseUpButton = button === 2 ? 'right' : button === 1 ? 'middle' : 'left'
        Input.releaseMouse(mouseUpButton)
        break

      case 'wheel':
        if (deltaY) {
          const scrollDelta = Math.sign(deltaY) * 50
          Input.scrollMouse(0, scrollDelta)
        }
        break

      case 'keydown':
        if (code) {
          try {
            Input.pressKey(code)
          } catch (e) {
            console.log('Key press error:', e)
          }
        }
        break

      case 'keyup':
        if (code) {
          try {
            Input.releaseKey(code)
          } catch (e) {
            console.log('Key release error:', e)
          }
        }
        break
    }
  } catch (error) {
    console.error('处理远程输入失败:', error)
  }
}

module.exports = {
  handleRemoteInput
}

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, systemPreferences, Input } = require('electron')
const path = require('path')
const os = require('os')

const instanceId = Math.random().toString(36).substr(2, 8)
const userDataPath = path.join(os.tmpdir(), `ycdesk-${instanceId}`)

app.setPath('userData', userDataPath)
app.setAppUserModelId(`com.ycdesk.desktop.${instanceId}`)

app.commandLine.appendSwitch('disable-features', 'SingleProcess')
app.commandLine.appendSwitch('disable-gpu-sandbox')

let mainWindow
let remoteWindow
let deviceId = generateDeviceId()
let remoteStreamInfo = null

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    },
    title: 'YCDesk - 远程桌面控制',
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    backgroundColor: '#ffffff'
  })

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (remoteWindow) {
      remoteWindow.close()
    }
  })

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`)
  })
}

function createRemoteWindow() {
  remoteWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    },
    title: 'YCDesk - 远程控制中',
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    backgroundColor: '#1a1a2e'
  })

  remoteWindow.loadFile('remote.html')

  remoteWindow.once('ready-to-show', () => {
    remoteWindow.show()
  })

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    remoteWindow.webContents.openDevTools({ mode: 'detach' })
  }

  remoteWindow.on('closed', () => {
    remoteWindow = null
  })
}

app.whenReady().then(() => {
  console.log('YCDesk 启动中...')
  console.log('Electron 版本:', process.versions.electron)
  console.log('Node 版本:', process.versions.node)
  console.log('平台:', process.platform)
  
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('YCDesk 正在退出...')
})

ipcMain.handle('get-device-id', () => {
  return deviceId
})

ipcMain.handle('get-sources', async () => {
  try {
    console.log('正在获取屏幕源...')
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: {
        width: 320,
        height: 240
      },
      fetchWindowIcons: true
    })
    
    console.log(`找到 ${sources.length} 个屏幕源`)
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  } catch (error) {
    console.error('获取屏幕源失败:', error)
    return []
  }
})

ipcMain.handle('open-remote-window', () => {
  console.log('打开远程控制窗口')
  if (!remoteWindow) {
    createRemoteWindow()
  } else {
    remoteWindow.focus()
  }
  return true
})

ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const result = {
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    scaleFactor: primaryDisplay.scaleFactor,
    workArea: primaryDisplay.workArea
  }
  console.log('屏幕尺寸:', result)
  return result
})

ipcMain.handle('get-platform', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node
  }
})

ipcMain.handle('set-remote-stream-info', (event, info) => {
  remoteStreamInfo = info
  console.log('设置远程流信息:', info)
  return true
})

ipcMain.handle('get-remote-stream-info', () => {
  console.log('获取远程流信息:', remoteStreamInfo)
  return remoteStreamInfo
})

ipcMain.handle('send-to-remote-window', (event, channel, data) => {
  if (remoteWindow) {
    remoteWindow.webContents.send(channel, data)
    return true
  }
  return false
})

ipcMain.handle('send-to-main-window', (event, channel, data) => {
  if (mainWindow) {
    mainWindow.webContents.send(channel, data)
    return true
  }
  return false
})

let lastMouseX = 0
let lastMouseY = 0

ipcMain.on('remote-input', async (event, inputData) => {
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
})

console.log('YCDesk 主进程已加载')

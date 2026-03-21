const { app, BrowserWindow, ipcMain, desktopCapturer, screen, systemPreferences } = require('electron')
const path = require('path')

let mainWindow
let remoteWindow
let deviceId = generateDeviceId()

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

console.log('YCDesk 主进程已加载')

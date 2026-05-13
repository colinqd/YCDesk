const { BrowserWindow, Tray, Menu, nativeImage, app, dialog } = require('electron')
const path = require('path')
const autoUnlockService = require('./auto-unlock-service')

let mainWindow = null
let remoteWindow = null
let tray = null
let isQuitting = false

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    },
    title: 'YCDesk - 远程桌面控制',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    backgroundColor: '#ffffff',
    frame: true,
    autoHideMenuBar: true,
    skipTaskbar: false
  })

  mainWindow.loadFile('index.html')

  autoUnlockService.setMainWindow(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow.setSkipTaskbar(false)
    mainWindow.show()
  })

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.setSkipTaskbar(true)
    mainWindow.hide()
    if (tray) {
      tray.displayBalloon({
        iconType: 'info',
        title: 'YCDesk',
        content: '程序已最小化到系统托盘，双击图标可恢复窗口'
      })
    }
  })

  mainWindow.on('show', () => {
    mainWindow.setSkipTaskbar(false)
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      // 如果是从托盘菜单退出，直接关闭
      return
    }

    // 阻止默认关闭行为
    event.preventDefault()

    // 弹出对话框询问用户
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['直接关闭', '最小化到托盘', '取消'],
      defaultId: 1,
      cancelId: 2,
      title: 'YCDesk',
      message: '您想要怎么做？',
      detail: '请选择您的操作：'
    })

    if (result === 0) {
      // 直接关闭
      isQuitting = true
      app.quit()
    } else if (result === 1) {
      // 最小化到托盘
      mainWindow.setSkipTaskbar(true)
      mainWindow.hide()
      if (tray && !tray.isDestroyed()) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'YCDesk',
          content: '程序已最小化到系统托盘，双击图标可恢复窗口'
        })
      }
    }
    // 取消则什么都不做
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    autoUnlockService.setMainWindow(null)
    if (remoteWindow) {
      remoteWindow.close()
    }
  })

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`)
  })
}

function createRemoteWindow() {
  if (remoteWindow) {
    remoteWindow.focus()
    return remoteWindow
  }

  remoteWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    },
    title: 'YCDesk - 远程控制中',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    backgroundColor: '#1a1a2e',
    fullscreen: true,
    skipTaskbar: true
  })

  remoteWindow.loadFile('remote.html')

  remoteWindow.once('ready-to-show', () => {
    remoteWindow.show()
    autoUnlockService.setRemoteWindow(remoteWindow)
  })

  remoteWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    event.preventDefault()
  })

  remoteWindow.webContents.setZoomLevel(0)
  remoteWindow.webContents.setVisualZoomLevelLimits(1, 1)

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    remoteWindow.webContents.openDevTools({ mode: 'detach' })
  }

  remoteWindow.on('closed', () => {
    remoteWindow = null
    autoUnlockService.setRemoteWindow(null)
  })

  return remoteWindow
}

function createTray() {
  let icon
  
  const iconPaths = [
    path.join(__dirname, '../../assets/icon.png'),
    path.join(__dirname, '../../assets/icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../build/icon.ico')
  ]
  
  for (const iconPath of iconPaths) {
    try {
      if (require('fs').existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) {
          break
        }
      }
    } catch (e) {
    }
  }
  
  if (!icon || icon.isEmpty()) {
    try {
      const builtInIconPath = path.join(process.resourcesPath, 'assets/icon.png')
      if (require('fs').existsSync(builtInIconPath)) {
        icon = nativeImage.createFromPath(builtInIconPath)
      }
    } catch (e) {
    }
  }
  
  if (!icon || icon.isEmpty()) {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVQ4T2NkYPj/n4EBBJgYKAQMowYMfAgwUhI7jIMiDBgpScUM4yALMFLiFmYYB1mAkRLXMMM4yAKMlLiGGcZBFgAArR8OGRf/Yw8AAAAASUVORK5CYII=')
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.setSkipTaskbar(false)
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '显示远程窗口',
      click: () => {
        if (remoteWindow) {
          remoteWindow.show()
          remoteWindow.focus()
        } else {
          createRemoteWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('YCDesk - 远程桌面控制')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function getMainWindow() {
  return mainWindow
}

function getRemoteWindow() {
  return remoteWindow
}

function minimizeMainWindow() {
  if (mainWindow) {
    mainWindow.setSkipTaskbar(true)
    mainWindow.hide()
    return true
  }
  return false
}

function maximizeMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
    return true
  }
  return false
}

function closeMainWindow() {
  if (mainWindow) {
    isQuitting = true
    mainWindow.close()
    return true
  }
  return false
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.setSkipTaskbar(false)
    mainWindow.show()
    mainWindow.focus()
    return true
  }
  return false
}

function quitApp() {
  isQuitting = true
}

module.exports = {
  createMainWindow,
  createRemoteWindow,
  createTray,
  getMainWindow,
  getRemoteWindow,
  minimizeMainWindow,
  maximizeMainWindow,
  closeMainWindow,
  showMainWindow,
  quitApp
}

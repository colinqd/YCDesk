const { BrowserWindow, Tray, Menu, nativeImage, app, dialog } = require('electron')
const path = require('path')

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
    autoHideMenuBar: true
  })

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.hide()
    if (tray) {
      tray.displayBalloon({
        iconType: 'info',
        title: 'YCDesk',
        content: '程序已最小化到系统托盘，双击图标可恢复窗口'
      })
    }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()

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
      isQuitting = true
      app.quit()
    } else if (result === 1) {
      mainWindow.hide()
      if (tray && !tray.isDestroyed()) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'YCDesk',
          content: '程序已最小化到系统托盘，双击图标可恢复窗口'
        })
      }
    }
  })

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
    fullscreen: false
  })

  remoteWindow.loadFile('remote.html')

  remoteWindow.once('ready-to-show', () => {
    remoteWindow.show()
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
  })

  return remoteWindow
}

function createTray() {
  let icon

  const iconPaths = [
    path.join(__dirname, '../../assets/icon.png'),
    path.join(__dirname, '../../build/icon.png')
  ]

  console.log('尝试加载托盘图标，路径列表:', iconPaths)

  for (const iconPath of iconPaths) {
    try {
      console.log('检查图标路径:', iconPath)
      if (require('fs').existsSync(iconPath)) {
        console.log('图标文件存在，尝试加载:', iconPath)
        icon = nativeImage.createFromPath(iconPath)
        console.log('加载后图标是否为空:', icon.isEmpty())
        if (!icon.isEmpty()) {
          console.log('托盘图标加载成功:', iconPath)
          break
        }
      }
    } catch (e) {
      console.log('加载图标失败:', iconPath, e.message)
    }
  }

  if (!icon || icon.isEmpty()) {
    console.log('使用默认图标')
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
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

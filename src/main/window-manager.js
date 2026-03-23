const { BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')

let mainWindow = null
let remoteWindow = null

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
      sandbox: false
    },
    title: 'YCDesk - 远程桌面控制',
    icon: path.join(__dirname, '../../assets/icon.png'),
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
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    },
    title: 'YCDesk - 远程控制中',
    icon: path.join(__dirname, '../../assets/icon.png'),
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

function getMainWindow() {
  return mainWindow
}

function getRemoteWindow() {
  return remoteWindow
}

module.exports = {
  createMainWindow,
  createRemoteWindow,
  getMainWindow,
  getRemoteWindow
}

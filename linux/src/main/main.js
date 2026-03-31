const { app, BrowserWindow, ipcMain, desktopCapturer, screen, Notification } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { createLogger } = require('./logger')

const logger = createLogger({
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
})

let mainWindow = null
let remoteWindow = null
let deviceId = null
let loggerInstance = null

function generateDeviceId() {
  return 'LNX-' + Math.random().toString(36).substr(2, 9).toUpperCase()
}

function getMainWindow() {
  return mainWindow
}

function getRemoteWindow() {
  return remoteWindow
}

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
    title: 'YCDesk - Remote Desktop Control',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    backgroundColor: '#ffffff',
    frame: true,
    autoHideMenuBar: true
  })

  mainWindow.loadFile(path.join(__dirname, '../../index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.NODE_ENV === 'development') {
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
      sandbox: false
    },
    title: 'YCDesk - Remote Control',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    backgroundColor: '#1a1a2e'
  })

  remoteWindow.loadFile(path.join(__dirname, '../../remote.html'))

  remoteWindow.once('ready-to-show', () => {
    remoteWindow.show()
  })

  if (process.env.NODE_ENV === 'development') {
    remoteWindow.webContents.openDevTools({ mode: 'detach' })
  }

  remoteWindow.on('closed', () => {
    remoteWindow = null
  })

  return remoteWindow
}

function initIpcHandlers() {
  ipcMain.handle('get-device-id', () => {
    return deviceId
  })

  ipcMain.handle('get-sources', async () => {
    logger.info('Getting screen sources...')
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: {
        width: 320,
        height: 240
      },
      fetchWindowIcons: true
    })
    
    logger.info(`Found ${sources.length} screen sources`)
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  })

  ipcMain.handle('open-remote-window', () => {
    console.log('Opening remote control window')
    createRemoteWindow()
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
    console.log('Screen size:', result)
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

  ipcMain.handle('send-to-remote-window', (event, channel, data) => {
    console.log('[send-to-remote-window] Request:', channel, 'Data length:', JSON.stringify(data).length)
    if (remoteWindow) {
      console.log('[send-to-remote-window] Remote window exists, sending message')
      remoteWindow.webContents.send(channel, data)
      return true
    }
    console.warn('[send-to-remote-window] Remote window not found')
    return false
  })

  ipcMain.handle('send-to-main-window', (event, channel, data) => {
    console.log('[send-to-main-window] Request:', channel)
    if (mainWindow) {
      mainWindow.webContents.send(channel, data)
      return true
    }
    console.warn('[send-to-main-window] Main window not found')
    return false
  })

  ipcMain.on('remote-window-ready', (event) => {
    console.log('[Main] Received remote window ready signal')
    if (mainWindow) {
      mainWindow.webContents.send('remote-window-ready', {})
    }
  })

  ipcMain.on('send-signaling-offer', (event, data) => {
    console.log('[Main] Received offer from remote window, forwarding to main window')
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-offer', data)
    }
  })

  ipcMain.on('send-signaling-answer', (event, data) => {
    console.log('[Main] Received answer from remote window, forwarding to main window')
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-answer', data)
    }
  })

  ipcMain.on('send-signaling-ice-candidate', (event, data) => {
    console.log('[Main] Received ICE candidate from remote window, forwarding to main window')
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-ice-candidate', data)
    }
  })

  ipcMain.on('remote-input', (event, inputData) => {
    try {
      handleRemoteInput(inputData)
    } catch (error) {
      console.error('[IPC Error] remote-input:', error)
    }
  })

  ipcMain.handle('get-local-ips', () => {
    const interfaces = os.networkInterfaces()
    const ips = []
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push({
            name: name,
            address: iface.address,
            netmask: iface.netmask
          })
        }
      }
    }
    return ips
  })

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize()
      return true
    }
    return false
  })

  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return true
    }
    return false
  })

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.close()
      return true
    }
    return false
  })
}

async function handleRemoteInput(inputData) {
  const { inputType, x, y, button, key, code, keyCode, ctrlKey, shiftKey, altKey, metaKey, deltaY, deltaX } = inputData
  
  console.log(`[Linux Input] ${inputType}:`, { x, y, button, key })
  
  try {
    const { mouse, keyboard, Button, Key } = require('@nut-tree/nut-js')
    
    switch (inputType) {
      case 'mousedown':
        await mouse.setPosition({ x: Math.round(x * screen.getPrimaryDisplay().size.width), y: Math.round(y * screen.getPrimaryDisplay().size.height) })
        if (button === 0) await mouse.pressButton(Button.LEFT)
        else if (button === 2) await mouse.pressButton(Button.RIGHT)
        break
        
      case 'mouseup':
        await mouse.setPosition({ x: Math.round(x * screen.getPrimaryDisplay().size.width), y: Math.round(y * screen.getPrimaryDisplay().size.height) })
        if (button === 0) await mouse.releaseButton(Button.LEFT)
        else if (button === 2) await mouse.releaseButton(Button.RIGHT)
        break
        
      case 'mousemove':
        await mouse.setPosition({ x: Math.round(x * screen.getPrimaryDisplay().size.width), y: Math.round(y * screen.getPrimaryDisplay().size.height) })
        break
        
      case 'wheel':
        await mouse.scrollDown(Math.round(deltaY / 100))
        break
        
      case 'keydown':
        if (key && key.length === 1) {
          await keyboard.type(key)
        }
        break
        
      case 'keyup':
        break
    }
  } catch (error) {
    console.error('[Linux Input] Error:', error.message)
  }
}

const instanceId = Math.random().toString(36).substr(2, 8)
const userDataPath = path.join(os.tmpdir(), `ycdesk-${instanceId}`)
deviceId = generateDeviceId()

app.setPath('userData', userDataPath)
app.setAppUserModelId(`com.ycdesk.linux.${instanceId}`)

app.commandLine.appendSwitch('disable-features', 'SingleProcess')
app.commandLine.appendSwitch('disable-gpu-sandbox')

app.whenReady().then(() => {
  logger.info('YCDesk Linux starting...')
  logger.info('Electron version:', { version: process.versions.electron })
  logger.info('Node version:', { version: process.versions.node })
  logger.info('Platform:', { platform: process.platform })
  logger.info('Device ID:', { deviceId: deviceId })
  
  initIpcHandlers()
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
  logger.info('YCDesk Linux exiting...')
})

logger.info('YCDesk Linux main process loaded')

module.exports = {
  getMainWindow,
  getRemoteWindow,
  createMainWindow,
  createRemoteWindow
}

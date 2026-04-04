const { app, BrowserWindow, ipcMain, desktopCapturer, screen, Notification } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const net = require('net')
const { createLogger } = require('./logger')

const logger = createLogger({
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
})

let mainWindow = null
let remoteWindow = null
let deviceId = null
let loggerInstance = null

let directServer = null
let directClients = new Map()
let connectionPassword = null
let remoteStreamInfo = null

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
    frame: false,
    titleBarStyle: 'hidden',
    fullscreenable: true,
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

  ipcMain.handle('set-remote-stream-info', (event, info) => {
    remoteStreamInfo = info
    return true
  })

  ipcMain.handle('get-remote-stream-info', () => {
    return remoteStreamInfo
  })

  ipcMain.handle('execute-in-remote-window', (event, code) => {
    if (remoteWindow) {
      remoteWindow.webContents.executeJavaScript(code)
      return true
    }
    return false
  })

  ipcMain.handle('reset-input-modifiers', () => {
    return true
  })

  ipcMain.handle('set-connection-password', (event, password) => {
    connectionPassword = password
    return true
  })

  ipcMain.handle('get-connection-password', () => {
    return connectionPassword
  })

  ipcMain.handle('has-connection-password', () => {
    return connectionPassword !== null
  })

  ipcMain.handle('clear-connection-password', () => {
    connectionPassword = null
    return true
  })

  ipcMain.handle('verify-connection-password', (event, password) => {
    return password === connectionPassword
  })

  ipcMain.handle('encrypt-data', (event, { data, password }) => {
    return data
  })

  ipcMain.handle('decrypt-data', (event, { encryptedData, password }) => {
    return encryptedData
  })

  ipcMain.handle('set-tray-icon', (event, visible) => {
    return true
  })

  ipcMain.handle('start-direct-server', (event, port) => {
    return new Promise((resolve) => {
      if (directServer) {
        resolve({ success: false, error: '服务器已在运行' })
        return
      }

      directServer = net.createServer((socket) => {
        const clientId = Math.random().toString(36).substr(2, 9)
        directClients.set(clientId, {
          socket: socket,
          buffer: ''
        })

        logger.info('新的直连客户端连接:', clientId)

        if (mainWindow) {
          mainWindow.webContents.send('direct-incoming-connection', {
            clientId: clientId,
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort
          })
        }

        socket.on('data', (data) => {
          logger.info('[Main-Controlled] 收到数据: 长度=' + data.length)
          const client = directClients.get(clientId)
          if (!client) {
            logger.error('[Main-Controlled] 收到数据但客户端不存在: clientId=' + clientId)
            return
          }

          client.buffer += data.toString()
          logger.info('[Main-Controlled] 更新后 buffer: 长度=' + client.buffer.length + ', 内容=' + client.buffer.substring(0, 100))

          while (client.buffer.includes('\n')) {
            const index = client.buffer.indexOf('\n')
            const messageStr = client.buffer.substring(0, index)
            client.buffer = client.buffer.substring(index + 1)
            logger.info('[Main-Controlled] 解析消息: ' + messageStr.substring(0, 200))

            try {
              const message = JSON.parse(messageStr)
              logger.info('[Main-Controlled] 收到直连消息, type=' + message.type)
              logger.info('[Main-Controlled] mainWindow 存在: ' + (mainWindow ? '是' : '否'))
              if (mainWindow) {
                logger.info('[Main-Controlled] 发送到渲染进程')
                mainWindow.webContents.send('direct-message', {
                  clientId: clientId,
                  message: message
                })
              }
            } catch (e) {
              logger.error('[Main-Controlled] 解析直连消息失败:', e, '原始消息:', messageStr)
            }
          }
        })

        socket.on('close', () => {
          logger.info('直连客户端断开:', clientId)
          directClients.delete(clientId)
          if (mainWindow) {
            mainWindow.webContents.send('direct-connection-closed', {
              clientId: clientId
            })
          }
        })

        socket.on('error', (err) => {
          logger.error('直连客户端错误:', err)
        })
      })

      directServer.listen(port, '0.0.0.0', () => {
        logger.info('直连服务器已启动，监听端口:', port)
        resolve({ success: true })
      })

      directServer.on('error', (err) => {
        logger.error('直连服务器错误:', err)
        resolve({ success: false, error: err.message })
      })
    })
  })

  ipcMain.handle('stop-direct-server', () => {
    return new Promise((resolve) => {
      if (!directServer) {
        resolve({ success: false, error: '服务器未运行' })
        return
      }

      directServer.close(() => {
        directServer = null
        directClients.clear()
        logger.info('直连服务器已停止')
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('connect-direct-client', (event, { host, port }) => {
    return new Promise((resolve) => {
      const clientId = Math.random().toString(36).substr(2, 9)
      const socket = new net.Socket()

      directClients.set(clientId, {
        socket: socket,
        buffer: ''
      })

      socket.connect(port, host, () => {
        logger.info('已连接到直连服务器:', host, port)
        resolve({ success: true, clientId: clientId })
      })

      socket.on('data', (data) => {
        logger.info('[Main-Controller] 收到数据: 长度=' + data.length)
        const client = directClients.get(clientId)
        if (!client) {
          logger.error('[Main-Controller] 收到数据但客户端不存在: clientId=' + clientId)
          return
        }

        client.buffer += data.toString()
        logger.info('[Main-Controller] 更新后 buffer: 长度=' + client.buffer.length + ', 内容=' + client.buffer.substring(0, 100))

        while (client.buffer.includes('\n')) {
          const index = client.buffer.indexOf('\n')
          const messageStr = client.buffer.substring(0, index)
          client.buffer = client.buffer.substring(index + 1)
          logger.info('[Main-Controller] 解析消息: ' + messageStr.substring(0, 200))

          try {
            const message = JSON.parse(messageStr)
            logger.info('[Main-Controller] 收到直连消息, type=' + message.type)
            logger.info('[Main-Controller] mainWindow 存在: ' + (mainWindow ? '是' : '否'))
            if (mainWindow) {
              logger.info('[Main-Controller] 发送到渲染进程')
              mainWindow.webContents.send('direct-message', {
                clientId: clientId,
                message: message
              })
            }
          } catch (e) {
            logger.error('[Main-Controller] 解析直连消息失败:', e, '原始消息:', messageStr)
          }
        }
      })

      socket.on('close', () => {
        logger.info('直连连接已关闭')
        directClients.delete(clientId)
        if (mainWindow) {
          mainWindow.webContents.send('direct-connection-closed', {
            clientId: clientId
          })
        }
      })

      socket.on('error', (err) => {
        logger.error('直连连接错误:', err)
        resolve({ success: false, error: err.message })
      })
    })
  })

  ipcMain.handle('send-direct-message', (event, { clientId, message }) => {
    return new Promise((resolve) => {
      logger.info('[Main] send-direct-message 被调用: clientId=' + clientId + ', message=' + JSON.stringify(message).substring(0, 200))
      const client = directClients.get(clientId)
      if (!client) {
        logger.error('[Main] send-direct-message 错误: 客户端不存在, clientId=' + clientId)
        resolve({ success: false, error: '客户端不存在' })
        return
      }

      try {
        const dataToSend = JSON.stringify(message) + '\n'
        logger.info('[Main] 正在发送数据到 socket, 长度=' + dataToSend.length)
        client.socket.write(dataToSend, () => {
          logger.info('[Main] 数据发送成功')
        })
        resolve({ success: true })
      } catch (e) {
        logger.error('[Main] 发送直连消息失败:', e)
        resolve({ success: false, error: e.message })
      }
    })
  })

  ipcMain.handle('close-direct-connection', (event, clientId) => {
    return new Promise((resolve) => {
      const client = directClients.get(clientId)
      if (!client) {
        resolve({ success: false, error: '客户端不存在' })
        return
      }

      client.socket.end()
      resolve({ success: true })
    })
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

  ipcMain.handle('toggle-remote-fullscreen', () => {
    if (remoteWindow) {
      const isFullScreen = remoteWindow.isSimpleFullScreen()
      remoteWindow.setSimpleFullscreen(!isFullScreen)
      return { success: true, isFullscreen: !isFullScreen }
    }
    return { success: false, error: 'Remote window not found' }
  })

  ipcMain.handle('is-remote-fullscreen', () => {
    if (remoteWindow) {
      return remoteWindow.isSimpleFullScreen()
    }
    return false
  })

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

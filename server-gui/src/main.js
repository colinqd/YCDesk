const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')

// 尝试多个可能的路径加载 server-module
let SignalingServer = null
const possiblePaths = [
  path.join(__dirname, '../../server/server-module.js'),   // dev 模式
  path.join(__dirname, 'server-module.js')                   // 打包后（与 main.js 同目录，在 app.asar 内）
]

for (const p of possiblePaths) {
  try {
    SignalingServer = require(p)
    console.log('成功加载 server-module 从:', p)
    break
  } catch (e) {
    console.log('尝试加载失败:', p, e.message)
  }
}

if (!SignalingServer) {
  console.error('无法加载 server-module，尝试的路径:', possiblePaths)
}

let mainWindow = null
let signalingServer = null
let isServerRunning = false

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    stopServerInternal()
  })
}

function log(message, type = 'info') {
  if (mainWindow) {
    mainWindow.webContents.send('server-log', {
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    })
  }
}

function updateStatus(running) {
  isServerRunning = running
  if (mainWindow) {
    if (running) {
      mainWindow.webContents.send('server-started')
    } else {
      mainWindow.webContents.send('server-stopped')
    }
  }
}

function startServerInternal(options) {
  if (isServerRunning) {
    log('服务器已经在运行中', 'warning')
    return { success: false, error: '服务器已在运行' }
  }

  try {
    const serverOptions = {
      port: options.port || 3000,
      cert: options.certPath || null,
      key: options.keyPath || null,
      noHttps: !options.useHttps,
      onLog: (msg, type) => log(msg, type)
    }

    signalingServer = new SignalingServer(serverOptions)
    const started = signalingServer.start()

    if (started) {
      updateStatus(true)
      return { success: true }
    } else {
      return { success: false, error: '启动服务器失败' }
    }
  } catch (error) {
    log('启动服务器异常: ' + error.message, 'error')
    return { success: false, error: error.message }
  }
}

function stopServerInternal() {
  if (!isServerRunning || !signalingServer) {
    return { success: false, error: '服务器未在运行' }
  }

  signalingServer.stop()
  signalingServer = null
  updateStatus(false)
  return { success: true }
}

ipcMain.handle('start-server', async (event, options) => {
  return startServerInternal(options)
})

ipcMain.handle('stop-server', async () => {
  return stopServerInternal()
})

ipcMain.handle('select-cert-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择证书文件 (.crt, .pem)',
    filters: [
      { name: '证书文件', extensions: ['crt', 'pem', 'cer'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { canceled: false, filePath: result.filePaths[0] }
  }
  return { canceled: true }
})

ipcMain.handle('select-key-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择私钥文件 (.key, .pem)',
    filters: [
      { name: '私钥文件', extensions: ['key', 'pem'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { canceled: false, filePath: result.filePaths[0] }
  }
  return { canceled: true }
})

app.whenReady().then(() => {
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
  stopServerInternal()
})

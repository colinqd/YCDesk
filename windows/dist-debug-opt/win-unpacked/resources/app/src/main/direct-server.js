const net = require('net')
const os = require('os')
const crypto = require('crypto')
const { getMainWindow } = require('./window-manager')

let directServer = null
let directClientConnections = new Map()
let logger = null

function initLogger(logInstance) {
  logger = logInstance
}

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  } else if (level === 'error') {
    console.error(`[DirectServer] ${message}`, data || '')
  }
}

function getLocalIps() {
  try {
    const interfaces = os.networkInterfaces()
    const ipList = []
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipList.push({ address: iface.address, family: 'IPv4', name: name })
        } else if (iface.family === 'IPv6' && !iface.internal && iface.scopeid === 0) {
          ipList.push({ address: iface.address, family: 'IPv6', name: name })
        }
      }
    }
    
    return ipList
  } catch (error) {
    log('error', '获取本地IP地址失败:', error.message)
    return []
  }
}

function setupClientSocket(clientSocket, clientId) {
  let lastHeartbeat = Date.now()
  let heartbeatInterval = null
  
  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  }
  
  let buffer = ''
  clientSocket.on('data', (data) => {
    lastHeartbeat = Date.now()
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line)
          if (message.type === 'heartbeat') {
            clientSocket.write(JSON.stringify({ type: 'heartbeat-ack' }) + '\n')
          } else if (message.type === 'screen-lock-state') {
            log('info', '收到TCP锁屏状态通知: ' + JSON.stringify(message))
            const mainWindow = getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send('direct-message', {
                clientId: clientId,
                message: {
                  type: 'screen-lock-state',
                  isLocked: message.isLocked,
                  autoUnlockEnabled: message.autoUnlockEnabled
                }
              })
            }
            const { getRemoteWindow } = require('./window-manager')
            const remoteWindow = getRemoteWindow()
            if (remoteWindow && !remoteWindow.isDestroyed()) {
              remoteWindow.webContents.send('unlock-state-changed', {
                isLocked: message.isLocked,
                autoUnlockEnabled: message.autoUnlockEnabled
              })
            }
          } else {
            const mainWindow = getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send('direct-message', {
                clientId: clientId,
                message: message
              })
            }
          }
        } catch (e) {
          log('error', '解析消息失败:', e.message)
        }
      }
    }
  })
  
  clientSocket.on('close', () => {
    cleanup()
    directClientConnections.delete(clientId)
    log('debug', '客户端连接关闭:', clientId)
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('direct-connection-closed', { clientId: clientId })
    }
  })
  
  clientSocket.on('error', (err) => {
    cleanup()
    log('error', '客户端连接错误:', err.message)
  })
  
  heartbeatInterval = setInterval(() => {
    const now = Date.now()
    if (now - lastHeartbeat > 30000) {
      log('debug', '客户端心跳超时，断开连接:', clientId)
      clientSocket.destroy()
      cleanup()
    }
  }, 15000)
}

async function startDirectServerImpl(port) {
  return new Promise((resolve, reject) => {
    if (directServer) {
      directServer.close(() => {
        directServer = null
      })
    }
    
    directClientConnections.clear()
    
    directServer = net.createServer((clientSocket) => {
      const clientId = crypto.randomBytes(4).toString('hex')
      directClientConnections.set(clientId, clientSocket)
      
      log('info', '新客户端连接:', { clientId, address: clientSocket.remoteAddress, port: clientSocket.remotePort })
      
      const mainWindow = getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('direct-incoming-connection', {
          clientId: clientId,
          remoteAddress: clientSocket.remoteAddress,
          remotePort: clientSocket.remotePort
        })
      }
      
      setupClientSocket(clientSocket, clientId)
    })
    
    directServer.on('error', (err) => {
      log('error', '直连服务器错误:', err.message)
      reject(err)
    })
    
    directServer.listen(port, '0.0.0.0', () => {
      log('info', '直连服务器已启动，监听端口:', port)
      resolve({ success: true, port: port })
    })
  })
}

async function stopDirectServerImpl() {
  return new Promise((resolve) => {
    if (directServer) {
      directServer.close(() => {
        directServer = null
        directClientConnections.clear()
        log('info', '直连服务器已停止')
        resolve({ success: true })
      })
    } else {
      directClientConnections.clear()
      resolve({ success: true })
    }
  })
}

async function connectDirectClientImpl(host, port) {
  return new Promise((resolve, reject) => {
    const clientSocket = new net.Socket()
    const clientId = crypto.randomBytes(4).toString('hex')
    
    clientSocket.on('error', (err) => {
      log('error', '连接错误:', err.message)
      reject(err)
    })
    
    clientSocket.connect(port, host, () => {
      directClientConnections.set(clientId, clientSocket)
      log('info', '成功连接到服务器:', { host, port })
      setupClientSocket(clientSocket, clientId)
      resolve({ success: true, clientId: clientId })
    })
  })
}

async function sendDirectMessageImpl(clientId, message) {
  const clientSocket = directClientConnections.get(clientId)
  if (clientSocket) {
    try {
      clientSocket.write(JSON.stringify(message) + '\n')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, error: '客户端未找到' }
}

async function closeDirectConnectionImpl(clientId) {
  const clientSocket = directClientConnections.get(clientId)
  if (clientSocket) {
    clientSocket.destroy()
    directClientConnections.delete(clientId)
  }
  
  const { resetAllInputState } = require('./input-handler')
  resetAllInputState()
  
  return { success: true }
}

function cleanup() {
  if (directServer) {
    directServer.close()
    directServer = null
  }
  directClientConnections.forEach((socket) => socket.destroy())
  directClientConnections.clear()
  log('info', '直连服务器已清理')
}

function notifyLockStateToClients(payload) {
  const message = { type: 'screen-lock-state', ...payload }
  log('info', '通知所有TCP客户端锁屏状态: ' + JSON.stringify(message))
  let sent = 0
  for (const [clientId, socket] of directClientConnections) {
    try {
      socket.write(JSON.stringify(message) + '\n')
      sent++
      log('info', '锁屏通知已发送到客户端: ' + clientId)
    } catch (e) {
      log('error', '通知锁屏状态失败(' + clientId + '): ' + e.message)
    }
  }
  return sent
}

function notifyLockStateToServer(payload) {
  const message = { type: 'screen-lock-state', ...payload }
  log('info', '通知TCP服务器端锁屏状态: ' + JSON.stringify(message))
  let sent = 0
  for (const [clientId, socket] of directClientConnections) {
    try {
      socket.write(JSON.stringify(message) + '\n')
      sent++
      log('info', '锁屏通知已发送: ' + clientId)
    } catch (e) {
      log('error', '通知锁屏状态失败(' + clientId + '): ' + e.message)
    }
  }
  return sent
}

module.exports = {
  getLocalIps,
  startDirectServerImpl,
  stopDirectServerImpl,
  connectDirectClientImpl,
  sendDirectMessageImpl,
  closeDirectConnectionImpl,
  initLogger,
  cleanup,
  notifyLockStateToClients,
  notifyLockStateToServer
}

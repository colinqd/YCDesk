const net = require('net')
const os = require('os')
const { getMainWindow } = require('./window-manager')

let directServer = null
let directClientConnections = new Map()

function getLocalIps() {
  try {
    const interfaces = os.networkInterfaces()
    const ipList = []
    
    console.log('开始获取本地IP地址...')
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log('找到IPv4地址:', name, iface.address)
          ipList.push({ address: iface.address, family: 'IPv4', name: name })
        } else if (iface.family === 'IPv6' && !iface.internal && iface.scopeid === 0) {
          console.log('找到IPv6地址:', name, iface.address)
          ipList.push({ address: iface.address, family: 'IPv6', name: name })
        }
      }
    }
    
    console.log('获取到的IP列表:', ipList)
    return ipList
  } catch (error) {
    console.error('获取本地IP地址失败:', error)
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
          console.error('解析消息失败:', e)
        }
      }
    }
  })
  
  clientSocket.on('close', () => {
    cleanup()
    directClientConnections.delete(clientId)
    console.log('客户端连接关闭:', clientId)
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('direct-connection-closed', { clientId: clientId })
    }
  })
  
  clientSocket.on('error', (err) => {
    cleanup()
    console.error('客户端连接错误:', err)
  })
  
  heartbeatInterval = setInterval(() => {
    const now = Date.now()
    if (now - lastHeartbeat > 15000) {
      console.log('客户端心跳超时，断开连接:', clientId)
      clientSocket.destroy()
      cleanup()
    }
  }, 10000)
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
      const clientId = Math.random().toString(36).substr(2, 8)
      directClientConnections.set(clientId, clientSocket)
      
      console.log('新客户端连接:', clientId, clientSocket.remoteAddress, clientSocket.remotePort)
      
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
      console.error('直连服务器错误:', err)
      reject(err)
    })
    
    directServer.listen(port, '0.0.0.0', () => {
      console.log('直连服务器已启动，监听端口:', port)
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
        console.log('直连服务器已停止')
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
    const clientId = Math.random().toString(36).substr(2, 8)
    
    clientSocket.on('error', (err) => {
      console.error('连接错误:', err)
      reject(err)
    })
    
    clientSocket.connect(port, host, () => {
      directClientConnections.set(clientId, clientSocket)
      console.log('成功连接到服务器:', host, port)
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
  return { success: true }
}

module.exports = {
  getLocalIps,
  startDirectServerImpl,
  stopDirectServerImpl,
  connectDirectClientImpl,
  sendDirectMessageImpl,
  closeDirectConnectionImpl
}

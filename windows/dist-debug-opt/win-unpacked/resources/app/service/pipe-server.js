/**
 * 命名管道服务端
 * 监听 \\.\pipe\YCDeskServiceControl 管道，处理 Electron 的连接
 */

const net = require('net')

const PIPE_PATH = '\\\\.\\pipe\\YCDeskServiceControl'

// 协议常量
const CMD_GET_SIGNALING_STATUS = 0x0060
const CMD_NOTIFY_WEBRTC_READY = 0x0061

class PipeServer {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.server = null
    this._clients = new Set()
    this._seq = 0
    this._signalingStatus = null
  }

  /**
   * 启动管道服务
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((client) => {
        this._handleClient(client)
      })

      this.server.on('error', (err) => {
        this.logger.error('管道服务错误: ' + err.message)
        reject(err)
      })

      this.server.listen(PIPE_PATH, () => {
        this.logger.info('管道服务已启动: ' + PIPE_PATH)
        resolve()
      })
    })
  }

  /**
   * 停止管道服务
   */
  stop() {
    for (const client of this._clients) {
      try { client.destroy() } catch (e) {}
    }
    this._clients.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.logger.info('管道服务已停止')
  }

  /**
   * 处理客户端连接
   */
  _handleClient(client) {
    this._clients.add(client)
    this.logger.info('Electron 应用已连接')

    let buffer = Buffer.alloc(0)

    client.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      this._processBuffer(client, buffer, (remaining) => {
        buffer = remaining
      })
    })

    client.on('close', () => {
      this._clients.delete(client)
      this.logger.info('Electron 应用已断开')
    })

    client.on('error', (err) => {
      this._clients.delete(client)
      this.logger.error('客户端错误: ' + err.message)
    })
  }

  /**
   * 处理接收到的数据
   */
  _processBuffer(client, buffer, setRemaining) {
    while (buffer.length >= 14) {
      // 验证魔数 YCCM
      if (buffer[0] !== 0x59 || buffer[1] !== 0x43 ||
          buffer[2] !== 0x43 || buffer[3] !== 0x4D) {
        const idx = buffer.indexOf(Buffer.from('YCCM'))
        if (idx === -1) { setRemaining(Buffer.alloc(0)); return }
        buffer = buffer.slice(idx)
        continue
      }

      const cmdId = buffer.readUInt16BE(4)
      const seq = buffer.readUInt32BE(6)
      const bodyLen = buffer.readUInt32BE(10)

      const totalLen = 14 + bodyLen
      if (buffer.length < totalLen) return

      const body = buffer.slice(14, totalLen)
      buffer = buffer.slice(totalLen)

      this._handleRequest(client, cmdId, seq, body)
    }

    setRemaining(buffer)
  }

  /**
   * 处理请求
   */
  _handleRequest(client, cmdId, seq, body) {
    let bodyObj = {}
    try {
      bodyObj = JSON.parse(body.toString('utf8'))
    } catch (e) {}

    switch (cmdId) {
      case CMD_GET_SIGNALING_STATUS:
        this._handleGetSignalingStatus(client, seq)
        break
      case CMD_NOTIFY_WEBRTC_READY:
        this._handleWebRTCReady(client, seq)
        break
      default:
        this._sendResponse(client, seq, 1, { error: 'Unknown command' })
    }
  }

  /**
   * 处理获取信令状态请求
   */
  _handleGetSignalingStatus(client, seq) {
    this._sendResponse(client, seq, 0, this._signalingStatus || { connected: false })
  }

  /**
   * 处理 WebRTC 就绪通知
   */
  _handleWebRTCReady(client, seq) {
    this.logger.info('Electron 通知 WebRTC 已就绪')
    this._sendResponse(client, seq, 0, { success: true })
  }

  /**
   * 发送响应
   */
  _sendResponse(client, reqSeq, errCode, body) {
    const bodyBuf = Buffer.from(JSON.stringify(body || {}), 'utf8')
    const packet = Buffer.alloc(16 + bodyBuf.length)

    packet.write('YCRP', 0, 4, 'ascii')
    packet.writeUInt32BE(reqSeq, 4)
    packet.writeInt32BE(errCode, 8)
    packet.writeUInt32BE(bodyBuf.length, 12)
    bodyBuf.copy(packet, 16)

    try {
      client.write(packet)
    } catch (e) {
      this.logger.error('发送响应失败: ' + e.message)
    }
  }

  /**
   * 检查是否有 Electron 应用连接
   */
  hasElectronConnection() {
    return this._clients.size > 0
  }

  /**
   * 通知 Electron 应用有入站连接
   */
  notifyIncomingConnection(fromDeviceId) {
    const body = Buffer.from(JSON.stringify({ type: 'incoming-connection', fromDeviceId }), 'utf8')
    const packet = Buffer.alloc(14 + body.length)

    packet.write('YCCM', 0, 4, 'ascii')
    packet.writeUInt16BE(0x0061, 4)  // CMD_NOTIFY_WEBRTC_READY
    packet.writeUInt32BE(++this._seq, 6)
    packet.writeUInt32BE(body.length, 10)
    body.copy(packet, 14)

    for (const client of this._clients) {
      try {
        client.write(packet)
      } catch (e) {
        this.logger.error('通知 Electron 失败: ' + e.message)
      }
    }
  }

  /**
   * 更新信令状态
   */
  updateSignalingStatus(status) {
    this._signalingStatus = status
  }
}

module.exports = PipeServer

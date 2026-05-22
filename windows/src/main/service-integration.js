const net = require('net')
const { EventEmitter } = require('events')

const SERVICE_STATE = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
}

const PIPE_NAME = '\\\\.\\pipe\\YCDeskServiceControl'
const FRAME_PIPE_NAME = '\\\\.\\pipe\\YCDeskScreenFrameData'
const COMMAND_TIMEOUT = 15000
const RECONNECT_DELAY = 2000
const MAX_RECONNECT_ATTEMPTS = 10

function encodeRequest(cmdId, seq, body) {
  const bodyJson = typeof body === 'string' ? body : JSON.stringify(body)
  const bodyBuf = Buffer.from(bodyJson, 'utf8')
  const bodyLen = bodyBuf.length

  const packet = Buffer.alloc(14 + bodyLen)
  packet.write('YCCM', 0, 4, 'ascii')
  packet.writeUInt16BE(cmdId, 4)
  packet.writeUInt32BE(seq, 6)
  packet.writeUInt32BE(bodyLen, 10)
  bodyBuf.copy(packet, 14)

  return packet
}

function decodeResponseHeader(buffer) {
  if (buffer.length < 16) return null

  if (buffer[0] !== 0x59 || buffer[1] !== 0x43 ||
      buffer[2] !== 0x52 || buffer[3] !== 0x50) {
    return null
  }

  return {
    reqSeq: buffer.readUInt32BE(4),
    errCode: buffer.readInt32BE(8),
    bodyLen: buffer.readUInt32BE(12)
  }
}

function decodeFrameHeader(buffer) {
  if (buffer.length < 24) return null

  if (buffer[0] !== 'Y'.charCodeAt(0) || buffer[1] !== 'C'.charCodeAt(0) ||
      buffer[2] !== 'F'.charCodeAt(0) || buffer[3] !== 'R'.charCodeAt(0)) {
    return null
  }

  return {
    seq: buffer.readUInt32BE(4),
    timestamp: buffer.readBigInt64BE(8),
    width: buffer.readUInt16BE(16),
    height: buffer.readUInt16BE(18),
    dataSize: buffer.readUInt32BE(20)
  }
}

class ServiceIntegration extends EventEmitter {
  constructor(options = {}) {
    super()
    this._logger = options.logger || { log: () => {}, error: () => {} }
    this._pipePath = PIPE_NAME
    this._framePipePath = FRAME_PIPE_NAME
    this._socket = null
    this._frameSocket = null
    this._seq = 0
    this._pendingRequests = new Map()
    this._state = SERVICE_STATE.STOPPED
    this._serviceModeEnabled = false
    this._frameBuffer = Buffer.alloc(0)
    this._reconnectAttempts = 0
    this._connectPromise = null
    this._resolveConnect = null
  }

  log(msg) {
    this._logger.log(`[ServiceIntegration] ${msg}`)
  }

  // ==================== 连接管理 ====================

  isServiceRunning() {
    return this._state === SERVICE_STATE.RUNNING
  }

  getState() {
    return this._state
  }

  async connect() {
    if (this._state === SERVICE_STATE.RUNNING) {
      return true
    }

    if (this._state === SERVICE_STATE.STARTING) {
      await this._connectPromise
      return this._state === SERVICE_STATE.RUNNING
    }

    this._state = SERVICE_STATE.STARTING
    this.log('Connecting to service pipe...')

    this._connectPromise = new Promise((resolve) => {
      this._resolveConnect = resolve
    })

    this._doConnect()

    await this._connectPromise
    return this._state === SERVICE_STATE.RUNNING
  }

  _doConnect() {
    this._disconnectInternal()

    const socket = net.createConnection(this._pipePath)

    socket.on('connect', () => {
      this.log('Connected to YCDeskServiceControl')
      this._socket = socket
      this._state = SERVICE_STATE.RUNNING
      this._reconnectAttempts = 0
      this._processBuffer()
      this._connectFramePipe()

      if (this._resolveConnect) {
        this._resolveConnect()
        this._resolveConnect = null
      }

      this.emit('connected')
    })

    socket.on('error', (err) => {
      this.log(`Pipe connection error: ${err.message}`)
      this._handleDisconnect()
    })

    socket.on('close', () => {
      this.log('Pipe connection closed')
      this._handleDisconnect()
    })

    socket.on('data', (chunk) => {
      this._dataBuffer = Buffer.concat([this._dataBuffer || Buffer.alloc(0), chunk])
      this._processBuffer()
    })
  }

  _handleDisconnect() {
    this._disconnectInternal()
    this._state = SERVICE_STATE.ERROR

    if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this._reconnectAttempts++
      this.log(`Reconnecting in ${RECONNECT_DELAY}ms (attempt ${this._reconnectAttempts})`)
      setTimeout(() => this._doConnect(), RECONNECT_DELAY)
    } else {
      this._state = SERVICE_STATE.STOPPED
      this.log('Max reconnect attempts reached')
      if (this._resolveConnect) {
        this._resolveConnect()
        this._resolveConnect = null
      }
      this.emit('disconnected')
    }
  }

  _disconnectInternal() {
    if (this._socket) {
      try { this._socket.destroy() } catch (e) {}
      this._socket = null
    }
    this._disconnectFramePipe()
    this._dataBuffer = Buffer.alloc(0)

    for (const [seq, pending] of this._pendingRequests) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(new Error('Connection lost'))
    }
    this._pendingRequests.clear()
  }

  _connectFramePipe() {
    this._disconnectFramePipe()

    const frameSocket = net.createConnection(this._framePipePath)

    frameSocket.on('connect', () => {
      this.log('Connected to frame data pipe')
      this._frameSocket = frameSocket
    })

    frameSocket.on('error', (err) => {
      this.log(`Frame pipe error: ${err.message}`)
    })

    frameSocket.on('close', () => {
      this._frameSocket = null
    })

    frameSocket.on('data', (chunk) => {
      this._frameBuffer = Buffer.concat([this._frameBuffer, chunk])

      while (true) {
        const header = decodeFrameHeader(this._frameBuffer)
        if (!header) {
          const idx = this._frameBuffer.indexOf(Buffer.from('YCFR'))
          if (idx === -1) { this._frameBuffer = Buffer.alloc(0); break }
          this._frameBuffer = this._frameBuffer.slice(idx)
          continue
        }

        const totalLen = 24 + header.dataSize
        if (this._frameBuffer.length < totalLen) break

        const jpegData = this._frameBuffer.slice(24, totalLen)
        this._frameBuffer = this._frameBuffer.slice(totalLen)

        this.emit('frame', {
          seq: header.seq,
          width: header.width,
          height: header.height,
          jpeg: jpegData,
          timestamp: header.timestamp ? Number(header.timestamp) : Date.now()
        })
      }
    })
  }

  _disconnectFramePipe() {
    if (this._frameSocket) {
      try { this._frameSocket.destroy() } catch (e) {}
      this._frameSocket = null
    }
    this._frameBuffer = Buffer.alloc(0)
  }

  disconnect() {
    this.log('Disconnecting')
    this._disconnectInternal()
    this._state = SERVICE_STATE.STOPPED
    this.emit('disconnected')
  }

  // ==================== 协议处理 ====================

  _nextSeq() {
    return ++this._seq
  }

  _processBuffer() {
    while (this._dataBuffer && this._dataBuffer.length >= 16) {
      if (this._dataBuffer[0] !== 0x59 || this._dataBuffer[1] !== 0x43 ||
          this._dataBuffer[2] !== 0x52 || this._dataBuffer[3] !== 0x50) {
        const idx = this._dataBuffer.indexOf(Buffer.from('YCRP'))
        if (idx === -1) { this._dataBuffer = Buffer.alloc(0); break }
        this._dataBuffer = this._dataBuffer.slice(idx)
        continue
      }

      const header = decodeResponseHeader(this._dataBuffer)
      if (!header) break

      const totalLen = 16 + header.bodyLen
      if (this._dataBuffer.length < totalLen) break

      const body = this._dataBuffer.slice(16, totalLen)
      this._dataBuffer = this._dataBuffer.slice(totalLen)

      const pending = this._pendingRequests.get(header.reqSeq)
      if (pending) {
        this._pendingRequests.delete(header.reqSeq)
        if (pending.timer) clearTimeout(pending.timer)

        let bodyStr = ''
        try { bodyStr = body.toString('utf8') } catch (e) {}

        if (header.errCode === 0) {
          try {
            pending.resolve({ errCode: 0, body: JSON.parse(bodyStr || '{}') })
          } catch (e) {
            pending.resolve({ errCode: 0, body: { raw: bodyStr } })
          }
        } else {
          pending.reject(new Error(`Service error ${header.errCode}: ${bodyStr}`))
        }
      }
    }
  }

  async _sendCommand(cmdId, body = {}) {
    if (!this._socket || this._state !== SERVICE_STATE.RUNNING) {
      throw new Error('Service not connected')
    }

    return new Promise((resolve, reject) => {
      const seq = this._nextSeq()
      const request = encodeRequest(cmdId, seq, body)

      const timer = setTimeout(() => {
        if (this._pendingRequests.has(seq)) {
          this._pendingRequests.delete(seq)
          reject(new Error(`Command 0x${cmdId.toString(16)} timed out`))
        }
      }, COMMAND_TIMEOUT)

      this._pendingRequests.set(seq, { resolve, reject, timer, ts: Date.now() })

      try {
        this._socket.write(request)
      } catch (e) {
        clearTimeout(timer)
        this._pendingRequests.delete(seq)
        reject(e)
      }
    })
  }

  // ==================== 公共 API ====================

  // --- 屏幕捕获 ---
  async captureScreen(options = {}) {
    return this._sendCommand(0x0010, {
      desktopTarget: options.desktopTarget || 'auto',
      fps: options.fps || 30,
      lockScreenFps: options.lockScreenFps || 8,
      jpegQuality: options.jpegQuality || 70,
      maxWidth: options.maxWidth || 1920,
      maxHeight: options.maxHeight || 1080
    })
  }

  async startCapture(config = {}) {
    return this.captureScreen(config)
  }

  async stopCapture() {
    return this._sendCommand(0x0011, {})
  }

  // --- 输入注入 ---
  async sendInput(type, params = {}) {
    switch (type) {
      case 'key':
        return this._sendCommand(0x0020, params)
      case 'mouse':
        return this._sendCommand(0x0021, params)
      case 'typeString':
        return this._sendCommand(0x0022, { text: params.text || params })
      default:
        throw new Error(`Unknown input type: ${type}`)
    }
  }

  // --- 解锁 ---
  async unlockScreen(password = '', username = '') {
    this.log(`unlockScreen called, password length=${password.length}`)
    return this._sendCommand(0x0030, { password, username })
  }

  // --- 桌面切换 ---
  async switchDesktop(desktop = 'default') {
    return this._sendCommand(0x0050, { desktop })
  }

  async switchToWinlogon() {
    return this.switchDesktop('winlogon')
  }

  async switchToDefault() {
    return this.switchDesktop('default')
  }

  // --- 状态查询 ---
  async queryStatus() {
    return this._sendCommand(0x0040, {})
  }

  // --- 服务模式 ---
  setServiceModeEnabled(enabled) {
    this._serviceModeEnabled = !!enabled
    this.log(`Service mode ${enabled ? 'ENABLED' : 'DISABLED'}`)

    if (enabled) {
      this.connect().catch(e => this.log(`Auto-connect failed: ${e.message}`))
    } else {
      this.disconnect()
    }
  }

  isServiceModeEnabled() {
    return this._serviceModeEnabled
  }

  // ==================== 兼容层方法（旧 API） ====================

  async start() {
    this.setServiceModeEnabled(true)
    return this.connect()
  }

  async stop() {
    this.disconnect()
    return true
  }

  async restart() {
    this.disconnect()
    return this.start()
  }

  isRunning() {
    return this._state === SERVICE_STATE.RUNNING && !!this._socket
  }

  async heartbeat() {
    return this._sendCommand(0x0001, {})
  }

  async destroy() {
    return this.disconnect()
  }

  get _client() {
    return { isConnected: this.isRunning() }
  }
}

let _instance = null
function getServiceIntegration(options = {}) {
  if (!_instance) {
    _instance = new ServiceIntegration(options)
  }
  return _instance
}

module.exports = { ServiceIntegration, SERVICE_STATE, getServiceIntegration }

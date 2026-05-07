
// service-integration.js - 占位文件
const EventEmitter = require('events')

const SERVICE_STATE = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
}

class ServiceIntegration extends EventEmitter {
  constructor(options = {}) {
    super()
    this.logger = options.logger || console
    this._client = null
    this._state = SERVICE_STATE.STOPPED
    this._serviceModeEnabled = false
  }

  setServiceModeEnabled(enabled) {
    this._serviceModeEnabled = enabled
    this.logger.info(`服务模式已${enabled ? '启用' : '禁用'}`)
  }

  isServiceModeEnabled() {
    return this._serviceModeEnabled || false
  }

  isRunning() {
    return this._state === SERVICE_STATE.RUNNING
  }

  getState() {
    return this._state
  }

  async start() {
    const oldState = this._state
    this._state = SERVICE_STATE.STARTING
    this.emit('stateChange', { oldState, newState: SERVICE_STATE.STARTING })
    
    this._state = SERVICE_STATE.RUNNING
    this.emit('stateChange', { oldState: SERVICE_STATE.STARTING, newState: SERVICE_STATE.RUNNING })
    this.emit('started')
    
    this.logger.info('服务已启动')
    return { success: true }
  }

  async stop() {
    const oldState = this._state
    this._state = SERVICE_STATE.STOPPING
    this.emit('stateChange', { oldState, newState: SERVICE_STATE.STOPPING })
    
    this._state = SERVICE_STATE.STOPPED
    this.emit('stateChange', { oldState: SERVICE_STATE.STOPPING, newState: SERVICE_STATE.STOPPED })
    this.emit('stopped')
    
    this.logger.info('服务已停止')
    return { success: true }
  }

  async restart() {
    await this.stop()
    await this.start()
    return { success: true }
  }

  async captureScreen(options = {}) {
    return { success: false, error: 'service not implemented' }
  }

  async sendInput(type, params) {
    return { success: false, error: 'service not implemented' }
  }

  async unlockScreen(password = '') {
    return { success: false, error: 'service not implemented' }
  }

  async heartbeat() {
    return { success: true, data: 'ok' }
  }

  async connectToWindowsService() {
    return { success: true }
  }

  async disconnectFromWindowsService() {
    return { success: true }
  }

  async destroy() {
    await this.stop()
    return { success: true }
  }
}

let instance = null

function getServiceIntegration(options = {}) {
  if (!instance) {
    instance = new ServiceIntegration(options)
  }
  return instance
}

module.exports = {
  getServiceIntegration,
  SERVICE_STATE,
  ServiceIntegration
}

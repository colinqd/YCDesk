
// test-unlock-logger.js - 占位文件
const path = require('path')
const os = require('os')
const fs = require('fs')

class TestUnlockLogger {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.logPath = path.join(os.tmpdir(), 'ycdesk_unlock_test.log')
    this.logs = []
  }

  info(message, data) {
    const logEntry = `[INFO] ${new Date().toISOString()} ${message}${data ? ' ' + JSON.stringify(data) : ''}`
    this.logs.push(logEntry)
    this.logger.info(message, data)
  }

  success(message, data) {
    const logEntry = `[SUCCESS] ${new Date().toISOString()} ${message}${data ? ' ' + JSON.stringify(data) : ''}`
    this.logs.push(logEntry)
    this.logger.info(message, data)
  }

  warning(message, data) {
    const logEntry = `[WARN] ${new Date().toISOString()} ${message}${data ? ' ' + JSON.stringify(data) : ''}`
    this.logs.push(logEntry)
    this.logger.warn(message, data)
  }

  error(message, data) {
    const logEntry = `[ERROR] ${new Date().toISOString()} ${message}${data ? ' ' + JSON.stringify(data) : ''}`
    this.logs.push(logEntry)
    this.logger.error(message, data)
  }

  failure(message, data) {
    const logEntry = `[FAILURE] ${new Date().toISOString()} ${message}${data ? ' ' + JSON.stringify(data) : ''}`
    this.logs.push(logEntry)
    this.logger.error(`❌ ${message}`, data)
  }

  section(name) {
    this.info(`--- ${name} ---`)
  }

  separator(title = '') {
    this.info(title ? `=== ${title} ===` : '================================')
  }

  clear() {
    this.logs = []
    try {
      if (fs.existsSync(this.logPath)) {
        fs.unlinkSync(this.logPath)
      }
    } catch (e) {
      this.logger.error('Failed to clear log file:', e)
    }
  }

  read() {
    return this.logs.join('\n')
  }

  getLogPath() {
    return this.logPath
  }

  save() {
    try {
      fs.writeFileSync(this.logPath, this.read(), 'utf8')
      return true
    } catch (e) {
      this.logger.error('Failed to save log:', e)
      return false
    }
  }
}

let instance = null

function getTestUnlockLogger(options = {}) {
  if (!instance) {
    instance = new TestUnlockLogger(options)
  }
  return instance
}

module.exports = getTestUnlockLogger()

const path = require('path')
const fs = require('fs')
const os = require('os')

let loggerInstance = null

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
}

const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS)

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || this.getDefaultLogDir()
    this.logLevel = options.logLevel || 'info'
    this.consoleEnabled = options.console !== false
    this.fileEnabled = options.file !== false
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024
    this.maxFiles = options.maxFiles || 10

    this.ensureLogDir()
    this.currentLogFile = this.getLogFilePath()
    this.logLevelValue = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info
  }

  getDefaultLogDir() {
    const appName = 'YCDesk'
    let logDir

    if (process.platform === 'win32') {
      logDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'logs')
    } else if (process.platform === 'darwin') {
      logDir = path.join(os.homedir(), 'Library', 'Logs', appName)
    } else {
      logDir = path.join(os.homedir(), '.local', 'share', appName, 'logs')
    }

    return logDir
  }

  getLogFilePath() {
    const date = new Date().toISOString().split('T')[0]
    return path.join(this.logDir, `ycdesk-${date}.log`)
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  shouldLog(level) {
    const levelValue = LOG_LEVELS[level]
    return levelValue !== undefined && levelValue <= this.logLevelValue
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString()
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return

    const formattedMessage = this.formatMessage(level, message, meta)

    if (this.consoleEnabled) {
      const consoleMethod = level === 'error' ? console.error :
                           level === 'warn' ? console.warn :
                           level === 'debug' ? console.debug : console.log
      consoleMethod(formattedMessage)
    }

    if (this.fileEnabled) {
      this.writeToFile(formattedMessage)
    }
  }

  writeToFile(message) {
    try {
      this.rotateLogsIfNeeded()
      fs.appendFileSync(this.currentLogFile, message + '\n', 'utf8')
    } catch (error) {
      console.error('Failed to write log to file:', error)
    }
  }

  rotateLogsIfNeeded() {
    try {
      if (!fs.existsSync(this.currentLogFile)) return

      const stats = fs.statSync(this.currentLogFile)
      if (stats.size >= this.maxFileSize) {
        const oldFile = this.currentLogFile
        const timestamp = Date.now()
        const backupFile = `${oldFile}.${timestamp}`
        fs.renameSync(oldFile, backupFile)
        this.cleanupOldLogs()
      }
    } catch (error) {
      console.error('Failed to rotate logs:', error)
    }
  }

  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
      .filter(file => file.startsWith('ycdesk-') && file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(this.logDir, file),
        time: fs.statSync(path.join(this.logDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time)

      if (files.length > this.maxFiles) {
        const filesToDelete = files.slice(this.maxFiles)
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path)
        })
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error)
    }
  }

  error(message, meta) {
    this.log('error', message, meta)
  }

  warn(message, meta) {
    this.log('warn', message, meta)
  }

  info(message, meta) {
    this.log('info', message, meta)
  }

  debug(message, meta) {
    this.log('debug', message, meta)
  }

  verbose(message, meta) {
    this.log('verbose', message, meta)
  }

  setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.logLevel = level
      this.logLevelValue = LOG_LEVELS[level]
      this.info(`Log level changed to: ${level}`)
    }
  }

  getLogDir() {
    return this.logDir
  }

  getCurrentLogFile() {
    return this.currentLogFile
  }
}

function createLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options)
  }
  return loggerInstance
}

module.exports = {
  Logger,
  createLogger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES
}

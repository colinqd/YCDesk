const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
}

const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS)

let loggerInstance = null

class RendererLogger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info'
    this.consoleEnabled = options.console !== false
    this.uiLogEnabled = options.uiLog !== false
    this.logLevelValue = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info
    this.uiLogElement = options.uiLogElement || null
    this.maxUiLogs = options.maxUiLogs || 100
  }

  shouldLog(level) {
    const levelValue = LOG_LEVELS[level]
    return levelValue !== undefined && levelValue <= this.logLevelValue
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toLocaleTimeString()
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

    if (this.uiLogEnabled && this.uiLogElement) {
      this.writeToUi(formattedMessage, level)
    }
  }

  writeToUi(message, level) {
    try {
      const div = document.createElement('div')
      div.className = `log-entry log-${level}`
      div.textContent = message
      
      this.uiLogElement.appendChild(div)
      
      while (this.uiLogElement.children.length > this.maxUiLogs) {
        this.uiLogElement.removeChild(this.uiLogElement.firstChild)
      }
      
      this.uiLogElement.scrollTop = this.uiLogElement.scrollHeight
    } catch (error) {
      console.error('Failed to write log to UI:', error)
    }
  }

  setUiLogElement(element) {
    this.uiLogElement = element
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
}

function createRendererLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new RendererLogger(options)
  }
  return loggerInstance
}

function getRendererLogger() {
  if (!loggerInstance) {
    return createRendererLogger()
  }
  return loggerInstance
}

module.exports = {
  RendererLogger,
  createRendererLogger,
  getRendererLogger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES
}

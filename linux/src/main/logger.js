const fs = require('fs')
const path = require('path')
const os = require('os')

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
}

function createLogger(options = {}) {
  const {
    logLevel = LOG_LEVELS.INFO,
    logFile = path.join(os.tmpdir(), 'ycdesk-linux.log')
  } = options
  
  const logStream = fs.createWriteStream(logFile, { flags: 'a' })
  
  function formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString()
    const formattedData = data ? ' ' + JSON.stringify(data) : ''
    return `[${timestamp}] [${level}] ${message}${formattedData}`
  }
  
  function log(level, levelName, message, data) {
    if (level >= logLevel) {
      const formatted = formatMessage(levelName, message, data)
      console.log(formatted)
      logStream.write(formatted + '\n')
    }
  }
  
  return {
    debug: (message, data) => log(LOG_LEVELS.DEBUG, 'DEBUG', message, data),
    info: (message, data) => log(LOG_LEVELS.INFO, 'INFO', message, data),
    warn: (message, data) => log(LOG_LEVELS.WARN, 'WARN', message, data),
    error: (message, data) => log(LOG_LEVELS.ERROR, 'ERROR', message, data),
    close: () => logStream.end()
  }
}

module.exports = {
  createLogger,
  LOG_LEVELS
}

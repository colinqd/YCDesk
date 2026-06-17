class Logger {
  constructor(options = {}) {
    this.level = options.level || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug')
    this.prefix = options.prefix || ''
    this._levels = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }
  }

  _shouldLog(level) {
    return this._levels[level] >= this._levels[this.level]
  }

  _format(level, args) {
    const timestamp = new Date().toISOString()
    const prefix = this.prefix ? `[${this.prefix}]` : ''
    return [`${timestamp} ${prefix}[${level.toUpperCase()}]`, ...args]
  }

  debug(...args) { if (this._shouldLog('debug')) console.debug(...this._format('debug', args)) }
  info(...args) { if (this._shouldLog('info')) console.info(...this._format('info', args)) }
  warn(...args) { if (this._shouldLog('warn')) console.warn(...this._format('warn', args)) }
  error(...args) { if (this._shouldLog('error')) console.error(...this._format('error', args)) }
  fatal(...args) { console.error(...this._format('fatal', args)) }
}

module.exports = { Logger }
const { app, crashReporter } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

class CrashReporter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.logDir = options.logDir || path.join(os.homedir(), '.ycdesk_logs', 'crashes')
    this.maxCrashFiles = options.maxCrashFiles || 20
    this.logFn = options.log || console
    this.uploadToServer = options.uploadToServer !== false
    this.submitURL = options.submitURL || ''
    this.stats = { totalCrashes: 0, lastCrash: null, crashHistory: [] }
    this._ensureDir()
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true })
    } catch (e) {
      this.logFn.error('[CrashReporter] 无法创建崩溃日志目录: ' + e.message)
    }
  }

  init() {
    if (!this.enabled) { this.logFn.info('[CrashReporter] 崩溃报告已禁用'); return }
    try {
      crashReporter.start({
        productName: 'YCDesk', companyName: 'YCDesk',
        submitURL: this.uploadToServer ? (this.submitURL || '') : '',
        uploadToServer: this.uploadToServer,
        ignoreSystemCrashHandler: false, rateLimit: false, compress: true
      })
      this.logFn.info('[CrashReporter] 崩溃报告初始化完成')
    } catch (e) {
      this.logFn.error('[CrashReporter] 崩溃报告初始化失败: ' + e.message)
    }
  }

  recordCrash(type, details = {}) {
    this.stats.totalCrashes++
    var crashRecord = {
      index: this.stats.totalCrashes, type: type,
      timestamp: new Date().toISOString(), details: details,
      platform: process.platform, arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'unknown',
      appVersion: app ? app.getVersion() : 'unknown'
    }
    this.stats.lastCrash = crashRecord
    this.stats.crashHistory.push(crashRecord)
    if (this.stats.crashHistory.length > 50) this.stats.crashHistory = this.stats.crashHistory.slice(-30)
    this._writeCrashLog(crashRecord)
    this._cleanupOldLogs()
  }

  _writeCrashLog(crashRecord) {
    try {
      var filename = 'crash-' + crashRecord.timestamp.replace(/[:.]/g, '-') + '.json'
      var filepath = path.join(this.logDir, filename)
      fs.writeFileSync(filepath, JSON.stringify(crashRecord, null, 2), 'utf8')
      this.logFn.info('[CrashReporter] 崩溃记录已保存: ' + filepath)
    } catch (e) {
      this.logFn.error('[CrashReporter] 保存崩溃记录失败: ' + e.message)
    }
  }

  _cleanupOldLogs() {
    try {
      var self = this
      var files = fs.readdirSync(this.logDir)
        .filter(function(f) { return f.startsWith('crash-') && f.endsWith('.json') })
        .map(function(f) { return { name: f, path: path.join(self.logDir, f) } })
        .sort(function(a, b) { return fs.statSync(a.path).mtimeMs - fs.statSync(b.path).mtimeMs })
      while (files.length > this.maxCrashFiles) {
        var removed = files.shift()
        fs.unlinkSync(removed.path)
        this.logFn.info('[CrashReporter] 清理旧崩溃日志: ' + removed.name)
      }
    } catch (e) {
      this.logFn.error('[CrashReporter] 清理旧日志失败: ' + e.message)
    }
  }

  getStats() { return Object.assign({}, this.stats) }
  getRecentCrashes(count) {
    var history = this.stats.crashHistory
    return history.slice(Math.max(0, history.length - (count || 10)))
  }
  getLogDir() { return this.logDir }
  clear() { this.stats.totalCrashes = 0; this.stats.lastCrash = null; this.stats.crashHistory = [] }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = CrashReporter }
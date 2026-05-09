/**
 * 提权与 Windows Service 管理器
 * 负责安装、卸载、启动、停止 YCDeskService Windows 服务
 * 需要管理员权限
 */

const { execSync, execFileSync } = require('child_process')
const path = require('path')
const os = require('os')

class ElevationManager {
  constructor(options = {}) {
    this._logger = options.logger || { log: () => {}, error: () => {} }
    this._serviceName = 'YCDeskService'
    this._serviceDisplayName = 'YCDesk Remote Desktop Service'
    this._serviceDescription = 'YCDesk 远程桌面后台服务，提供锁屏画面捕获和系统级输入注入功能'
  }

  log(msg) { this._logger.log(`[ElevationManager] ${msg}`) }

  /**
   * 获取服务 exe 的路径
   * 开发时：项目 bin/ 目录
   * 打包后：app.asar.unpacked 或 extraResources
   */
  _getServiceExePath() {
    const possiblePaths = [
      path.join(__dirname, '../../bin/YCDeskService.exe'),
      path.join(__dirname, '../../dist-v2/win-unpacked/service/YCDeskService.exe'),
      path.join(__dirname, '../../service/build/Release/YCDeskService.exe'),
      path.join(process.resourcesPath || '', 'service/YCDeskService.exe'),
      path.join(process.resourcesPath || '', '../service/YCDeskService.exe')
    ]

    for (const p of possiblePaths) {
      try {
        require('fs').accessSync(p)
        return path.resolve(p)
      } catch (e) {
        // not found, try next
      }
    }

    // fallback: return the first path
    return path.resolve(possiblePaths[0])
  }

  // ==================== 权限检查 ====================

  isElevated() {
    try {
      execSync('net session', { stdio: 'ignore' })
      return true
    } catch (e) {
      return false
    }
  }

  // ==================== 服务管理 ====================

  /**
   * 查询服务状态
   */
  async queryServiceStatus() {
    try {
      const output = execSync(`sc query ${this._serviceName}`, { encoding: 'utf8', timeout: 5000 })

      if (output.includes('RUNNING')) return { installed: true, running: true }
      if (output.includes('STOPPED')) return { installed: true, running: false }
      if (output.includes('STOP_PENDING')) return { installed: true, running: false, pending: 'stop' }
      if (output.includes('START_PENDING')) return { installed: true, running: false, pending: 'start' }

      return { installed: true, running: false }
    } catch (e) {
      if (e.message.includes('1060')) {
        return { installed: false, running: false }
      }
      return { installed: false, running: false, error: e.message }
    }
  }

  /**
   * 安装 Windows Service
   */
  async installService() {
    const exePath = this._getServiceExePath()

    try {
      require('fs').accessSync(exePath)
    } catch (e) {
      return {
        success: false,
        error: `Service executable not found: ${exePath}. Please build the service first.`
      }
    }

    this.log(`Installing service: ${exePath}`)

    try {
      // sc create
      const createCmd = `sc create "${this._serviceName}" binPath= "${exePath}" start= auto DisplayName= "${this._serviceDisplayName}"`
      const createOutput = execSync(createCmd, { encoding: 'utf8', timeout: 15000 })
      this.log(`Create result: ${createOutput.trim()}`)

      // sc description
      try {
        execSync(`sc description "${this._serviceName}" "${this._serviceDescription}"`,
          { encoding: 'utf8', timeout: 5000 })
      } catch (e) {
        // non-critical
      }

      // sc failure (自动恢复配置)
      try {
        execSync(`sc failure "${this._serviceName}" reset= 86400 actions= restart/5000/restart/10000/restart/30000`,
          { encoding: 'utf8', timeout: 5000 })
      } catch (e) {
        // non-critical
      }

      return { success: true, output: createOutput.trim() }
    } catch (e) {
      this.log(`Install failed: ${e.message}`)
      return { success: false, error: e.message }
    }
  }

  /**
   * 卸载 Windows Service
   */
  async uninstallService() {
    this.log('Uninstalling service')

    // Stop first
    await this.stopService()

    try {
      const output = execSync(`sc delete "${this._serviceName}"`, { encoding: 'utf8', timeout: 15000 })
      return { success: true, output: output.trim() }
    } catch (e) {
      // 1072: already marked for deletion
      if (e.message.includes('1072')) {
        return { success: true, output: 'Service marked for deletion' }
      }
      return { success: false, error: e.message }
    }
  }

  /**
   * 启动服务
   */
  async startService() {
    this.log('Starting service')

    try {
      const output = execSync(`sc start "${this._serviceName}"`, { encoding: 'utf8', timeout: 30000 })
      this.log(`Start result: ${output.trim()}`)

      // 等待服务启动完成
      await this._waitForServiceState('RUNNING', 10000)

      return { success: true, output: output.trim() }
    } catch (e) {
      if (e.message.includes('1056')) {
        // Already running
        return { success: true, output: 'Service already running' }
      }
      this.log(`Start failed: ${e.message}`)
      return { success: false, error: e.message }
    }
  }

  /**
   * 停止服务
   */
  async stopService() {
    this.log('Stopping service')

    try {
      const output = execSync(`sc stop "${this._serviceName}"`, { encoding: 'utf8', timeout: 30000 })
      this.log(`Stop result: ${output.trim()}`)

      await this._waitForServiceState('STOPPED', 10000)

      return { success: true, output: output.trim() }
    } catch (e) {
      if (e.message.includes('1062')) {
        return { success: true, output: 'Service not started' }
      }
      return { success: false, error: e.message }
    }
  }

  /**
   * 等待服务达到指定状态
   */
  async _waitForServiceState(targetState, timeoutMs) {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      await this._sleep(500)
      const status = await this.queryServiceStatus()

      if (targetState === 'RUNNING' && status.running) return true
      if (targetState === 'STOPPED' && !status.running && status.installed) {
        // double check no pending
        if (!status.pending) return true
      }
    }

    return false
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { ElevationManager }

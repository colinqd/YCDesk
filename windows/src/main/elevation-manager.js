
// elevation-manager.js - 占位文件
class ElevationManager {
  constructor(options = {}) {
    this.logger = options.logger || console
  }

  isElevated() {
    return false
  }

  async elevate() {
    return { success: false, error: 'not implemented' }
  }

  async runElevated(command, args = []) {
    return { success: false, error: 'not implemented' }
  }

  async installService() {
    return { success: false, error: 'not implemented' }
  }

  async uninstallService() {
    return { success: false, error: 'not implemented' }
  }

  async startService() {
    return { success: false, error: 'not implemented' }
  }

  async stopService() {
    return { success: false, error: 'not implemented' }
  }

  async startServiceWithElevation() {
    return { success: false, error: 'not implemented' }
  }

  async stopServiceWithElevation() {
    return { success: false, error: 'not implemented' }
  }
}

module.exports = ElevationManager

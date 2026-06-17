const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

// 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.ycdesk')
const AUTO_START_CONFIG = path.join(CONFIG_DIR, 'auto-start.json')

function register(safeHandler, logFn) {
  // 获取当前自启动状态
  ipcMain.handle('auto-start:get-status', safeHandler(async () => {
    try {
      const loginItemSettings = app.getLoginItemSettings()
      const isRegistered = loginItemSettings.openAtLogin
      return { success: true, enabled: isRegistered }
    } catch (e) {
      if (logFn) logFn('error', '获取自启动状态失败', { error: e.message })
      return { success: false, enabled: false, error: e.message }
    }
  }, 'auto-start:get-status'))

  // 设置自启动开关
  ipcMain.handle('auto-start:set', safeHandler(async (event, { enabled }) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? ['--auto-start'] : []
      })
      // 保存配置到文件
      saveAutoStartConfig({ enabled })
      if (logFn) logFn('info', enabled ? '已启用开机自启动' : '已禁用开机自启动')
      return { success: true, enabled }
    } catch (e) {
      if (logFn) logFn('error', '设置自启动失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-start:set'))
}

function saveAutoStartConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(AUTO_START_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    // 忽略写入失败
  }
}

function loadAutoStartConfig() {
  try {
    if (fs.existsSync(AUTO_START_CONFIG)) {
      const data = fs.readFileSync(AUTO_START_CONFIG, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    // 忽略读取失败
  }
  return { enabled: false }
}

module.exports = { register, loadAutoStartConfig }

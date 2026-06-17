const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

// 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.ycdesk')
const AUTO_START_CONFIG = path.join(CONFIG_DIR, 'auto-start.json')

// 注册表 Run 键的键名
const REGISTRY_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const REGISTRY_VALUE_NAME = 'YCDesk'

function register(safeHandler, logFn, options = {}) {
  // 获取当前自启动状态
  ipcMain.handle('auto-start:get-status', safeHandler(async () => {
    try {
      const loginItemSettings = app.getLoginItemSettings()
      const isRegistered = loginItemSettings.openAtLogin
      // 同时检查注册表
      const isRegistryEnabled = checkRegistryAutoStart()
      return { success: true, enabled: isRegistered || isRegistryEnabled }
    } catch (e) {
      if (logFn) logFn('error', '获取自启动状态失败', { error: e.message })
      return { success: false, enabled: false, error: e.message }
    }
  }, 'auto-start:get-status'))

  // 设置自启动开关
  ipcMain.handle('auto-start:set', safeHandler(async (event, { enabled }) => {
    try {
      // 检查服务模式是否已启用
      const elevationManager = options.elevationManager
      if (enabled && elevationManager) {
        const serviceStatus = await elevationManager.queryServiceStatus()
        if (serviceStatus.installed && serviceStatus.running) {
          if (logFn) logFn('warn', '服务模式已启用，不允许设置 Login Item 自启动')
          return { success: false, error: '服务模式已启用，自启动由服务管理' }
        }
      }

      if (enabled) {
        // 1. 标准 Electron Login Item 方式
        app.setLoginItemSettings({
          openAtLogin: true,
          args: ['--auto-start']
        })

        // 2. 备用方案：直接写入注册表 Run 键（便携版兼容）
        try {
          const exePath = getRealExePath()
          if (exePath) {
            setRegistryAutoStart(exePath)
            if (logFn) logFn('info', '已写入注册表 Run 键: ' + exePath)
          }
        } catch (e) {
          if (logFn) logFn('warn', '注册表写入失败（非致命）: ' + e.message)
        }
      } else {
        // 禁用时清理两种方式
        app.setLoginItemSettings({ openAtLogin: false, args: [] })
        try {
          removeRegistryAutoStart()
          if (logFn) logFn('info', '已从注册表移除自启动')
        } catch (e) {
          if (logFn) logFn('warn', '注册表清理失败（非致命）: ' + e.message)
        }
      }

      // 保存配置到文件
      saveAutoStartConfig({ enabled })
      if (logFn) logFn('info', enabled ? '已启用开机自启动' : '已禁用开机自启动')
      return { success: true, enabled }
    } catch (e) {
      if (logFn) logFn('error', '设置自启动失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-start:set'))

  // 服务模式启用时禁用 Login Item
  ipcMain.handle('auto-start:disable-for-service', safeHandler(async () => {
    try {
      app.setLoginItemSettings({ openAtLogin: false, args: [] })
      try { removeRegistryAutoStart() } catch (e) {}
      saveAutoStartConfig({ enabled: false, disabledByService: true })
      if (logFn) logFn('info', '服务模式启用，已禁用 Login Item 自启动')
      return { success: true }
    } catch (e) {
      if (logFn) logFn('error', '禁用 Login Item 失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-start:disable-for-service'))

  // 服务模式卸载时恢复 Login Item
  ipcMain.handle('auto-start:restore-after-service', safeHandler(async () => {
    try {
      const config = loadAutoStartConfig()
      if (config && config.disabledByService) {
        app.setLoginItemSettings({ openAtLogin: true, args: ['--auto-start'] })
        try {
          const exePath = getRealExePath()
          if (exePath) setRegistryAutoStart(exePath)
        } catch (e) {}
        saveAutoStartConfig({ enabled: true })
        if (logFn) logFn('info', '服务卸载，已恢复 Login Item 自启动')
      }
      return { success: true }
    } catch (e) {
      if (logFn) logFn('error', '恢复 Login Item 失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-start:restore-after-service'))
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

// 获取真正的 exe 路径（便携版需使用 process.execPath）
function getRealExePath() {
  // 优先使用 process.execPath（用户双击的 .exe 路径）
  if (process.execPath && process.execPath.endsWith('.exe')) {
    return process.execPath
  }
  // 回退到 app.getPath('exe')
  try {
    return app.getPath('exe')
  } catch (e) {
    return null
  }
}

// 写入注册表 Run 键
function setRegistryAutoStart(exePath) {
  const cmd = `reg add "${REGISTRY_RUN_KEY}" /v "${REGISTRY_VALUE_NAME}" /t REG_SZ /d "\\"${exePath}\\" --auto-start" /f`
  execSync(cmd, { encoding: 'utf8', timeout: 10000 })
}

// 从注册表 Run 键移除
function removeRegistryAutoStart() {
  try {
    execSync(`reg delete "${REGISTRY_RUN_KEY}" /v "${REGISTRY_VALUE_NAME}" /f`, { encoding: 'utf8', timeout: 10000 })
  } catch (e) {
    // 键不存在时忽略
  }
}

// 检查注册表 Run 键是否存在
function checkRegistryAutoStart() {
  try {
    const output = execSync(`reg query "${REGISTRY_RUN_KEY}" /v "${REGISTRY_VALUE_NAME}"`, { encoding: 'utf8', timeout: 5000 })
    return output.includes(REGISTRY_VALUE_NAME)
  } catch (e) {
    return false
  }
}

module.exports = { register, loadAutoStartConfig }

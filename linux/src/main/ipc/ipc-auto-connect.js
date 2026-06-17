const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_DIR = path.join(os.homedir(), '.ycdesk')
const AUTO_CONNECT_CONFIG = path.join(CONFIG_DIR, 'auto-connect.json')

function register(safeHandler, logFn) {
  // 保存自动连接配置
  ipcMain.handle('auto-connect:save', safeHandler(async (event, config) => {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
      }
      fs.writeFileSync(AUTO_CONNECT_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
      if (logFn) logFn('info', '自动连接配置已保存', config)
      return { success: true }
    } catch (e) {
      if (logFn) logFn('error', '保存自动连接配置失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-connect:save'))

  // 加载自动连接配置
  ipcMain.handle('auto-connect:load', safeHandler(async () => {
    try {
      if (fs.existsSync(AUTO_CONNECT_CONFIG)) {
        const data = fs.readFileSync(AUTO_CONNECT_CONFIG, 'utf-8')
        const config = JSON.parse(data)
        if (logFn) logFn('info', '已加载自动连接配置', config)
        return { success: true, config }
      }
      return { success: true, config: null }
    } catch (e) {
      if (logFn) logFn('error', '加载自动连接配置失败', { error: e.message })
      return { success: false, config: null, error: e.message }
    }
  }, 'auto-connect:load'))
}

function loadAutoConnectConfig() {
  try {
    if (fs.existsSync(AUTO_CONNECT_CONFIG)) {
      const data = fs.readFileSync(AUTO_CONNECT_CONFIG, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    // 忽略读取失败
  }
  return null
}

module.exports = { register, loadAutoConnectConfig }

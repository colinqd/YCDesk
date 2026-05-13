const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const deviceIdFilePath = path.join(os.homedir(), '.ycdesk_device_id')
let deviceId = null
let logger = null

function generateDeviceId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 9; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id.toUpperCase()
}

function validateDeviceId(id) {
  if (!id || typeof id !== 'string') return { valid: false, message: '设备ID不能为空' }
  const trimmedId = id.trim()
  if (trimmedId.length < 6 || trimmedId.length > 16) return { valid: false, message: '设备ID长度必须在6-16个字符之间' }
  if (!/^[a-zA-Z0-9]+$/.test(trimmedId)) return { valid: false, message: '设备ID只能包含字母和数字' }
  return { valid: true, message: '设备ID格式正确' }
}

function loadDeviceId() {
  try {
    if (fs.existsSync(deviceIdFilePath)) {
      const storedId = fs.readFileSync(deviceIdFilePath, 'utf8').trim()
      const validation = validateDeviceId(storedId)
      if (validation.valid) return storedId.toUpperCase()
    }
  } catch (e) {
    console.error('读取设备ID失败:', e)
  }
  const newId = generateDeviceId()
  saveDeviceId(newId)
  return newId
}

function saveDeviceId(id) {
  const validation = validateDeviceId(id)
  if (!validation.valid) throw new Error(validation.message)
  try {
    fs.writeFileSync(deviceIdFilePath, id.trim().toUpperCase(), 'utf8')
    return true
  } catch (e) {
    console.error('保存设备ID失败:', e)
    throw new Error('保存设备ID失败')
  }
}

function resetDeviceId() {
  const newId = generateDeviceId()
  saveDeviceId(newId)
  return newId
}

function register(did, log, safeHandler, notifySignaling) {
  deviceId = did
  logger = log

  ipcMain.handle('get-device-id', safeHandler(() => deviceId, 'get-device-id'))
  ipcMain.handle('set-device-id', safeHandler((event, id) => {
    saveDeviceId(id)
    deviceId = id.trim().toUpperCase()
    if (notifySignaling) notifySignaling(deviceId)
    if (logger) logger.info('设备ID已更新', { deviceId })
    return { success: true, deviceId }
  }, 'set-device-id'))
  ipcMain.handle('reset-device-id', safeHandler(() => {
    deviceId = resetDeviceId()
    if (notifySignaling) notifySignaling(deviceId)
    if (logger) logger.info('设备ID已重置', { deviceId })
    return { success: true, deviceId }
  }, 'reset-device-id'))
  ipcMain.handle('validate-device-id', safeHandler((event, id) => validateDeviceId(id), 'validate-device-id'))
}

function getDeviceId() { return deviceId }

module.exports = { register, loadDeviceId, generateDeviceId, validateDeviceId, saveDeviceId, resetDeviceId, getDeviceId, deviceIdFilePath }
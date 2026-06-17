class DeviceIdManager {
  constructor(config) {
    this.config = config || window.CONFIG || {}
    this.storageKey = (this.config.storage && this.config.storage.keys && this.config.storage.keys.deviceId) || 'ycdesk_device_id'
    this.deviceIdConfig = this.config.deviceId || {
      minLength: 6,
      maxLength: 16,
      defaultLength: 9,
      allowedChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    }
  }

  generateRandomId() {
    const chars = this.deviceIdConfig.allowedChars
    let id = ''
    const array = new Uint32Array(this.deviceIdConfig.defaultLength)
    // 使用 Web Crypto API（仅在浏览器/Electron 渲染进程中可用）
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      // 回退：如果 crypto 不可用（测试环境），使用 Math.random()
      // 注意：仅用于非安全场景
      for (let i = 0; i < this.deviceIdConfig.defaultLength; i++) {
        array[i] = Math.floor(Math.random() * 4294967296)
      }
    }
    for (let i = 0; i < this.deviceIdConfig.defaultLength; i++) {
      id += chars.charAt(array[i] % chars.length)
    }
    return id.toUpperCase()
  }

  validateDeviceId(id) {
    if (!id || typeof id !== 'string') {
      return { valid: false, message: '设备ID不能为空' }
    }
    const trimmedId = id.trim()
    if (trimmedId.length < this.deviceIdConfig.minLength) {
      return { valid: false, message: `设备ID长度不能少于${this.deviceIdConfig.minLength}个字符` }
    }
    if (trimmedId.length > this.deviceIdConfig.maxLength) {
      return { valid: false, message: `设备ID长度不能超过${this.deviceIdConfig.maxLength}个字符` }
    }
    const allowedChars = new RegExp(`^[${this.deviceIdConfig.allowedChars}]+$`)
    if (!allowedChars.test(trimmedId)) {
      return { valid: false, message: '设备ID只能包含字母和数字' }
    }
    return { valid: true, message: '设备ID格式正确' }
  }

  getDeviceId() {
    try {
      const storedId = localStorage.getItem(this.storageKey)
      if (storedId) {
        const validation = this.validateDeviceId(storedId)
        if (validation.valid) {
          return storedId.toUpperCase()
        }
      }
    } catch (e) {
      console.error('读取设备ID失败:', e)
    }
    const newId = this.generateRandomId()
    this.setDeviceId(newId)
    return newId
  }

  setDeviceId(id) {
    const validation = this.validateDeviceId(id)
    if (!validation.valid) {
      throw new Error(validation.message)
    }
    try {
      localStorage.setItem(this.storageKey, id.trim().toUpperCase())
      return true
    } catch (e) {
      console.error('保存设备ID失败:', e)
      throw new Error('保存设备ID失败')
    }
  }

  resetDeviceId() {
    const newId = this.generateRandomId()
    this.setDeviceId(newId)
    return newId
  }

  clearDeviceId() {
    try {
      localStorage.removeItem(this.storageKey)
      return true
    } catch (e) {
      console.error('清除设备ID失败:', e)
      throw new Error('清除设备ID失败')
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceIdManager
} else {
  window.DeviceIdManager = DeviceIdManager
}

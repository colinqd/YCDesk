const fs = require('fs')
const path = require('path')
const os = require('os')

class DeviceListManager {
  constructor(options = {}) {
    this.logFn = options.log || console.log
    this.dataDir = options.dataDir || path.join(os.homedir(), '.ycdesk')
    this.devicesFile = path.join(this.dataDir, 'devices.json')
    this.serversFile = path.join(this.dataDir, 'servers.json')
    // 文件写入互斥锁（防止并发写入导致数据损坏）
    this._writeLock = Promise.resolve()
    this.ensureDataDir()
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true })
        this.logFn('创建数据目录: ' + this.dataDir)
      }
    } catch (e) {
      this.logFn('创建数据目录失败: ' + e.message)
    }
  }

  loadDevices() {
    try {
      if (!fs.existsSync(this.devicesFile)) {
        return []
      }
      const data = fs.readFileSync(this.devicesFile, 'utf8')
      return JSON.parse(data)
    } catch (e) {
      this.logFn('加载设备列表失败: ' + e.message)
      return []
    }
  }

  saveDevices(devices) {
    return this._withWriteLock(() => {
      try {
        this.ensureDataDir()
        fs.writeFileSync(this.devicesFile, JSON.stringify(devices, null, 2), 'utf8')
        this.logFn('设备列表已保存: ' + devices.length + ' 个设备')
        return true
      } catch (e) {
        this.logFn('保存设备列表失败: ' + e.message)
        return false
      }
    })
  }

  /**
   * 文件写入互斥锁包装器
   * 确保同一时间只有一个写入操作执行，防止并发写入导致数据损坏
   */
  _withWriteLock(fn) {
    const prev = this._writeLock
    let release
    this._writeLock = new Promise(resolve => { release = resolve })
    return prev.then(() => {
      const result = fn()
      release()
      return result
    }).catch(() => {
      release()
      return false
    })
  }

  addDevice(deviceId, alias = '', serverUrl = '') {
    if (!deviceId || typeof deviceId !== 'string') {
      return { success: false, message: '设备ID无效' }
    }

    const trimmedId = deviceId.trim().toUpperCase()
    if (trimmedId.length < 6 || trimmedId.length > 16) {
      return { success: false, message: '设备ID长度必须在6-16个字符之间' }
    }

    const devices = this.loadDevices()
    
    const existingIndex = devices.findIndex(d => d.deviceId === trimmedId)
    if (existingIndex !== -1) {
      devices[existingIndex] = {
        ...devices[existingIndex],
        alias: alias || devices[existingIndex].alias,
        serverUrl: serverUrl || devices[existingIndex].serverUrl,
        lastConnected: Date.now()
      }
    } else {
      devices.push({
        deviceId: trimmedId,
        alias: alias || '',
        serverUrl: serverUrl || '',
        createdAt: Date.now(),
        lastConnected: Date.now()
      })
    }

    this.saveDevices(devices)
    return { 
      success: true, 
      message: existingIndex !== -1 ? '设备已更新' : '设备已添加',
      devices: devices
    }
  }

  removeDevice(deviceId) {
    if (!deviceId) {
      return { success: false, message: '设备ID无效' }
    }

    const trimmedId = deviceId.trim().toUpperCase()
    const devices = this.loadDevices()
    const index = devices.findIndex(d => d.deviceId === trimmedId)

    if (index === -1) {
      return { success: false, message: '设备不存在' }
    }

    devices.splice(index, 1)
    this.saveDevices(devices)
    return { success: true, message: '设备已删除', devices: devices }
  }

  getDevices() {
    return this.loadDevices()
  }

  getDevice(deviceId) {
    if (!deviceId) {
      return null
    }
    const trimmedId = deviceId.trim().toUpperCase()
    const devices = this.loadDevices()
    return devices.find(d => d.deviceId === trimmedId) || null
  }

  updateDeviceAlias(deviceId, alias) {
    if (!deviceId) {
      return { success: false, message: '设备ID无效' }
    }

    const trimmedId = deviceId.trim().toUpperCase()
    const devices = this.loadDevices()
    const index = devices.findIndex(d => d.deviceId === trimmedId)

    if (index === -1) {
      return { success: false, message: '设备不存在' }
    }

    devices[index].alias = alias || ''
    this.saveDevices(devices)
    return { success: true, message: '别名已更新', devices: devices }
  }

  updateLastConnected(deviceId) {
    if (!deviceId) {
      return
    }

    const trimmedId = deviceId.trim().toUpperCase()
    const devices = this.loadDevices()
    const index = devices.findIndex(d => d.deviceId === trimmedId)

    if (index !== -1) {
      devices[index].lastConnected = Date.now()
      this.saveDevices(devices)
    }
  }

  clearDevices() {
    try {
      if (fs.existsSync(this.devicesFile)) {
        fs.unlinkSync(this.devicesFile)
      }
      return { success: true, message: '设备列表已清空' }
    } catch (e) {
      return { success: false, message: '清空失败: ' + e.message }
    }
  }

  // ==================== 信令服务器列表管理 ====================

  loadServers() {
    try {
      if (!fs.existsSync(this.serversFile)) {
        return []
      }
      const data = fs.readFileSync(this.serversFile, 'utf8')
      return JSON.parse(data)
    } catch (e) {
      this.logFn('加载信令服务器列表失败: ' + e.message)
      return []
    }
  }

  saveServers(servers) {
    return this._withWriteLock(() => {
      try {
        this.ensureDataDir()
        fs.writeFileSync(this.serversFile, JSON.stringify(servers, null, 2), 'utf8')
        this.logFn('信令服务器列表已保存: ' + servers.length + ' 个服务器')
        return { success: true, servers: servers }
      } catch (e) {
        this.logFn('保存信令服务器列表失败: ' + e.message)
        return { success: false, message: '保存失败: ' + e.message }
      }
    })
  }

  addServer(name, url) {
    if (!name || !url) {
      return { success: false, message: '服务器名称和地址不能为空' }
    }
    const servers = this.loadServers()
    servers.unshift({ name, url, timestamp: Date.now() })
    return this.saveServers(servers)
  }

  editServer(index, name, url) {
    const servers = this.loadServers()
    if (index < 0 || index >= servers.length) {
      return { success: false, message: '服务器不存在' }
    }
    servers[index] = { name, url, timestamp: Date.now() }
    return this.saveServers(servers)
  }

  deleteServer(index) {
    const servers = this.loadServers()
    if (index < 0 || index >= servers.length) {
      return { success: false, message: '服务器不存在' }
    }
    servers.splice(index, 1)
    return this.saveServers(servers)
  }

  getServers() {
    return this.loadServers()
  }
}

let instance = null

function getDeviceListManager(options) {
  if (!instance) {
    instance = new DeviceListManager(options)
  }
  return instance
}

module.exports = {
  DeviceListManager,
  getDeviceListManager
}

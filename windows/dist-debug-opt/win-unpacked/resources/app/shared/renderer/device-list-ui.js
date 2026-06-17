class DeviceListUI {
  constructor(options = {}) {
    this.containerSelector = options.containerSelector || '#deviceList'
    this.itemTemplate = options.itemTemplate || null
    this.maxVisibleItems = options.maxVisibleItems || 50
    this.batchSize = options.batchSize || 10
    this.rafScheduled = false
    this.pendingUpdates = []
    this.containerEl = null
    this.deviceCache = new Map()
    this.logFn = options.log || console.log
  }

  initialize() {
    this.containerEl = document.querySelector(this.containerSelector)
    if (!this.containerEl) {
      this.logFn('[DeviceListUI] 容器元素未找到: ' + this.containerSelector)
      return false
    }
    return true
  }

  renderDevices(devices) {
    this.pendingUpdates.push({ type: 'full', devices })
    this._scheduleRAF()
  }

  addDevice(device) {
    this.pendingUpdates.push({ type: 'add', device })
    this._scheduleRAF()
  }

  removeDevice(deviceId) {
    this.pendingUpdates.push({ type: 'remove', deviceId })
    this._scheduleRAF()
  }

  updateDevice(deviceId, updates) {
    this.pendingUpdates.push({ type: 'update', deviceId, updates })
    this._scheduleRAF()
  }

  clear() {
    this.pendingUpdates.push({ type: 'clear' })
    this._scheduleRAF()
  }

  _scheduleRAF() {
    if (this.rafScheduled) return
    this.rafScheduled = true
    requestAnimationFrame(() => {
      this._processUpdates()
      this.rafScheduled = false
    })
  }

  _processUpdates() {
    if (!this.containerEl) return
    if (this.pendingUpdates.length === 0) return

    var batch = this.pendingUpdates.splice(0, this.batchSize)
    var fragment = document.createDocumentFragment()

    for (var i = 0; i < batch.length; i++) {
      switch (batch[i].type) {
        case 'full':
          this._fullRender(fragment, batch[i].devices)
          break
        case 'add':
          this._addItem(fragment, batch[i].device)
          break
        case 'remove':
          this._removeItem(batch[i].deviceId)
          break
        case 'update':
          this._updateItem(batch[i].deviceId, batch[i].updates)
          break
        case 'clear':
          this.containerEl.innerHTML = ''
          this.deviceCache.clear()
          break
      }
    }

    if (fragment.childNodes.length > 0) {
      this.containerEl.appendChild(fragment)
    }

    if (this.pendingUpdates.length > 0) {
      requestAnimationFrame(() => {
        this._processUpdates()
      })
    }
  }

  _fullRender(fragment, devices) {
    this.containerEl.innerHTML = ''
    this.deviceCache.clear()

    if (!devices || devices.length === 0) {
      var emptyEl = document.createElement('div')
      emptyEl.className = 'device-list-empty'
      emptyEl.textContent = '暂无设备'
      fragment.appendChild(emptyEl)
      return
    }

    for (var i = 0; i < devices.length; i++) {
      this._appendDeviceItem(fragment, devices[i])
    }
  }

  _addItem(fragment, device) {
    if (this.deviceCache.has(device.deviceId)) return
    this._appendDeviceItem(fragment, device)
  }

  _appendDeviceItem(fragment, device) {
    var item = this._createDeviceElement(device)
    fragment.appendChild(item)
    this.deviceCache.set(device.deviceId, device)
  }

  _removeItem(deviceId) {
    var el = document.querySelector('[data-device-id="' + deviceId + '"]')
    if (el) el.remove()
    this.deviceCache.delete(deviceId)
  }

  _updateItem(deviceId, updates) {
    var cached = this.deviceCache.get(deviceId)
    if (!cached) return
    Object.assign(cached, updates)
    var el = document.querySelector('[data-device-id="' + deviceId + '"]')
    if (!el) return

    if (updates.alias !== undefined) {
      var aliasEl = el.querySelector('.device-alias')
      if (aliasEl) aliasEl.textContent = updates.alias
    }
    if (updates.serverUrl !== undefined) {
      var urlEl = el.querySelector('.device-url')
      if (urlEl) urlEl.textContent = updates.serverUrl
    }
    if (updates.status !== undefined) {
      el.setAttribute('data-status', updates.status)
      var statusEl = el.querySelector('.device-status')
      if (statusEl) {
        statusEl.textContent = updates.status
        statusEl.className = 'device-status status-' + updates.status
      }
    }
  }

  _createDeviceElement(device) {
    var item = document.createElement('div')
    item.className = 'device-item'
    item.setAttribute('data-device-id', device.deviceId)

    var aliasDiv = document.createElement('div')
    aliasDiv.className = 'device-alias'
    aliasDiv.textContent = device.alias || device.deviceId

    var idDiv = document.createElement('div')
    idDiv.className = 'device-id'
    idDiv.textContent = device.deviceId

    item.appendChild(aliasDiv)
    item.appendChild(idDiv)

    if (device.serverUrl) {
      var urlDiv = document.createElement('div')
      urlDiv.className = 'device-url'
      urlDiv.textContent = device.serverUrl
      item.appendChild(urlDiv)
    }

    if (device.status) {
      var statusDiv = document.createElement('div')
      statusDiv.className = 'device-status status-' + device.status
      statusDiv.textContent = device.status
      item.appendChild(statusDiv)
    }

    return item
  }

  getDeviceCount() {
    return this.deviceCache.size
  }

  destroy() {
    this.pendingUpdates = []
    this.deviceCache.clear()
    this.containerEl = null
    this.rafScheduled = false
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceListUI
}
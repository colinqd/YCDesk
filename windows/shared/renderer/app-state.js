class AppState {
  constructor() {
    this._state = {
      uiManager: null,
      historyManager: null,
      connectionManager: null,
      directManager: null,
      signalingManager: null,
      currentRole: null,
      currentMode: null,
      targetDeviceId: null,
      previousPage: null,
      currentSettingsPage: null,
      connectionStatus: 'disconnected',
      myDeviceId: null,
      currentControlledMode: null
    }
    this._listeners = new Map()
  }

  get(key) {
    return this._state[key]
  }

  set(key, value) {
    const old = this._state[key]
    if (old === value) return
    this._state[key] = value
    this._emit(key, value, old)
  }

  getAll() {
    return { ...this._state }
  }

  on(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set())
    }
    this._listeners.get(key).add(callback)
    return () => this.off(key, callback)
  }

  off(key, callback) {
    const listeners = this._listeners.get(key)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  _emit(key, newVal, oldVal) {
    const listeners = this._listeners.get(key)
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(newVal, oldVal) } catch (e) { /* 静默处理 */ }
      })
    }
  }

  reset() {
    for (const key of Object.keys(this._state)) {
      this.set(key, null)
    }
    this.set('connectionStatus', 'disconnected')
    this.set('currentRole', null)
    this.set('currentMode', null)
  }
}

const appState = new AppState()

if (typeof window !== 'undefined') {
  window.AppState = appState
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = appState
}
const VALIDATORS = {
  deviceId: (id) => typeof id === 'string' && /^[a-f0-9]{8,64}$/i.test(id),
  password: (pwd) => typeof pwd === 'string' && pwd.length >= 4 && pwd.length <= 128,
  port: (port) => Number.isInteger(port) && port > 0 && port <= 65535,
  host: (host) => typeof host === 'string' && host.length > 0 && host.length <= 255 && /^[a-zA-Z0-9.\-_]+$/.test(host),
  url: (url) => {
    try { new URL(url); return true }
    catch { return false }
  },
  alias: (alias) => typeof alias === 'string' && alias.length <= 128,
  displayName: (name) => typeof name === 'string' && name.length <= 256,
  positiveInt: (n) => Number.isInteger(n) && n >= 0,
  nonEmptyString: (s) => typeof s === 'string' && s.length > 0,
  coordinates: (x, y) => typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= 1 && y >= 0 && y <= 1,
  mode: (mode) => ['controller', 'controlled'].includes(mode)
}

const IPC_SCHEMAS = {
  'get-device-id': { input: {}, output: { type: 'string' } },
  'set-device-id': { input: { deviceId: VALIDATORS.deviceId }, output: { success: true } },
  'reset-device-id': { input: {}, output: { success: true } },
  'get-sources': { input: {}, output: { type: 'array' } },
  'get-screen-size': { input: {}, output: { width: 0, height: 0 } },
  'window-minimize': { input: {}, output: { success: true } },
  'window-maximize': { input: {}, output: { success: true } },
  'window-close': { input: {}, output: { success: true } },
  'get-device-list': { input: {}, output: { type: 'array' } },
  'add-device': { input: { deviceId: VALIDATORS.deviceId, alias: VALIDATORS.alias }, output: { success: true } },
  'remove-device': { input: { deviceId: VALIDATORS.deviceId }, output: { success: true } },
  'set-password': { input: { password: VALIDATORS.password }, output: { success: true } },
  'get-password': { input: {}, output: { type: 'string' } },
  'clear-password': { input: {}, output: { success: true } },
  'unlock-remote': { input: { password: VALIDATORS.password }, output: { success: true } },
  'direct-connect': { input: { host: VALIDATORS.host, port: VALIDATORS.port }, output: { success: true } },
  'signaling-connect': { input: { serverUrl: VALIDATORS.url, targetDeviceId: VALIDATORS.deviceId }, output: { success: true } },
  'remote-input': { input: { type: VALIDATORS.nonEmptyString }, output: {} }
}

function validateIPC(channel, data) {
  const schema = IPC_SCHEMAS[channel]
  if (!schema) {
    return { valid: true, warnings: ['未定义的IPC通道: ' + channel] }
  }

  const errors = []

  for (const [key, validator] of Object.entries(schema.input)) {
    const value = data?.[key]
    if (typeof validator === 'function') {
      if (!validator(value)) {
        errors.push(`参数 ${key} 验证失败: ${JSON.stringify(value)}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  }
}

function sanitize(data) {
  if (typeof data !== 'object' || data === null) return data
  const result = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      result[key] = value.replace(/[<>]/g, '').slice(0, 1024)
    } else {
      result[key] = value
    }
  }
  return result
}

module.exports = {
  validateIPC,
  sanitize,
  IPC_SCHEMAS,
  VALIDATORS
}
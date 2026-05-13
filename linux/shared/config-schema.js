const CONFIG_SCHEMA = {
  signalingServer: {
    type: 'string',
    required: false,
    default: 'http://localhost:3000',
    validate: (v) => { try { new URL(v); return true } catch { return false } }
  },
  stunServers: {
    type: 'array',
    required: false,
    default: [{ urls: 'stun:stun.l.google.com:19302' }],
    validate: (v) => Array.isArray(v) && v.every(s => s.urls && typeof s.urls === 'string')
  },
  turnServers: {
    type: 'array',
    required: false,
    default: [],
    validate: (v) => Array.isArray(v) && v.every(s => s.urls && typeof s.urls === 'string')
  },
  connectionTimeout: {
    type: 'number', min: 5000, max: 120000, required: false, default: 30000
  },
  maxRetries: {
    type: 'number', min: 1, max: 10, required: false, default: 3
  },
  heartbeatInterval: {
    type: 'number', min: 1000, max: 60000, required: false, default: 5000
  },
  reconnectDelay: {
    type: 'number', min: 1000, max: 30000, required: false, default: 3000
  },
  logLevel: {
    type: 'string', enum: ['debug', 'info', 'warn', 'error'], required: false, default: 'info'
  },
  jpegQuality: {
    type: 'number', min: 0.1, max: 1.0, required: false, default: 0.7
  },
  frameRate: {
    type: 'number', min: 5, max: 60, required: false, default: 30
  },
  keyFrameInterval: {
    type: 'number', min: 30, max: 600, required: false, default: 120
  },
  maxMessageSize: {
    type: 'number', min: 1024, max: 1048576, required: false, default: 65536
  },
  enableDebugUI: {
    type: 'boolean', required: false, default: false
  }
}

function validateConfig(config) {
  const errors = []
  const warnings = []
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    const value = config[key]
    if (value === undefined) {
      if (schema.required) errors.push(`缺少必需配置: ${key}`)
      continue
    }
    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (schema.type && actualType !== schema.type) {
      errors.push(`配置 ${key} 类型错误: 期望 ${schema.type}, 实际 ${actualType}`)
      continue
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`配置 ${key} 值无效: ${value}, 允许值: ${schema.enum.join(', ')}`)
    }
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`配置 ${key} 值 ${value} 小于最小值 ${schema.min}`)
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`配置 ${key} 值 ${value} 大于最大值 ${schema.max}`)
    }
    if (schema.validate && !schema.validate(value)) {
      errors.push(`配置 ${key} 自定义验证失败`)
    }
  }
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

function applyDefaults(config) {
  const result = { ...config }
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    if (result[key] === undefined && schema.default !== undefined) {
      result[key] = schema.default
    }
  }
  return result
}

module.exports = { CONFIG_SCHEMA, validateConfig, applyDefaults }
const isDevelopment = (() => {
  try {
    return typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';
  } catch (e) {
    return false;
  }
})();

const CONFIG = {
  defaultSignalingServer: 'ws://localhost:3000',
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302'
  ],
  turnServers: [
    // 部署 coturn 后替换为实际地址（对称NAT穿透必需）
    // { urls: 'turn:your-turn-server.com:3478', username: 'ycdesk', credential: 'your-password' }
  ],
  defaultPort: 8080,
  heartbeatInterval: 3000,
  maxReconnectAttempts: 10,
  baseReconnectDelay: 500,
  reconnectDelay: 500,
  maxHistoryItems: 10,
  dataChannelMaxRetries: 3,
  dataChannelRetryInterval: 1000,
  dataChannelMaxQueueSize: 100,
  logging: {
    main: {
      logLevel: isDevelopment ? 'debug' : 'info',
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 10
    },
    renderer: {
      logLevel: 'info',
      maxUiLogs: 100,
      uiLogEnabled: true,
      consoleEnabled: true
    }
  },
  stats: {
    maxLatencySamples: 100,
    updateInterval: 1000
  },
  screenCapture: {
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 30,
    minFrameRate: 15
  },
  storage: {
    keys: {
      directHistory: 'ycdesk_direct_history',
      signalingHistory: 'ycdesk_signaling_history',
      signalingServers: 'ycdesk_signaling_servers',
      deviceId: 'ycdesk_device_id'
    }
  },
  deviceId: {
    minLength: 6,
    maxLength: 16,
    defaultLength: 9,
    allowedChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  },
  webrtc: {
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceCandidatePoolSize: 2,
    offerToReceiveAudio: false,
    offerToReceiveVideo: true,
    videoBitrateMax: 2500,
    videoBitrateMin: 300,
    audioBitrateMax: 128
  },
  input: {
    throttleMs: 8,
    queueMaxSize: 100,
    defaultMaxCoordinate: 65535,
    defaultScreenWidth: 1920,
    defaultScreenHeight: 1080
  },
  mouseButtons: {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2
  }
}

function getIceConfig(customConfig = {}) {
  const iceServers = []

  CONFIG.stunServers.forEach(url => {
    iceServers.push({ urls: url })
  })

  CONFIG.turnServers.forEach(turn => {
    const server = {
      urls: turn.urls || turn.url
    }
    if (turn.username) {
      server.username = turn.username
    }
    if (turn.credential) {
      server.credential = turn.credential
    }
    if (turn.credentialType) {
      server.credentialType = turn.credentialType
    }
    iceServers.push(server)
  })

  if (customConfig.stunServers) {
    customConfig.stunServers.forEach(url => {
      iceServers.push({ urls: url })
    })
  }

  if (customConfig.turnServers) {
    customConfig.turnServers.forEach(turn => {
      iceServers.push(turn)
    })
  }

  return {
    iceServers,
    iceTransportPolicy: customConfig.iceTransportPolicy || CONFIG.webrtc.iceTransportPolicy,
    bundlePolicy: customConfig.bundlePolicy || CONFIG.webrtc.bundlePolicy,
    rtcpMuxPolicy: customConfig.rtcpMuxPolicy || CONFIG.webrtc.rtcpMuxPolicy,
    sdpSemantics: customConfig.sdpSemantics || CONFIG.webrtc.sdpSemantics,
    iceCandidatePoolSize: customConfig.iceCandidatePoolSize || CONFIG.webrtc.iceCandidatePoolSize
  }
}

function getVideoConstraints(customConstraints = {}) {
  return {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: customConstraints.sourceId,
        maxWidth: customConstraints.maxWidth || CONFIG.screenCapture.maxWidth,
        maxHeight: customConstraints.maxHeight || CONFIG.screenCapture.maxHeight,
        maxFrameRate: customConstraints.maxFrameRate || CONFIG.screenCapture.maxFrameRate,
        minFrameRate: customConstraints.minFrameRate || CONFIG.screenCapture.minFrameRate
      }
    }
  }
}

function normalizeServerUrl(url, preferSecure = null) {
  if (!url) {
    return url
  }
  
  let normalized = url.trim()
  
  // 清理常见的输入错误（如 www.hnasvr:.asia:31300 → www.hnasvr.asia:31300）
  normalized = normalized
    .replace(/:\./g, '.') // 替换冒号点（如 www.hnasvr:.asia → www.hnasvr.asia）
    .replace(/\.{2,}/g, '.') // 替换多个点
    .replace(/:\s*/g, ':') // 清理冒号周围空格
  
  normalized = normalized.replace(/^wws:\/\//i, 'wss://')
  normalized = normalized.replace(/^wss:\/\//i, 'wss://')
  normalized = normalized.replace(/^ws:\/\//i, 'ws://')
  
  if (normalized.match(/^wss?:\/\//i)) {
    return normalized
  }
  
  normalized = normalized.replace(/^https:\/\//i, 'wss://')
  normalized = normalized.replace(/^http:\/\//i, 'ws://')
  
  if (normalized.match(/^wss?:\/\//i)) {
    return normalized
  }
  
  // 检测是否有非标准端口（非443/80）
  const hasCustomPort = normalized.match(/:\d+$/) && !normalized.match(/:(443|80)$/)
  
  if (preferSecure === true) {
    normalized = 'wss://' + normalized
  } else if (preferSecure === false) {
    normalized = 'ws://' + normalized
  } else {
    const isDomain = /^[a-zA-Z]/.test(normalized) && !/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(normalized) && normalized !== 'localhost'
    // 如果是域名且有自定义端口，默认用 ws://（Android-Server 通常没有 SSL）
    normalized = (isDomain && !hasCustomPort ? 'wss://' : 'ws://') + normalized
  }
  
  return normalized
}

CONFIG.getIceConfig = getIceConfig
CONFIG.getVideoConstraints = getVideoConstraints
CONFIG.normalizeServerUrl = normalizeServerUrl

// ─── 原子写入 & 备份恢复（仅 Node.js 环境） ──────────────────────────────

let _fs = null
let _path = null
try {
  _fs = require('fs')
  _path = require('path')
} catch (e) {
  // 浏览器环境，忽略
}

/**
 * 原子写入配置到文件
 * 写入临时文件 → fsync → 原子重命名，防止写入中断导致文件损坏
 *
 * @param {string} configPath - 配置文件路径
 * @param {Object} data - 配置数据
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function atomicWriteConfig(configPath, data) {
  if (!_fs || !_path) {
    return { success: false, error: '仅 Node.js 环境支持' }
  }
  const tmpPath = configPath + '.tmp.' + Date.now()
  try {
    const json = JSON.stringify(data, null, 2)
    await _fs.promises.writeFile(tmpPath, json, 'utf8')

    // fsync 确保数据落盘
    const fd = await _fs.promises.open(tmpPath, 'r')
    await fd.sync()
    await fd.close()

    await _fs.promises.rename(tmpPath, configPath)
    return { success: true }
  } catch (error) {
    // 清理临时文件
    try { await _fs.promises.unlink(tmpPath) } catch (e) { /* 忽略 */ }
    return { success: false, error: error.message }
  }
}

/**
 * 备份配置文件
 *
 * @param {string} configPath - 配置文件路径
 * @returns {Promise<{success: boolean, backupPath?: string, error?: string}>}
 */
async function backupConfig(configPath) {
  if (!_fs || !_path) {
    return { success: false, error: '仅 Node.js 环境支持' }
  }
  const backupPath = configPath + '.bak'
  try {
    await _fs.promises.access(configPath)
    await _fs.promises.copyFile(configPath, backupPath)
    return { success: true, backupPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 从备份恢复配置文件
 *
 * @param {string} configPath - 配置文件路径
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function restoreConfig(configPath) {
  if (!_fs || !_path) {
    return { success: false, error: '仅 Node.js 环境支持' }
  }
  const backupPath = configPath + '.bak'
  try {
    await _fs.promises.access(backupPath)
    await _fs.promises.copyFile(backupPath, configPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

CONFIG.atomicWriteConfig = atomicWriteConfig
CONFIG.backupConfig = backupConfig
CONFIG.restoreConfig = restoreConfig

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG
} else {
  window.CONFIG = CONFIG
  window.getIceConfig = getIceConfig
  window.getVideoConstraints = getVideoConstraints
  window.normalizeServerUrl = normalizeServerUrl
}

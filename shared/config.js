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
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302'
  ],
  turnServers: [],
  defaultPort: 8080,
  heartbeatInterval: 5000,
  maxReconnectAttempts: 10,
  baseReconnectDelay: 1000,
  reconnectDelay: 1000,
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
      signalingHistory: 'ycdesk_signaling_history'
    }
  },
  webrtc: {
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceCandidatePoolSize: 0,
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
  
  // 修复常见拼写错误
  normalized = normalized.replace(/^wws:\/\//i, 'wss://')
  
  // Socket.IO 应该使用 WebSocket 协议，自动转换
  // https:// -> wss://
  // http:// -> ws://
  normalized = normalized.replace(/^https:\/\//i, 'wss://')
  normalized = normalized.replace(/^http:\/\//i, 'ws://')
  
  // 确保 ws:// 和 wss:// 格式正确
  normalized = normalized.replace(/^ws:\/\//i, 'ws://')
  normalized = normalized.replace(/^wss:\/\//i, 'wss://')
  
  // 如果用户已经指定了协议，则保留用户的选择
  if (normalized.match(/^(wss|ws):\/\//i)) {
    return normalized
  }
  
  // 如果没有协议前缀，根据 preferSecure 参数决定默认协议
  if (preferSecure === true) {
    normalized = 'wss://' + normalized
  } else if (preferSecure === false) {
    normalized = 'ws://' + normalized
  } else {
    // 默认使用 ws://（和修改前一致）
    normalized = 'ws://' + normalized
  }
  
  return normalized
}

CONFIG.getIceConfig = getIceConfig
CONFIG.getVideoConstraints = getVideoConstraints
CONFIG.normalizeServerUrl = normalizeServerUrl

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG
} else {
  window.CONFIG = CONFIG
  window.getIceConfig = getIceConfig
  window.getVideoConstraints = getVideoConstraints
  window.normalizeServerUrl = normalizeServerUrl
}

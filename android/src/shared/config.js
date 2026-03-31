const isDevelopment = (() => {
  try {
    return typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';
  } catch (e) {
    return false;
  }
})();

const CONFIG = {
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

CONFIG.getIceConfig = getIceConfig
CONFIG.getVideoConstraints = getVideoConstraints

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG
} else {
  window.CONFIG = CONFIG
  window.getIceConfig = getIceConfig
  window.getVideoConstraints = getVideoConstraints
}

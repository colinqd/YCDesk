const CONFIG = {
  storage: {
    keys: {
      direct: 'ycdesk_direct_history',
      signaling: 'ycdesk_signaling_history'
    }
  },
  maxHistoryItems: 20,
  maxReconnectAttempts: 10,
  baseReconnectDelay: 1000,
  heartbeatInterval: 30000,
  reconnectDelay: 1000,
  screenCapture: {
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 30,
    minFrameRate: 15
  },
  getIceConfig: () => {
    return {
      iceServers: []
    }
  }
};

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

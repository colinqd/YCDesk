const s = {
  matrixTransformer: null,
  inputDispatcher: null,
  gestureHandler: null,

  myDeviceId: '',
  socket: null,
  connectionMode: 'socketio',
  peerConnection: null,
  currentSessionId: null,
  incomingFromDeviceId: null,
  isController: false,
  controlledMode: 'direct',
  controllerMode: 'direct',

  currentDirectClientId: null,
  directPeerConnection: null,
  dataChannel: null,
  inputChannel: null,
  inputChannelReady: false,
  fileTransferChannel: null,
  connectionLogDiv: null,
  currentRole: null,
  isConnected: false,
  pendingIceCandidates: [],
  pendingDirectIceCandidates: [],
  isWaitingRenegotiation: false,
  isDirectControllerMode: false,
  isAndroidControlled: false,

  CONNECTION_STATUS: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
  },
  connectionStatus: 'disconnected',
  reconnectAttempts: 0,
  reconnectTimeout: null,
  MAX_RECONNECT_ATTEMPTS: 10,
  BASE_RECONNECT_DELAY: 1000,

  savedServerUrl: null,
  savedRole: null,

  STORAGE_KEYS: {
    DIRECT_HISTORY: 'ycdesk_direct_history',
    SIGNALING_HISTORY: 'ycdesk_signaling_history',
    SIGNALING_SERVERS: 'ycdesk_signaling_servers'
  },
  MAX_HISTORY_ITEMS: 10,

  currentScale: 1,
  lastTouchDistance: 0,
  panX: 0,
  panY: 0,
  lastPanX: 0,
  lastPanY: 0,
  isPanning: false,
  isFullscreen: false,
  isFloatMode: false,
  controlsHidden: false,
  isPointerMode: false,

  heartbeatInterval: null,
  wsHeartbeatInterval: null,
  statsInterval: null,

  keyboardVisible: false,
  usingSystemKeyboard: false,
  currentKeyboardPosition: 'bottom',
  currentKeyboardSize: 'medium',
  currentKeyboardOpacity: '100',
  keyboardPositions: ['bottom'],
  keyboardSizes: ['small', 'medium', 'large'],
  keyboardOpacities: ['100', '80', '60', '40'],
  isDraggingKeyboard: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartLeft: 0,
  dragStartTop: 0,
  activeModifiers: {
    Control: false,
    Shift: false,
    Alt: false,
    Meta: false,
    CapsLock: false
  }
}

export default s

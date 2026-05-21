/**
 * YCDesk - WebRTC mocks for integration tests
 *
 * Provides mock RTCDataChannel, RTCPeerConnection, and a utility
 * to create a pair of connected mock channels that can exchange messages.
 */

const { EventEmitter } = require('events')
const { createSpyFn } = require('./spy-fn.js')

/**
 * Create a mock RTCDataChannel with the event-property pattern used by
 * YCDesk's DataChannelManager (channel.on* assignment, not addEventListener).
 *
 * @param {Object} [options]
 * @param {string} [options.label=''] - Channel label (e.g. 'control', 'input').
 * @param {boolean} [options.ordered=true]
 * @param {'open'|'connecting'|'closing'|'closed'} [options.readyState='open']
 * @returns {Object} Mock data channel.
 */
function createMockDataChannel(options = {}) {
  const {
    label = '',
    ordered = true,
    readyState = 'open',
  } = options

  const listeners = {}
  let _readyState = readyState
  let _bufferedAmount = 0

  const channel = {
    label,
    ordered,
    id: Math.floor(Math.random() * 10000),

    get readyState() {
      return _readyState
    },
    set readyState(v) {
      _readyState = v
    },

    get bufferedAmount() {
      return _bufferedAmount
    },
    set bufferedAmount(v) {
      _bufferedAmount = v
    },

    // --- event-property pattern (used by DataChannelManager) ---
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    onbufferedamountlow: null,

    // --- addEventListener (for compatibility) ---
    addEventListener(type, cb) {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(cb)
    },
    removeEventListener(type, cb) {
      if (!listeners[type]) return
      listeners[type] = listeners[type].filter((l) => l !== cb)
    },

    /**
     * Simulate receiving a message. Triggers both property and listener paths.
     * @param {*} data
     */
    _receiveMessage(data) {
      const event = { data, type: 'message', target: channel }
      if (typeof channel.onmessage === 'function') {
        channel.onmessage(event)
      }
      if (listeners['message']) {
        listeners['message'].forEach((cb) => cb(event))
      }
    },

    /**
     * Simulate opening the channel.
     */
    _simulateOpen() {
      _readyState = 'open'
      if (typeof channel.onopen === 'function') {
        channel.onopen({ target: channel })
      }
      if (listeners['open']) {
        listeners['open'].forEach((cb) => cb({ target: channel }))
      }
    },

    /**
     * Simulate closing the channel.
     */
    _simulateClose() {
      _readyState = 'closed'
      if (typeof channel.onclose === 'function') {
        channel.onclose({ target: channel })
      }
      if (listeners['close']) {
        listeners['close'].forEach((cb) => cb({ target: channel }))
      }
    },

    /**
     * Simulate an error.
     */
    _simulateError(error) {
      const event = { error, target: channel }
      if (typeof channel.onerror === 'function') {
        channel.onerror(event)
      }
      if (listeners['error']) {
        listeners['error'].forEach((cb) => cb(event))
      }
    },

    /**
     * Simulate buffered amount becoming low.
     */
    _simulateBufferedLow() {
      _bufferedAmount = 0
      if (typeof channel.onbufferedamountlow === 'function') {
        channel.onbufferedamountlow({ target: channel })
      }
      if (listeners['bufferedamountlow']) {
        listeners['bufferedamountlow'].forEach((cb) => cb({ target: channel }))
      }
    },

    // --- public API ---
    send: createSpyFn(function send(data) {
      if (_readyState !== 'open') {
        throw new Error('DataChannel send: channel not open')
      }
      // Track sent data for assertions
      channel._sentData = channel._sentData || []
      channel._sentData.push(data)
    }),

    close: createSpyFn(function close() {
      _readyState = 'closed'
    }),
  }

  return channel
}

/**
 * Create a pair of connected mock data channels that can exchange messages.
 * Messages sent on channel A are received on channel B and vice versa.
 *
 * @param {Object} [options]
 * @param {string} [options.labelA='control'] - Label for channel A.
 * @param {string} [options.labelB='input'] - Label for channel B.
 * @returns {{ channelA: Object, channelB: Object }}
 */
function createConnectedChannelPair(options = {}) {
  const { labelA = 'control', labelB = 'input' } = options

  const channelA = createMockDataChannel({ label: labelA, readyState: 'open' })
  const channelB = createMockDataChannel({ label: labelB, readyState: 'open' })

  // Wire sends to the other channel's receive
  const originalSendA = channelA.send
  channelA.send = createSpyFn(function send(data) {
    channelA._sentData = channelA._sentData || []
    channelA._sentData.push(data)
    // Deliver to B asynchronously
    setImmediate(() => channelB._receiveMessage(data))
  })

  const originalSendB = channelB.send
  channelB.send = createSpyFn(function send(data) {
    channelB._sentData = channelB._sentData || []
    channelB._sentData.push(data)
    setImmediate(() => channelA._receiveMessage(data))
  })

  return { channelA, channelB }
}

/**
 * Create a mock RTCPeerConnection for testing connection-manager flows.
 *
 * @param {Object} [options]
 * @param {boolean} [options.simulateIceComplete=false] - Auto-fire 'ice-complete' after setLocal.
 * @returns {Object} Mock RTCPeerConnection
 */
function createMockPeerConnection(options = {}) {
  const { simulateIceComplete = false } = options
  const emitter = new EventEmitter()

  const pc = {
    localDescription: null,
    remoteDescription: null,
    iceConnectionState: 'new',
    connectionState: 'new',
    signalingState: 'stable',

    // Event handlers (property pattern)
    onicecandidate: null,
    oniceconnectionstatechange: null,
    onconnectionstatechange: null,
    ondatachannel: null,
    ontrack: null,
    onnegotiationneeded: null,
    onsignalingstatechange: null,

    // Track created data channels
    _dataChannels: [],

    createDataChannel: createSpyFn(function createDataChannel(label, config) {
      const ch = createMockDataChannel({
        label,
        ordered: config?.ordered !== false,
        readyState: 'connecting',
      })
      pc._dataChannels.push(ch)
      // Auto-open after a microtask
      setImmediate(() => ch._simulateOpen())
      return ch
    }),

    createOffer: createSpyFn(async function createOffer() {
      return { type: 'offer', sdp: 'mock-sdp-offer' }
    }),

    createAnswer: createSpyFn(async function createAnswer() {
      return { type: 'answer', sdp: 'mock-sdp-answer' }
    }),

    setLocalDescription: createSpyFn(async function setLocalDescription(desc) {
      pc.localDescription = desc
      if (simulateIceComplete) {
        setImmediate(() => {
          if (typeof pc.onicecandidate === 'function') {
            pc.onicecandidate({ candidate: null }) // null signals end of candidates
          }
        })
      }
    }),

    setRemoteDescription: createSpyFn(async function setRemoteDescription(desc) {
      pc.remoteDescription = desc
    }),

    addIceCandidate: createSpyFn(async function addIceCandidate(candidate) {
      // no-op mock
    }),

    addTransceiver: createSpyFn(function addTransceiver(kind, config) {
      return { kind, mid: '0', sender: {}, receiver: {} }
    }),

    close: createSpyFn(function close() {
      pc.iceConnectionState = 'closed'
      pc.connectionState = 'closed'
      emitter.emit('closed')
    }),

    // --- simulation helpers ---
    _simulateIceCandidate(candidate) {
      if (typeof pc.onicecandidate === 'function') {
        pc.onicecandidate({ candidate })
      }
    },

    _simulateIceConnectionStateChange(state) {
      pc.iceConnectionState = state
      if (typeof pc.oniceconnectionstatechange === 'function') {
        pc.oniceconnectionstatechange({ target: pc })
      }
    },

    _simulateConnectionStateChange(state) {
      pc.connectionState = state
      if (typeof pc.onconnectionstatechange === 'function') {
        pc.onconnectionstatechange({ target: pc })
      }
    },

    _simulateDataChannel(channel) {
      if (typeof pc.ondatachannel === 'function') {
        pc.ondatachannel({ channel })
      }
    },

    _simulateTrack(stream) {
      if (typeof pc.ontrack === 'function') {
        pc.ontrack({ streams: [stream], track: { kind: 'video' } })
      }
    },
  }

  return pc
}

/**
 * Create a mock MediaStream and MediaStream mock for video testing.
 */
function createMockMediaStream() {
  const track = {
    kind: 'video',
    enabled: true,
    readyState: 'live',
    stop: createSpyFn(),
    addEventListener: createSpyFn(),
    removeEventListener: createSpyFn(),
  }

  return {
    id: `stream-${Math.random().toString(36).slice(2)}`,
    active: true,
    getTracks: createSpyFn(() => [track]),
    getVideoTracks: createSpyFn(() => [track]),
    addTrack: createSpyFn(),
    removeTrack: createSpyFn(),
    clone: createSpyFn(),
  }
}

/**
 * Create a mock HTMLVideoElement for video pipeline testing.
 */
function createMockVideoElement() {
  const video = {
    readyState: 0, // HAVE_NOTHING
    videoWidth: 0,
    videoHeight: 0,
    srcObject: null,
    onloadedmetadata: null,
    onloadeddata: null,
    onerror: null,
    onended: null,
    onmute: null,
    onunmute: null,

    play: createSpyFn(async () => {}),
    pause: createSpyFn(),
    addEventListener: createSpyFn(),
    removeEventListener: createSpyFn(),

    _simulateMetadataLoaded(width, height) {
      video.videoWidth = width
      video.videoHeight = height
      video.readyState = 2 // HAVE_CURRENT_DATA
      if (typeof video.onloadedmetadata === 'function') {
        video.onloadedmetadata()
      }
    },

    _simulateDataLoaded() {
      video.readyState = 4 // HAVE_ENOUGH_DATA
      if (typeof video.onloadeddata === 'function') {
        video.onloadeddata()
      }
    },
  }
  return video
}

module.exports = {
  createMockDataChannel,
  createConnectedChannelPair,
  createMockPeerConnection,
  createMockMediaStream,
  createMockVideoElement,
}

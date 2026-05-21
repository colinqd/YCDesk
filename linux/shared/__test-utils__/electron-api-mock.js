/**
 * YCDesk - Mock for Electron IPC API (window.electronAPI)
 *
 * YCDesk renderer process uses window.electronAPI for IPC with the main process.
 * This mock provides a configurable fake for integration tests.
 */

const { createSpyFn } = require('./spy-fn.js')

/**
 * Create a mock for window.electronAPI.
 * Supports the common IPC calls used in YCDesk:
 *   - send(channel, ...args)
 *   - on(channel, callback) / off(channel, callback)
 *   - invoke(channel, ...args) -> Promise
 *
 * @param {Object} [options]
 * @param {boolean} [options.autoReply=false] - Auto-reply to invoke calls with a default response.
 * @returns {Object} Mock electronAPI
 */
function createElectronAPIMock(options = {}) {
  const { autoReply = false } = options
  const listeners = {}

  const api = {
    // Track calls for assertions
    _sentMessages: [],
    _invokeCalls: [],

    /**
     * Send a message to the main process (fire-and-forget).
     */
    send: createSpyFn((channel, ...args) => {
      api._sentMessages.push({ channel, args })
      // Notify any listeners on this channel (simulating main->renderer)
      if (listeners[channel]) {
        listeners[channel].forEach((cb) => cb(null, ...args))
      }
    }),

    /**
     * Listen for messages from the main process.
     */
    on: createSpyFn((channel, callback) => {
      if (!listeners[channel]) listeners[channel] = []
      listeners[channel].push(callback)
      // Return cleanup function
      return () => {
        api.off(channel, callback)
      }
    }),

    /**
     * Remove a listener.
     */
    off: createSpyFn((channel, callback) => {
      if (!listeners[channel]) return
      listeners[channel] = listeners[channel].filter((cb) => cb !== callback)
    }),

    /**
     * Invoke a method in the main process (request-response).
     */
    invoke: createSpyFn(async (channel, ...args) => {
      api._invokeCalls.push({ channel, args })
      if (autoReply) {
        return { success: true }
      }
      // Default: return undefined — tests should mock specific invoke responses
      return undefined
    }),

    /**
     * Simulate receiving a message from the main process.
     * Tests can call this to trigger handlers.
     */
    _simulateMessage(channel, ...args) {
      if (listeners[channel]) {
        listeners[channel].forEach((cb) => cb(null, ...args))
      }
    },

    /**
     * Set a custom invoke handler for specific channels.
     */
    _setInvokeHandler(channel, handler) {
      api.invoke = createSpyFn(async (ch, ...args) => {
        if (ch === channel) return handler(...args)
        return { success: true }
      })
    },

    /**
     * Clear all listeners and call history.
     */
    _reset() {
      Object.keys(listeners).forEach((k) => delete listeners[k])
      api._sentMessages = []
      api._invokeCalls = []
    },
  }

  return api
}

module.exports = { createElectronAPIMock }

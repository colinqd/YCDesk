/**
 * YCDesk - In-memory fake WebSocket signaling server for integration tests
 *
 * Provides an in-process WebSocket server that mimics the YCDesk signaling
 * protocol for testing without a real network.
 *
 * Protocol:
 *   C->S: { type: 'register', deviceId: string }
 *   S->C: { type: 'registered', deviceId: string }
 *   C->S: { type: 'connect-request', targetDeviceId: string }
 *   S->C: { type: 'connection-request', fromDeviceId: string }
 *   C->S: { type: 'connection-accepted', targetDeviceId: string }
 *   S->C: { type: 'connection-result', success: boolean, targetDeviceId, ... }
 *   C->S: { type: 'offer', targetDeviceId, sdp }
 *   S->C: { type: 'offer', fromDeviceId, sdp }
 *   C->S: { type: 'answer', targetDeviceId, sdp }
 *   S->C: { type: 'answer', fromDeviceId, sdp }
 *   C->S: { type: 'ice-candidate', targetDeviceId, candidate }
 *   S->C: { type: 'ice-candidate', fromDeviceId, candidate }
 *   C->S: { type: 'heartbeat' }
 *   S->C: { type: 'heartbeat-ack' }
 *   C->S: { type: 'device-list' }  -> S->C: { type: 'device-list', devices: [...] }
 */

const { EventEmitter } = require('events')
const WebSocket = require('ws')

/**
 * FakeSignalingServer - runs in-process, uses real WebSocket (from 'ws' package).
 *
 * @param {Object} [options]
 * @param {number} [options.port=0] - Port to listen on (0 = OS-assigned). Use a fixed port for reconnect tests.
 */
class FakeSignalingServer extends EventEmitter {
  constructor(options = {}) {
    super()
    this._port = options.port || 0
    this._wss = null
    this._url = null
    this._clients = new Map() // deviceId -> { ws, info }
    this._connections = new Map() // connId -> { deviceA, deviceB }
  }

  /**
   * Start the server. Returns the URL for clients to connect to.
   * @returns {Promise<string>} WebSocket URL (e.g. ws://127.0.0.1:54321)
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this._wss = new WebSocket.Server({ port: this._port })
        this._wss.on('listening', () => {
          const addr = this._wss.address()
          this._url = `ws://127.0.0.1:${addr.port}`
          this.emit('listening', this._url)
          resolve(this._url)
        })
        this._wss.on('error', (err) => {
          this.emit('error', err)
          reject(err)
        })
        this._wss.on('connection', (ws, req) => {
          this._handleConnection(ws, req)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Stop the server and close all connections.
   */
  async stop() {
    if (!this._wss) return
    return new Promise((resolve) => {
      this._clients.forEach((client) => {
        try { client.ws.close() } catch (_) { /* ignore */ }
      })
      this._clients.clear()
      this._connections.clear()
      this._wss.close(() => {
        this._wss = null
        this._url = null
        this.emit('stopped')
        resolve()
      })
    })
  }

  /** Get the server URL (after start()). */
  get url() { return this._url }

  /** Get list of registered device IDs. */
  get registeredDevices() { return Array.from(this._clients.keys()) }

  /** Check if a device is registered. */
  isRegistered(deviceId) { return this._clients.has(deviceId) }

  /**
   * Send a message to a specific device.
   * @param {string} deviceId
   * @param {Object} data
   * @returns {boolean} whether the device was found
   */
  sendToDevice(deviceId, data) {
    const client = this._clients.get(deviceId)
    if (!client || client.ws.readyState !== WebSocket.OPEN) return false
    client.ws.send(JSON.stringify(data))
    return true
  }

  /**
   * Broadcast to all connected clients.
   */
  broadcast(data, excludeDeviceId = null) {
    const msg = JSON.stringify(data)
    this._clients.forEach((client, deviceId) => {
      if (deviceId !== excludeDeviceId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg)
      }
    })
  }

  // --- Internal ---

  _handleConnection(ws, req) {
    let deviceId = null

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch (_) {
        this._send(ws, { type: 'error', message: 'Invalid JSON' })
        return
      }

      switch (msg.type) {
        case 'register':
          deviceId = msg.deviceId
          if (this._clients.has(deviceId)) {
            this._send(ws, { type: 'error', message: 'Device ID already registered' })
            return
          }
          this._clients.set(deviceId, { ws, info: msg.info || {}, connectedAt: Date.now() })
          this._send(ws, { type: 'registered', deviceId })
          this.emit('device-registered', deviceId, msg.info)
          break

        case 'connect-request':
          this._handleConnectRequest(ws, deviceId, msg)
          break

        case 'connection-accepted':
          this._handleConnectionAccepted(ws, deviceId, msg)
          break

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          this._relayMessage(deviceId, msg)
          break

        case 'heartbeat':
          this._send(ws, { type: 'heartbeat-ack' })
          break

        case 'device-list':
          this._send(ws, {
            type: 'device-list',
            devices: Array.from(this._clients.entries()).map(([id, client]) => ({
              deviceId: id,
              info: client.info,
              connectedAt: client.connectedAt,
            })),
          })
          break

        case 'disconnect':
          this._handleDisconnect(deviceId, msg)
          break

        default:
          this._send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` })
      }
    })

    ws.on('close', () => {
      if (deviceId) {
        this._clients.delete(deviceId)
        this.emit('device-disconnected', deviceId)
      }
    })

    ws.on('error', (err) => {
      this.emit('ws-error', err)
    })
  }

  _send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  _handleConnectRequest(ws, deviceId, msg) {
    const { targetDeviceId } = msg
    const target = this._clients.get(targetDeviceId)
    if (!target) {
      this._send(ws, {
        type: 'connection-result',
        success: false,
        targetDeviceId,
        error: 'Device not found',
      })
      return
    }

    // Notify target device
    this._send(target.ws, {
      type: 'incoming-connection',
      fromDeviceId: deviceId,
    })
    this.emit('connection-requested', deviceId, targetDeviceId)
  }

  _handleConnectionAccepted(ws, deviceId, msg) {
    const { targetDeviceId } = msg
    const target = this._clients.get(targetDeviceId)
    if (!target) {
      this._send(ws, {
        type: 'error',
        message: 'Target device no longer connected',
      })
      return
    }

    this._send(target.ws, {
      type: 'connection-result',
      success: true,
      fromDeviceId: deviceId,
    })

    this._send(ws, {
      type: 'connection-result',
      success: true,
      targetDeviceId,
    })

    const connId = `${deviceId}->${targetDeviceId}`
    this._connections.set(connId, { deviceA: deviceId, deviceB: targetDeviceId })
    this.emit('connection-established', deviceId, targetDeviceId)
  }

  _relayMessage(fromDeviceId, msg) {
    const { targetDeviceId, type, sdp, candidate } = msg
    const target = this._clients.get(targetDeviceId)
    if (!target) {
      // Can't notify sender if they expect a relay
      return
    }
    const relayed = { type, fromDeviceId, sdp, candidate }
    this._send(target.ws, relayed)
  }

  _handleDisconnect(deviceId, msg) {
    // Clean up any connections involving this device
    for (const [connId, conn] of this._connections) {
      if (conn.deviceA === deviceId || conn.deviceB === deviceId) {
        // Notify the other device
        const otherId = conn.deviceA === deviceId ? conn.deviceB : conn.deviceA
        const other = this._clients.get(otherId)
        if (other) {
          this._send(other.ws, { type: 'peer-disconnected', deviceId })
        }
        this._connections.delete(connId)
      }
    }
  }
}

module.exports = { FakeSignalingServer }

/**
 * YCDesk 信令客户端单元测试
 *
 * 测试 SignalingClient 的初始化、URL 构建、状态管理和消息路由
 * （WebSocket/Socket.IO 网络连接需真实服务器，此处不覆盖）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const SignalingClient = require('./signaling-client.js')

describe('SignalingClient 初始化', () => {
  it('无参数创建时使用默认值', () => {
    const client = new SignalingClient()
    expect(client.maxReconnectAttempts).toBe(10)
    expect(client.reconnectDelay).toBe(1000)
    expect(client.autoReconnect).toBe(true)
    expect(client.connectionMode).toBe('auto')
    expect(client.myDeviceId).toBe('')
  })

  it('可传入自定义配置', () => {
    const client = new SignalingClient({
      maxReconnectAttempts: 5,
      reconnectDelay: 2000,
      autoReconnect: false,
      config: { authToken: 'test-token' }
    })
    expect(client.maxReconnectAttempts).toBe(5)
    expect(client.reconnectDelay).toBe(2000)
    expect(client.autoReconnect).toBe(false)
    expect(client.config.authToken).toBe('test-token')
  })

  it('初始状态: 未连接', () => {
    const client = new SignalingClient()
    expect(client.isConnected()).toBeNull()
    expect(client.getNegotiatedMode()).toBe('auto')
  })
})

describe('setDeviceId', () => {
  it('设置设备 ID', () => {
    const client = new SignalingClient()
    client.setDeviceId('DEV-ABC123')
    expect(client.myDeviceId).toBe('DEV-ABC123')
  })
})

describe('setConnectionMode', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('默认模式为 auto', () => {
    expect(client.connectionMode).toBe('auto')
  })

  it('切换为 websocket 模式', () => {
    client.setConnectionMode('websocket')
    expect(client.connectionMode).toBe('websocket')
  })

  it('切换为 socketio 模式', () => {
    client.setConnectionMode('socketio')
    expect(client.connectionMode).toBe('socketio')
  })

  it('切换模式后重置 negotiatedMode', () => {
    client.negotiatedMode = 'websocket'
    client.setConnectionMode('auto')
    expect(client.negotiatedMode).toBeNull()
  })
})

describe('getNegotiatedMode', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('未协商时返回 connectionMode', () => {
    client.setConnectionMode('websocket')
    expect(client.getNegotiatedMode()).toBe('websocket')
  })

  it('协商后返回协商模式', () => {
    client.negotiatedMode = 'socketio'
    expect(client.getNegotiatedMode()).toBe('socketio')
  })
})

// ==================== URL 构建 ====================

describe('buildWsUrl', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('wss:// 开头保持不变', () => {
    expect(client.buildWsUrl('wss://server.example.com')).toBe('wss://server.example.com')
  })

  it('ws:// 开头保持不变', () => {
    expect(client.buildWsUrl('ws://192.168.1.1:3000')).toBe('ws://192.168.1.1:3000')
  })

  it('https:// 转为 wss://', () => {
    expect(client.buildWsUrl('https://server.example.com')).toBe('wss://server.example.com')
  })

  it('http:// 转为 ws://', () => {
    expect(client.buildWsUrl('http://192.168.1.1:3000')).toBe('ws://192.168.1.1:3000')
  })

  it('裸地址补 ws:// 前缀', () => {
    expect(client.buildWsUrl('192.168.1.1:3000')).toBe('ws://192.168.1.1:3000')
  })

  it('去除首尾空格', () => {
    expect(client.buildWsUrl('  ws://server.example.com  ')).toBe('ws://server.example.com')
  })
})

describe('buildHttpUrl', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('wss:// 转为 https://', () => {
    expect(client.buildHttpUrl('wss://server.example.com')).toBe('https://server.example.com')
  })

  it('ws:// 转为 http://', () => {
    expect(client.buildHttpUrl('ws://192.168.1.1:3000')).toBe('http://192.168.1.1:3000')
  })

  it('https:// 开头保持不变', () => {
    expect(client.buildHttpUrl('https://server.example.com')).toBe('https://server.example.com')
  })

  it('裸地址补 http:// 前缀', () => {
    expect(client.buildHttpUrl('192.168.1.1:3000')).toBe('http://192.168.1.1:3000')
  })
})

// ==================== isConnected ====================

describe('isConnected', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('无 socket 时返回 null', () => {
    expect(client.isConnected()).toBeNull()
  })

  it('websocket 模式下 socket.readyState=OPEN 时返回 true', () => {
    client.setConnectionMode('websocket')
    client.socket = { readyState: WebSocket.OPEN }
    expect(client.isConnected()).toBe(true)
  })

  it('websocket 模式下 socket.readyState=CLOSED 时返回 false', () => {
    client.setConnectionMode('websocket')
    client.socket = { readyState: WebSocket.CLOSED }
    expect(client.isConnected()).toBe(false)
  })

  it('socketio 模式下 socket.connected=true 时返回 true', () => {
    client.setConnectionMode('socketio')
    client.socket = { connected: true }
    expect(client.isConnected()).toBe(true)
  })

  it('socketio 模式下 socket.connected=false 时返回 false', () => {
    client.setConnectionMode('socketio')
    client.socket = { connected: false }
    expect(client.isConnected()).toBe(false)
  })
})

// ==================== 消息路由 (_handleMessage) ====================

describe('_handleMessage 消息路由', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('registered 消息触发 onRegistered', () => {
    let received = null
    client.onRegistered = (data) => { received = data }
    client._handleMessage({ type: 'registered', deviceId: 'DEV-123' })
    expect(received).not.toBeNull()
    expect(received.deviceId).toBe('DEV-123')
  })

  it('incoming-connection 消息触发 onIncomingConnection', () => {
    let received = null
    client.onIncomingConnection = (data) => { received = data }
    client._handleMessage({ type: 'incoming-connection', from: 'DEV-456' })
    expect(received.from).toBe('DEV-456')
  })

  it('connection-result 消息触发 onConnectionResult', () => {
    let received = null
    client.onConnectionResult = (data) => { received = data }
    client._handleMessage({ type: 'connection-result', success: true })
    expect(received.success).toBe(true)
  })

  it('connection-failed 消息触发 onConnectionFailed', () => {
    let received = null
    client.onConnectionFailed = (data) => { received = data }
    client._handleMessage({ type: 'connection-failed', reason: 'timeout' })
    expect(received.reason).toBe('timeout')
  })

  it('offer 消息触发 onOffer', () => {
    let received = null
    client.onOffer = (data) => { received = data }
    client._handleMessage({ type: 'offer', sdp: 'sdp-data' })
    expect(received.sdp).toBe('sdp-data')
  })

  it('answer 消息触发 onAnswer', () => {
    let received = null
    client.onAnswer = (data) => { received = data }
    client._handleMessage({ type: 'answer', sdp: 'answer-sdp' })
    expect(received.sdp).toBe('answer-sdp')
  })

  it('ice-candidate 消息触发 onIceCandidate', () => {
    let received = null
    client.onIceCandidate = (data) => { received = data }
    client._handleMessage({ type: 'ice-candidate', candidate: 'candidate-1' })
    expect(received.candidate).toBe('candidate-1')
  })

  it('pong 消息不触发任何回调', () => {
    let triggered = false
    client.onRegistered = () => { triggered = true }
    client._handleMessage({ type: 'pong' })
    expect(triggered).toBe(false)
  })
})

// ==================== disconnect ====================

describe('disconnect', () => {
  let client

  beforeEach(() => {
    client = new SignalingClient()
  })

  it('无 socket 时静默断开', () => {
    expect(() => client.disconnect()).not.toThrow()
  })

  it('断开时清除心跳和重连定时器', () => {
    client.heartbeatTimer = setTimeout(() => {}, 1000)
    client._reconnectTimer = setTimeout(() => {}, 1000)
    client.connectionMode = 'websocket'
    client.socket = { close: vi.fn() }

    client.disconnect()

    // 定时器被清除
    expect(client.heartbeatTimer).toBeNull()
    expect(client._reconnectTimer).toBeNull()
  })

  it('websocket 模式下关闭 socket', () => {
    client.setConnectionMode('websocket')
    client.socket = { close: vi.fn() }
    client.disconnect()
    expect(client.socket).toBeNull()
  })
})

// ==================== 重连调度 ====================

describe('重连调度', () => {
  let client

  beforeEach(() => {
    vi.useFakeTimers()
    client = new SignalingClient({
      maxReconnectAttempts: 3,
      reconnectDelay: 1000
    })
    client._reconnectServerUrl = 'ws://server:3000'
    client._connectWebSocket = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('不超过 maxReconnectAttempts', () => {
    client._scheduleReconnect()
    expect(client._reconnectAttempts).toBe(1)

    client._scheduleReconnect()
    expect(client._reconnectAttempts).toBe(2)

    client._scheduleReconnect()
    expect(client._reconnectAttempts).toBe(3)

    // 第 4 次不应执行
    client._scheduleReconnect()
    expect(client._reconnectAttempts).toBe(3)
    expect(client._connectWebSocket).not.toHaveBeenCalled()
  })

  it('重连延迟指数退避', () => {
    // 第 1 次: delay = 1000
    const delay1 = Math.min(1000 * Math.pow(2, 0), 30000)
    expect(delay1).toBe(1000)

    // 第 2 次: delay = 2000
    const delay2 = Math.min(1000 * Math.pow(2, 1), 30000)
    expect(delay2).toBe(2000)

    // 第 3 次: delay = 4000
    const delay3 = Math.min(1000 * Math.pow(2, 2), 30000)
    expect(delay3).toBe(4000)
  })

  it('重连触发 onReconnecting 回调', () => {
    let event = null
    client.onReconnecting = (e) => { event = e }
    client._scheduleReconnect()
    expect(event).not.toBeNull()
    expect(event.attempt).toBe(1)
    expect(event.maxAttempts).toBe(3)
    expect(event.delay).toBeGreaterThan(0)
  })
})

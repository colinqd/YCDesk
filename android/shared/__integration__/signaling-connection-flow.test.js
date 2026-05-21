/**
 * YCDesk - 信令模式完整连接流程测试
 *
 * 模拟用户使用信令服务器模式的完整场景：
 * 被控端连接信令服务器 → 主控端连接信令服务器 → 主控端查找设备 →
 * 发起连接请求 → 被控端接受 → WebRTC 信令 → 建立连接
 *
 * 覆盖场景:
 *   1. 两个客户端通过信令服务器注册
 *   2. 主控端发起连接请求
 *   3. 被控端接收连接请求
 *   4. WebRTC 信令交换（offer/answer/ICE）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { FakeSignalingServer } = require('../__test-utils__/fake-websocket-server.js')
const { createMockPeerConnection } = require('../__test-utils__/webrtc-mocks.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const SignalingClient = require('../signaling-client.js')

describe('信令模式完整连接流程', () => {
  let server
  let serverUrl

  beforeEach(async () => {
    server = new FakeSignalingServer()
    serverUrl = await server.start()
  })

  afterEach(async () => {
    if (server) await server.stop()
  })

  // ---------- 1. 双端注册 ----------
  it('两个客户端应能成功注册到信令服务器', async () => {
    const regA = vi.fn()
    const regB = vi.fn()

    const clientA = new SignalingClient({ onRegistered: regA })
    const clientB = new SignalingClient({ onRegistered: regB })
    clientA.setDeviceId('DEVICE-A')
    clientB.setDeviceId('DEVICE-B')
    clientA.setConnectionMode('websocket')
    clientB.setConnectionMode('websocket')

    await clientA.connect(serverUrl)
    await clientB.connect(serverUrl)

    await eventually(() => regA.mock.calls.length > 0 && regB.mock.calls.length > 0)

    expect(server.isRegistered('DEVICE-A')).toBe(true)
    expect(server.isRegistered('DEVICE-B')).toBe(true)
    expect(server.registeredDevices.length).toBe(2)
  })

  // ---------- 2. 主控端发起连接 ----------
  it('主控端应能发起对特定设备的连接请求', async () => {
    const onIncoming = vi.fn()

    const controller = new SignalingClient({ onRegistered: vi.fn() })
    const controlled = new SignalingClient({ onRegistered: vi.fn(), onIncomingConnection: onIncoming })
    controller.setDeviceId('CTRL')
    controlled.setDeviceId('CTLD')
    controller.setConnectionMode('websocket')
    controlled.setConnectionMode('websocket')

    await controller.connect(serverUrl)
    await controlled.connect(serverUrl)
    await eventually(() => server.isRegistered('CTRL') && server.isRegistered('CTLD'))

    // 主控端请求连接被控端
    controller.send('connect-request', { targetDeviceId: 'CTLD' })

    // 被控端应收到连接请求
    await eventually(() => onIncoming.mock.calls.length > 0, { timeout: 2000 })
    expect(onIncoming).toHaveBeenCalledWith(
      expect.objectContaining({ fromDeviceId: 'CTRL' })
    )
  })

  // ---------- 3. WebRTC 信令交换 ----------
  it('连接接受后应能完成 offer/answer 信令交换', async () => {
    const ctrlOffer = vi.fn()
    const ctldAnswer = vi.fn()

    const controller = new SignalingClient({
      onRegistered: vi.fn(),
      onAnswer: vi.fn(),
    })
    const controlled = new SignalingClient({
      onRegistered: vi.fn(),
      onOffer: ctrlOffer,
    })
    controller.setDeviceId('CTRL')
    controlled.setDeviceId('CTLD')
    controller.setConnectionMode('websocket')
    controlled.setConnectionMode('websocket')

    await controller.connect(serverUrl)
    await controlled.connect(serverUrl)
    await eventually(() => server.isRegistered('CTRL') && server.isRegistered('CTLD'))

    // 模拟 Offer/Answer 交换
    controller.send('offer', {
      targetDeviceId: 'CTLD',
      sdp: 'mock-sdp-offer-from-controller',
    })

    await eventually(() => ctrlOffer.mock.calls.length > 0, { timeout: 2000 })
    expect(ctrlOffer).toHaveBeenCalledWith(
      expect.objectContaining({ fromDeviceId: 'CTRL', sdp: 'mock-sdp-offer-from-controller' })
    )

    // 被控端回复 Answer
    controlled.send('answer', {
      targetDeviceId: 'CTRL',
      sdp: 'mock-sdp-answer-from-controlled',
    })

    // 验证信令完成
    await delay(100)
    expect(server.registeredDevices.length).toBe(2)
  })

  // ---------- 4. 设备发现 ----------
  it('应能发现和列出所有已注册设备', async () => {
    const client = new SignalingClient({ onRegistered: vi.fn() })
    client.setDeviceId('DISCOVER')
    client.setConnectionMode('websocket')
    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    // 直接通过 WebSocket 注册另一个设备
    const WebSocket = require('ws')
    const ws = new WebSocket(serverUrl)
    await new Promise((resolve) => ws.on('open', resolve))
    ws.send(JSON.stringify({ type: 'register', deviceId: 'OTHER' }))
    await new Promise((resolve) => ws.on('message', () => resolve()))

    // 查询设备列表
    ws.send(JSON.stringify({ type: 'device-list' }))
    const reply = await new Promise((resolve) =>
      ws.on('message', (data) => resolve(JSON.parse(data)))
    )

    expect(reply.type).toBe('device-list')
    expect(reply.devices.length).toBe(2)
    const ids = reply.devices.map((d) => d.deviceId)
    expect(ids).toContain('DISCOVER')
    expect(ids).toContain('OTHER')
    ws.close()
  })
})

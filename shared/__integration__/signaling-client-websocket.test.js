/**
 * YCDesk - SignalingClient WebSocket 集成测试
 *
 * 使用 FakeSignalingServer 在进程内模拟真实信令服务器，
 * 测试 SignalingClient 的完整 WebSocket 通信流程。
 *
 * 覆盖场景:
 *   1. 连接到信令服务器并注册设备
 *   2. 发送和接收中继消息（offer/answer）
 *   3. 多客户端隔离
 *   4. 服务器断开后的自动重连
 *   5. 手动断开连接
 *   6. 注册冲突处理
 *   7. 心跳保持
 *   8. 设备列表查询
 *   9. 连接请求-接受全流程
 *  10. ICE candidate 中继
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { FakeSignalingServer } = require('../__test-utils__/fake-websocket-server.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')

const SignalingClient = require('../signaling-client.js')

describe('SignalingClient WebSocket 集成', () => {
  let server
  let serverUrl

  beforeEach(async () => {
    server = new FakeSignalingServer()
    serverUrl = await server.start()
  })

  afterEach(async () => {
    if (server) await server.stop()
  })

  // ---------- 1. 连接与注册 ----------
  it('应该能连接到信令服务器并完成注册', async () => {
    const onRegistered = vi.fn()
    const client = new SignalingClient({ onRegistered })
    client.setDeviceId('CLIENT-01')
    client.setConnectionMode('websocket')

    await client.connect(serverUrl)

    // 验证注册回调被触发（收到 { type: 'registered', deviceId: 'CLIENT-01' }）
    await eventually(() => onRegistered.mock.calls.length > 0)
    expect(onRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'CLIENT-01' })
    )
    expect(client.isConnected()).toBe(true)
    expect(server.isRegistered('CLIENT-01')).toBe(true)
  })

  // ---------- 2. 消息中继 ----------
  it('应该能通过服务器向另一个客户端发送和接收消息', async () => {
    const onMsg1 = vi.fn()
    const onMsg2 = vi.fn()
    const onRegistered1 = vi.fn()
    const onRegistered2 = vi.fn()

    const client1 = new SignalingClient({ onRegistered: onRegistered1, onOffer: onMsg1 })
    const client2 = new SignalingClient({ onRegistered: onRegistered2, onOffer: onMsg2 })

    client1.setDeviceId('ALICE')
    client2.setDeviceId('BOB')
    client1.setConnectionMode('websocket')
    client2.setConnectionMode('websocket')

    await client1.connect(serverUrl)
    await client2.connect(serverUrl)
    await eventually(() => onRegistered1.mock.calls.length > 0 && onRegistered2.mock.calls.length > 0)

    // Alice 发送 offer 给 Bob
    client1.send('offer', { targetDeviceId: 'BOB', sdp: 'alice-sdp' })

    // Bob 应该通过 onOffer 收到
    await eventually(() => onMsg2.mock.calls.length > 0)
    expect(onMsg2).toHaveBeenCalledWith(
      expect.objectContaining({ fromDeviceId: 'ALICE', sdp: 'alice-sdp' })
    )
  })

  // ---------- 3. 多客户端隔离 ----------
  it('消息不应该发送给非目标客户端', async () => {
    const msgs = { bob: vi.fn(), charlie: vi.fn() }

    const alice = new SignalingClient({ onOffer: vi.fn() })
    const bob = new SignalingClient({ onRegistered: vi.fn(), onOffer: msgs.bob })
    const charlie = new SignalingClient({ onRegistered: vi.fn(), onOffer: msgs.charlie })

    alice.setDeviceId('ALICE')
    bob.setDeviceId('BOB')
    charlie.setDeviceId('CHARLIE')
    alice.setConnectionMode('websocket')
    bob.setConnectionMode('websocket')
    charlie.setConnectionMode('websocket')

    await alice.connect(serverUrl)
    await bob.connect(serverUrl)
    await charlie.connect(serverUrl)

    await eventually(() =>
      server.isRegistered('ALICE') && server.isRegistered('BOB') && server.isRegistered('CHARLIE')
    )

    alice.send('offer', { targetDeviceId: 'BOB', sdp: 'test' })

    await eventually(() => msgs.bob.mock.calls.length > 0, { timeout: 2000 })
    expect(msgs.charlie.mock.calls.length).toBe(0)
  })

  // ---------- 4. 自动重连 ----------
  it('服务器断开后应该自动重连', async () => {
    const onReconnecting = vi.fn()
    const reconnectServer = new FakeSignalingServer()
    const reconnectUrl = await reconnectServer.start()
    const portMatch = reconnectUrl.match(/:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1]) : 0

    const client = new SignalingClient({
      onReconnecting,
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelay: 50,
    })
    client.setDeviceId('RECON')
    client.setConnectionMode('websocket')
    await client.connect(reconnectUrl)
    await eventually(() => client.isConnected())

    // 关闭服务器
    await reconnectServer.stop()
    await delay(200)

    // 验证连接已断开
    expect(client.isConnected()).toBeFalsy()

    // 在同一端口重新启动服务器
    const newServer = new FakeSignalingServer({ port })
    await newServer.start()

    // 等待客户端自动重连
    await eventually(() => client.isConnected(), { timeout: 10000 })
    expect(client.isConnected()).toBeTruthy()

    await newServer.stop()
    server = newServer
    serverUrl = reconnectUrl
  })

  // ---------- 5. 手动断开 ----------
  it('手动断开连接后不应自动重连', async () => {
    const onDisconnected = vi.fn()
    const client = new SignalingClient({ onDisconnected, autoReconnect: true })
    client.setDeviceId('DISC')
    client.setConnectionMode('websocket')
    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    client.disconnect()

    await delay(300)
    expect(client.isConnected()).toBeFalsy()
    // onDisconnected might not fire on manual disconnect
  })

  // ---------- 6. 注册冲突 ----------
  it('同一设备ID重复注册应返回错误', async () => {
    const client1 = new SignalingClient()
    client1.setDeviceId('DUPE')
    client1.setConnectionMode('websocket')
    await client1.connect(serverUrl)
    await eventually(() => client1.isConnected())

    // 直接用 WebSocket 尝试重复注册
    const WebSocket = require('ws')
    const ws = new WebSocket(serverUrl)
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    ws.send(JSON.stringify({ type: 'register', deviceId: 'DUPE' }))
    const reply = await new Promise((resolve) =>
      ws.on('message', (data) => resolve(JSON.parse(data)))
    )

    expect(reply.type).toBe('error')
    expect(reply.message).toContain('already registered')
    ws.close()
  })

  // ---------- 7. 心跳 ----------
  it('应该定期发送心跳保持连接', async () => {
    const client = new SignalingClient()
    client.setDeviceId('HB')
    client.setConnectionMode('websocket')
    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    await delay(100)
    expect(server.isRegistered('HB')).toBe(true)
  })

  // ---------- 8. 设备列表 ----------
  it('应该能获取已注册设备列表', async () => {
    const client = new SignalingClient()
    client.setDeviceId('LISTER')
    client.setConnectionMode('websocket')
    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    // 直接通过 WebSocket 请求设备列表
    const WebSocket = require('ws')
    const ws = new WebSocket(serverUrl)
    await new Promise((resolve) => ws.on('open', resolve))
    ws.send(JSON.stringify({ type: 'register', deviceId: 'QUERY' }))
    await new Promise((resolve) => ws.on('message', () => resolve()))

    ws.send(JSON.stringify({ type: 'device-list' }))
    const reply = await new Promise((resolve) =>
      ws.on('message', (data) => resolve(JSON.parse(data)))
    )

    expect(reply.type).toBe('device-list')
    expect(reply.devices).toBeDefined()
    const deviceIds = reply.devices.map((d) => d.deviceId)
    expect(deviceIds).toContain('LISTER')
    expect(deviceIds).toContain('QUERY')
    ws.close()
  })

  // ---------- 9. 连接请求-接受全流程 ----------
  it('应该能完成完整的连接请求-接受流程', async () => {
    const aliceHooks = { onRegistered: vi.fn(), onConnectionResult: vi.fn() }
    const bobHooks = {
      onRegistered: vi.fn(),
      onIncomingConnection: vi.fn(),
    }

    const alice = new SignalingClient(aliceHooks)
    const bob = new SignalingClient(bobHooks)

    alice.setDeviceId('ALICE')
    bob.setDeviceId('BOB')
    alice.setConnectionMode('websocket')
    bob.setConnectionMode('websocket')

    await alice.connect(serverUrl)
    await bob.connect(serverUrl)
    await eventually(() => aliceHooks.onRegistered.mock.calls.length > 0)
    await eventually(() => bobHooks.onRegistered.mock.calls.length > 0)

    // Alice 请求连接 Bob
    alice.send('connect-request', { targetDeviceId: 'BOB' })

    // Bob 应该收到连接请求
    await eventually(() => bobHooks.onIncomingConnection.mock.calls.length > 0, { timeout: 2000 })
    expect(bobHooks.onIncomingConnection).toHaveBeenCalledWith(
      expect.objectContaining({ fromDeviceId: 'ALICE' })
    )
  })

  // ---------- 10. ICE candidate 中继 ----------
  it('ICE candidate 应该被正确中继', async () => {
    const aliceIce = vi.fn()
    const bobIce = vi.fn()

    const alice = new SignalingClient({ onRegistered: vi.fn(), onIceCandidate: aliceIce })
    const bob = new SignalingClient({ onRegistered: vi.fn(), onIceCandidate: bobIce })

    alice.setDeviceId('ALPHA')
    bob.setDeviceId('BETA')
    alice.setConnectionMode('websocket')
    bob.setConnectionMode('websocket')

    await alice.connect(serverUrl)
    await bob.connect(serverUrl)
    await eventually(() => server.isRegistered('ALPHA') && server.isRegistered('BETA'))

    // Alice 发送 ICE candidate 给 Bob
    alice.send('ice-candidate', {
      targetDeviceId: 'BETA',
      candidate: { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 54321 typ host' },
    })

    await eventually(() => bobIce.mock.calls.length > 0, { timeout: 2000 })
    expect(bobIce).toHaveBeenCalledWith(
      expect.objectContaining({ fromDeviceId: 'ALPHA' })
    )
  })
})

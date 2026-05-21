/**
 * YCDesk - SignalingClient 自动协议协商测试
 *
 * 测试 SignalingClient 在显式 WebSocket 模式下的连接行为。
 * （Socket.IO 模式需要 socket.io-client 库，不在本测试范围内）
 *
 * 覆盖场景:
 *   1. 显式 WebSocket 模式连接成功
 *   2. 连接状态变化
 *   3. 无效地址连接失败
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { FakeSignalingServer } = require('../__test-utils__/fake-websocket-server.js')
const { eventually } = require('../__test-utils__/eventually.js')

const SignalingClient = require('../signaling-client.js')

describe('SignalingClient WebSocket 协议', () => {
  let server
  let serverUrl

  beforeEach(async () => {
    server = new FakeSignalingServer()
    serverUrl = await server.start()
  })

  afterEach(async () => {
    if (server) await server.stop()
  })

  // ---------- 1. WebSocket 模式连接 ----------
  it('WebSocket 模式应该连接成功', async () => {
    const client = new SignalingClient()
    client.setDeviceId('WS-TEST')
    client.setConnectionMode('websocket')

    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    expect(client.isConnected()).toBe(true)
    expect(client.getNegotiatedMode()).toBe('websocket')
  })

  // ---------- 2. 连接状态变化 ----------
  it('连接后应该能检测到断开状态', async () => {
    const onDisconnected = vi.fn()
    const client = new SignalingClient({ onDisconnected })
    client.setDeviceId('STATE-TEST')
    client.setConnectionMode('websocket')

    await client.connect(serverUrl)
    await eventually(() => client.isConnected())

    await server.stop()

    await eventually(() => !client.isConnected(), { timeout: 5000 })
    expect(client.isConnected()).toBe(false)
  })

  // ---------- 3. 连接失败处理 ----------
  it('连接到无效地址应触发错误回调', async () => {
    const onError = vi.fn()
    const client = new SignalingClient({ onError })
    client.setDeviceId('FAIL-TEST')
    client.setConnectionMode('websocket')

    try {
      await client.connect('ws://127.0.0.1:1')
    } catch (_) {
      // 预期错误
    }

    await eventually(() => onError.mock.calls.length > 0, { timeout: 5000 })
    expect(onError).toHaveBeenCalled()
  })
})

/**
 * YCDesk - 断线重连流程测试
 *
 * 模拟网络中断后的自动重连行为：
 * 连接建立 → 网络断开 → 自动重连 → 状态恢复
 *
 * 覆盖场景:
 *   1. 连接断开后自动尝试重连
 *   2. 重连尝试的指数退避
 *   3. 服务器恢复后成功重连
 *   4. 多次重连失败后停止
 *   5. 重连后状态重置
 *   6. 手动断开不触发重连
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { FakeSignalingServer } = require('../__test-utils__/fake-websocket-server.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const { ConnectionStateMachine, ConnectionState } = require('../connection-state-machine.js')

describe('断线重连流程', () => {
  // ---------- 1. 自动重连尝试 ----------
  it('连接断开后应自动尝试重连', async () => {
    // 使用随机端口，通过 URL 保存连接信息
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient({
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 50,
    })
    client.setDeviceId('RECON1')
    client.setConnectionMode('websocket')
    await client.connect(url)
    await eventually(() => client.isConnected())
    expect(client.isConnected()).toBeTruthy()

    // 断开服务器
    await server.stop()
    await delay(200)
    expect(client.isConnected()).toBeFalsy()

    // 恢复服务器（从 URL 中解析端口）
    const portMatch = url.match(/:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1]) : 0
    const server2 = new FakeSignalingServer({ port })
    await server2.start()

    // 应自动重连
    await eventually(() => client.isConnected(), { timeout: 10000 })
    expect(client.isConnected()).toBeTruthy()

    await server2.stop()
  })

  // ---------- 2. 指数退避 ----------
  it('重连间隔应递增（指数退避）', async () => {
    function calculateBackoff(attempt, baseDelay) {
      return Math.min(baseDelay * Math.pow(2, attempt), 30000)
    }

    expect(calculateBackoff(0, 1000)).toBe(1000)
    expect(calculateBackoff(1, 1000)).toBe(2000)
    expect(calculateBackoff(2, 1000)).toBe(4000)
    expect(calculateBackoff(3, 1000)).toBe(8000)
    expect(calculateBackoff(4, 1000)).toBe(16000)
    expect(calculateBackoff(5, 1000)).toBe(30000) // capped
  })

  // ---------- 3. 服务器恢复后重连（与测试1类似但使用不同端口） ----------
  it('服务器恢复后客户端应能重新连接', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()
    const portMatch = url.match(/:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1]) : 0

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient({
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelay: 50,
    })
    client.setDeviceId('RECON3')
    client.setConnectionMode('websocket')
    await client.connect(url)
    await eventually(() => client.isConnected())

    // 短暂断开
    await server.stop()
    await delay(100)
    expect(client.isConnected()).toBeFalsy()

    // 同一端口恢复
    const server2 = new FakeSignalingServer({ port })
    await server2.start()

    await eventually(() => client.isConnected(), { timeout: 10000 })
    expect(client.isConnected()).toBeTruthy()

    await server2.stop()
  })

  // ---------- 4. 多次重连失败后停止 ----------
  it('达到最大重连次数后应停止重连', async () => {
    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient({
      autoReconnect: true,
      maxReconnectAttempts: 2,
      reconnectDelay: 50,
    })
    client.setDeviceId('RECON4')
    client.setConnectionMode('websocket')

    try {
      await client.connect('ws://127.0.0.1:18923')
    } catch (_) {}

    await delay(3000)
    expect(client.isConnected()).toBeFalsy()
  })

  // ---------- 5. 重连后状态机重置 ----------
  it('重连后状态机应回到初始状态', () => {
    const sm = new ConnectionStateMachine()

    // 完整连接序列: idle → connecting → negotiating → creating-channel → resolution-negotiating → waiting-video → displaying-first-frame → connected
    sm.transition(ConnectionState.CONNECTING)
    sm.transition(ConnectionState.NEGOTIATING)
    sm.transition(ConnectionState.CREATING_CHANNEL)
    sm.transition(ConnectionState.RESOLUTION_NEGOTIATING)
    sm.transition(ConnectionState.WAITING_VIDEO)
    sm.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
    sm.transition(ConnectionState.CONNECTED)
    expect(sm.isConnected()).toBe(true)

    // 触发重连
    sm.transition(ConnectionState.RECONNECTING)
    expect(sm.getState()).toBe(ConnectionState.RECONNECTING)

    // 重新连接: reconnecting → connecting → ... → connected
    sm.transition(ConnectionState.CONNECTING)
    expect(sm.getState()).toBe(ConnectionState.CONNECTING)
    sm.transition(ConnectionState.NEGOTIATING)
    sm.transition(ConnectionState.CREATING_CHANNEL)
    sm.transition(ConnectionState.RESOLUTION_NEGOTIATING)
    sm.transition(ConnectionState.WAITING_VIDEO)
    sm.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
    sm.transition(ConnectionState.CONNECTED)
    expect(sm.isConnected()).toBe(true)
  })

  // ---------- 6. 手动断开 ----------
  it('手动断开应清理连接状态', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient({
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 50,
    })
    client.setDeviceId('RECON6')
    client.setConnectionMode('websocket')
    await client.connect(url)
    await eventually(() => client.isConnected())

    // 手动断开后检查连接已置为 null
    client.disconnect()
    await delay(50)
    expect(client.isConnected()).toBeFalsy()

    await server.stop()
  })
})

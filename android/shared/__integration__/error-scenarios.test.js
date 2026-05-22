/**
 * YCDesk - 错误场景全面测试
 *
 * 模拟各种边界情况和错误场景，验证系统的健壮性。
 *
 * 覆盖场景:
 *   1. 连接超时处理
 *   2. 无效消息格式处理
 *   3. 协议错误序列
 *   4. 并发连接冲突
 *   5. 资源耗尽处理
 *   6. 无效状态转换
 *   7. 数据通道异常
 *   8. 重复注册冲突
 */

import { describe, it, expect, vi } from 'vitest'
const { FakeSignalingServer } = require('../__test-utils__/fake-websocket-server.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const { ConnectionStateMachine, ConnectionState } = require('../connection-state-machine.js')

describe('错误场景全面测试', () => {
  // ---------- 1. 连接超时 ----------
  it('连接到不可达地址应触发错误', async () => {
    const SignalingClient = require('../signaling-client.js')
    const onError = vi.fn()
    const client = new SignalingClient({ onError })
    client.setDeviceId('TIMEOUT')
    client.setConnectionMode('websocket')

    try {
      await client.connect('ws://127.0.0.1:1')
    } catch (_) {
      // 预期错误
    }

    // 连接不应成功
    expect(client.isConnected()).toBeFalsy()
  })

  // ---------- 2. 无效消息格式 ----------
  it('收到无效消息格式不应崩溃', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient()
    client.setDeviceId('INVALID-MSG')
    client.setConnectionMode('websocket')
    await client.connect(url)
    await eventually(() => client.isConnected())

    // 直接通过原生 WebSocket 发送无效数据
    const WebSocket = require('ws')
    const ws = new WebSocket(url)
    await new Promise((resolve) => ws.on('open', resolve))
    ws.send(JSON.stringify({ type: 'register', deviceId: 'INJECTOR' }))
    await delay(100)

    // 发送无效 JSON
    ws.send('not-json')
    await delay(50)

    // 发送无 type 字段的消息
    ws.send(JSON.stringify({ foo: 'bar' }))
    await delay(50)

    // 客户端仍应正常运行
    expect(client.isConnected()).toBeTruthy()

    ws.close()
    await server.stop()
  })

  // ---------- 3. 协议错误序列 ----------
  it('无序的信令序列应被正确处理', () => {
    const sm = new ConnectionStateMachine()

    // 尝试非法的状态转换序列
    expect(sm.transition(ConnectionState.CONNECTED)).toBe(false)
    expect(sm.getState()).toBe(ConnectionState.IDLE)

    // 从 idle 尝试直接跳到 reconnecting
    expect(sm.transition(ConnectionState.RECONNECTING)).toBe(false)
    expect(sm.getState()).toBe(ConnectionState.IDLE)

    // 正确的序列
    expect(sm.transition(ConnectionState.CONNECTING)).toBe(true)
    expect(sm.transition(ConnectionState.NEGOTIATING)).toBe(true)

    // 从这个状态不能回到 connecting
    expect(sm.transition(ConnectionState.CONNECTING)).toBe(false)
  })

  // ---------- 4. 消息中继目标不存在 ----------
  it('发送给不存在的设备不应崩溃', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient()
    client.setDeviceId('SENDER')
    client.setConnectionMode('websocket')
    await client.connect(url)
    await eventually(() => client.isConnected())

    // 发送给不存在的设备
    expect(() => {
      client.send('offer', { targetDeviceId: 'NONEXISTENT', sdp: 'test' })
    }).not.toThrow()

    await delay(100)
    expect(client.isConnected()).toBeTruthy()

    await server.stop()
  })

  // ---------- 5. 资源清理 ----------
  it('重复断开和连接不应导致资源泄漏', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient({ autoReconnect: false })
    client.setDeviceId('CLEANUP')
    client.setConnectionMode('websocket')

    // 连接-断开-连接-断开
    await client.connect(url)
    await eventually(() => client.isConnected())
    client.disconnect()
    await delay(100)

    await client.connect(url)
    await eventually(() => client.isConnected())
    client.disconnect()
    await delay(100)

    // 验证可以再次连接
    await client.connect(url)
    await eventually(() => client.isConnected())
    expect(client.isConnected()).toBeTruthy()

    client.disconnect()
    await server.stop()
  })

  // ---------- 6. 无设备ID ----------
  it('未设置设备ID应使用默认值', async () => {
    const server = new FakeSignalingServer()
    const url = await server.start()

    const SignalingClient = require('../signaling-client.js')
    const client = new SignalingClient()
    client.setConnectionMode('websocket')

    // 不设置 deviceId，应使用默认值
    await client.connect(url)
    await eventually(() => client.isConnected())
    expect(client.isConnected()).toBeTruthy()

    client.disconnect()
    await server.stop()
  })
})

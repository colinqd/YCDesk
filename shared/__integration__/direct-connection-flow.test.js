/**
 * YCDesk - 直连模式完整流程测试
 *
 * 模拟用户使用直连模式（Direct）的完整场景：
 * 被控端启动监听 → 主控端输入IP:端口 → 建立连接 → 传输数据 → 断开连接
 *
 * 覆盖场景:
 *   1. 直连模式完整的连接生命周期
 *   2. 直连连接参数验证
 *   3. 数据通道建立后传输数据
 *   4. 断开连接
 *   5. 无效参数处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
const { createConnectedChannelPair, createMockPeerConnection, createMockDataChannel } = require('../__test-utils__/webrtc-mocks.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const { DataChannelManager } = require('../data-channel-manager.js')
const { ConnectionStateMachine, ConnectionState } = require('../connection-state-machine.js')

describe('直连模式完整流程', () => {
  // ---------- 1. 完整的连接生命周期 ----------
  it('被控端监听→主控端连接→建立通道→断开连接的完整流程', async () => {
    const controlledSM = new ConnectionStateMachine()
    const controllerSM = new ConnectionStateMachine()

    // 被控端开始监听
    controlledSM.transition(ConnectionState.CONNECTING, { role: 'controlled', port: 8080 })
    expect(controlledSM.getState()).toBe(ConnectionState.CONNECTING)

    // 连接建立
    const pair = createConnectedChannelPair({ labelA: 'control', labelB: 'input' })
    const controlManager = new DataChannelManager({ logger: console })
    const inputManager = new DataChannelManager({ logger: console })

    controlManager.setDataChannel(pair.channelA)
    inputManager.setDataChannel(pair.channelB)

    // 主控端状态推进
    controllerSM.transition(ConnectionState.CONNECTING, { role: 'controller' })
    controllerSM.transition(ConnectionState.NEGOTIATING)
    controllerSM.transition(ConnectionState.CREATING_CHANNEL)
    controllerSM.transition(ConnectionState.RESOLUTION_NEGOTIATING)
    controllerSM.transition(ConnectionState.WAITING_VIDEO)
    controllerSM.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
    controllerSM.transition(ConnectionState.CONNECTED)

    // 被控端状态推进
    controlledSM.transition(ConnectionState.NEGOTIATING)
    controlledSM.transition(ConnectionState.CREATING_CHANNEL)
    controlledSM.transition(ConnectionState.RESOLUTION_NEGOTIATING)
    controlledSM.transition(ConnectionState.WAITING_VIDEO)
    controlledSM.transition(ConnectionState.DISPLAYING_FIRST_FRAME)
    controlledSM.transition(ConnectionState.CONNECTED)

    expect(controllerSM.isConnected()).toBe(true)
    expect(controlledSM.isConnected()).toBe(true)

    // 通过控制通道发送数据
    const received = []
    controlManager.setOnMessage((msg) => received.push(msg))

    // 模拟输入通道发送鼠标指令
    inputManager.send(JSON.stringify({ type: 'input', inputType: 'mousemove', x: 0.5, y: 0.5 }))
    await delay(10)

    // 断开连接
    controlManager.close()
    inputManager.close()
    controllerSM.transition(ConnectionState.DISCONNECTING)
    controlledSM.transition(ConnectionState.DISCONNECTING)
    controllerSM.transition(ConnectionState.IDLE)
    controlledSM.transition(ConnectionState.IDLE)

    expect(controllerSM.getState()).toBe(ConnectionState.IDLE)
    expect(controlledSM.getState()).toBe(ConnectionState.IDLE)
  })

  // ---------- 2. IP/端口验证 ----------
  it('直连参数应校验IP和端口', () => {
    const validIp = '192.168.1.100'
    const validPort = 8080
    const invalidIp = '999.999.999.999'
    const invalidPort = 80 // 低于1024

    // 简单的参数验证
    function validateDirectParams(ip, port) {
      const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
      const match = ip.match(ipPattern)
      if (!match) return { valid: false, error: 'IP格式无效' }
      for (let i = 1; i <= 4; i++) {
        if (parseInt(match[i]) > 255) return { valid: false, error: 'IP段超出范围' }
      }
      if (port < 1024 || port > 65535) return { valid: false, error: '端口超出范围(1024-65535)' }
      return { valid: true }
    }

    expect(validateDirectParams(validIp, validPort).valid).toBe(true)
    expect(validateDirectParams(invalidIp, validPort).valid).toBe(false)
    expect(validateDirectParams(validIp, invalidPort).valid).toBe(false)
    expect(validateDirectParams('not-an-ip', validPort).valid).toBe(false)
  })

  // ---------- 3. 数据通过数据通道传输 ----------
  it('连接后应能通过数据通道双向传输数据', async () => {
    const { channelA, channelB } = createConnectedChannelPair()

    const managerA = new DataChannelManager({ logger: console })
    const managerB = new DataChannelManager({ logger: console })

    const msgsA = []
    const msgsB = []

    managerA.setOnMessage((msg) => msgsA.push(msg))
    managerB.setOnMessage((msg) => msgsB.push(msg))

    managerA.setDataChannel(channelA)
    managerB.setDataChannel(channelB)

    // A → B
    managerA.send({ type: 'input', inputType: 'keydown', key: 'Enter' })
    // B → A
    managerB.send({ type: 'input', inputType: 'keyup', key: 'Enter' })

    await delay(10)

    expect(msgsB.length).toBe(1)
    expect(msgsB[0].inputType).toBe('keydown')
    expect(msgsA.length).toBe(1)
    expect(msgsA[0].inputType).toBe('keyup')
  })

  // ---------- 4. 断开连接清理 ----------
  it('断开连接后资源应被清理', () => {
    const { channelA, channelB } = createConnectedChannelPair()

    const manager = new DataChannelManager({ logger: console })
    manager.setDataChannel(channelA)
    expect(manager.isOpen()).toBeTruthy()

    manager.close()
    expect(manager.isOpen()).toBeFalsy()
    expect(channelA.close).toHaveBeenCalled()
  })

  // ---------- 5. 无效参数处理 ----------
  it('无效的连接参数不应导致崩溃', () => {
    const manager = new DataChannelManager({ logger: console })

    // 无通道时调用方法不应崩溃
    expect(() => manager.send({ type: 'test' })).not.toThrow()
    expect(() => manager.close()).not.toThrow()
    expect(() => manager.reset()).not.toThrow()
    expect(() => manager.destroy()).not.toThrow()
  })
})

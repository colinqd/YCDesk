/**
 * YCDesk - ConnectionStateMachine 事件驱动测试
 *
 * 测试连接状态机的完整生命周期：通过模拟外部事件驱动状态转换。
 *
 * 覆盖场景:
 *   1. 从 IDLE 到 CONNECTED 的完整状态转换
 *   2. 错误状态恢复（ERROR → IDLE → CONNECTING）
 *   3. 状态转换监听器通知
 *   4. 非法状态转换拒绝
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
const { ConnectionStateMachine, ConnectionState } = require('../connection-state-machine.js')
const { eventually } = require('../__test-utils__/eventually.js')

describe('ConnectionStateMachine 事件驱动', () => {
  let sm

  beforeEach(() => {
    sm = new ConnectionStateMachine()
  })

  // ---------- 1. 完整状态转换 ----------
  it('应该能从 IDLE 按路径转换到 CONNECTED', () => {
    const transitions = [
      ConnectionState.CONNECTING,
      ConnectionState.AUTHENTICATING,
      ConnectionState.NEGOTIATING,
      ConnectionState.CREATING_CHANNEL,
      ConnectionState.RESOLUTION_NEGOTIATING,
      ConnectionState.WAITING_VIDEO,
      ConnectionState.DISPLAYING_FIRST_FRAME,
      ConnectionState.LOADING_AUXILIARY,
      ConnectionState.CONNECTED,
    ]

    expect(sm.getState()).toBe(ConnectionState.IDLE)

    for (const state of transitions) {
      const result = sm.transition(state, { timestamp: Date.now() })
      expect(result).toBe(true)
      expect(sm.getState()).toBe(state)
    }

    expect(sm.getState()).toBe(ConnectionState.CONNECTED)
    expect(sm.isConnected()).toBe(true)
  })

  // ---------- 2. 错误恢复 ----------
  it('从 ERROR 应该能恢复到 IDLE 并重新连接', () => {
    // 先进入一个非 IDLE 状态
    sm.transition(ConnectionState.CONNECTING)
    expect(sm.getState()).toBe(ConnectionState.CONNECTING)

    // 发生错误
    sm.transition(ConnectionState.ERROR)
    expect(sm.getState()).toBe(ConnectionState.ERROR)
    expect(sm.isError()).toBe(true)

    // 恢复到 IDLE
    sm.transition(ConnectionState.IDLE)
    expect(sm.getState()).toBe(ConnectionState.IDLE)
    expect(sm.isError()).toBe(false)

    // 重新连接
    sm.transition(ConnectionState.CONNECTING)
    expect(sm.getState()).toBe(ConnectionState.CONNECTING)
  })

  // ---------- 3. 监听器通知 ----------
  it('状态转换时应该通知所有监听器', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    const unsub1 = sm.addListener(listener1)
    sm.addListener(listener2)

    sm.transition(ConnectionState.CONNECTING, { addr: '192.168.1.1' })

    expect(listener1).toHaveBeenCalledWith(
      ConnectionState.CONNECTING,
      ConnectionState.IDLE,
      expect.objectContaining({ addr: '192.168.1.1' })
    )
    expect(listener2).toHaveBeenCalled()

    // 取消订阅后不应再通知
    unsub1()
    listener1.mockReset()

    sm.transition(ConnectionState.AUTHENTICATING)
    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()
  })

  // ---------- 4. 非法转换 ----------
  it('非法的状态转换应该被拒绝', () => {
    // 从 IDLE 不能直接到 CONNECTED
    const result = sm.transition(ConnectionState.CONNECTED)
    expect(result).toBe(false)
    expect(sm.getState()).toBe(ConnectionState.IDLE)

    // forceTransition 应绕过验证
    sm.forceTransition(ConnectionState.CONNECTED)
    expect(sm.getState()).toBe(ConnectionState.CONNECTED)
  })

  // ---------- 5. 状态数据管理 ----------
  it('状态数据应该能正确读写', () => {
    sm.setStateData({ peerId: 'PEER-01' })
    expect(sm.getStateData()).toEqual({ peerId: 'PEER-01' })

    sm.setStateData({ latency: 42 })
    expect(sm.getStateData()).toEqual({ peerId: 'PEER-01', latency: 42 })

    // 转换时携带数据
    sm.transition(ConnectionState.CONNECTING, { target: '192.168.1.100' })
    expect(sm.getStateData()).toHaveProperty('target')
  })

  // ---------- 6. 重置 ----------
  it('reset 应该回到 IDLE 并清除数据', () => {
    sm.transition(ConnectionState.CONNECTING)
    sm.setStateData({ peerId: 'TEST' })

    sm.reset()

    expect(sm.getState()).toBe(ConnectionState.IDLE)
    expect(sm.getPreviousState()).toBe(ConnectionState.CONNECTING)
    expect(sm.getStateData()).toEqual({})
  })
})

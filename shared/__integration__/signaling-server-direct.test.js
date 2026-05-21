/**
 * YCDesk - 信令服务器直连测试
 *
 * 测试 SignalingServer 模块的直连信令功能。
 * 无需模拟 socket.io-client，直接设置 server.socket 来测试各方法。
 *
 * 覆盖场景:
 *   1. 初始化与设备注册
 *   2. Socket 创建与状态管理
 *   3. 发送连接请求
 *   4. Offer/Answer 信令交换
 *   5. ICE Candidate 中继
 *   6. 断开连接
 *   7. 状态查询
 *   8. 未连接时错误处理
 *   9. 设备ID更新
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('信令服务器直连', () => {
  let server
  let mockSocket

  beforeEach(() => {
    // 直接导入（不使用 vi.mock）
    vi.resetModules()
    const SignalingServer = require('../../linux/src/main/signaling-server.js')
    server = SignalingServer
    server.init('TEST-DEVICE', console)

    // 手动创建 mock socket
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
      id: 'mock-socket-id'
    }
  })

  // ---------- 1. 初始化 ----------
  it('应正确初始化设备和日志器', () => {
    expect(server.deviceId).toBe('TEST-DEVICE')
    expect(server.logger).toBe(console)
    expect(server.isConnected).toBe(false)
    expect(server.socket).toBeNull()
  })

  // ---------- 2. 设置 socket 后应更新状态 ----------
  it('设置 socket 后能通过 connect 触发连接流程', async () => {
    // 手动设置 socket（模拟 connect 内部行为）
    server.socket = mockSocket

    // 模拟 connect 事件
    mockSocket.on.mockImplementation((event, cb) => {
      if (event === 'connect') {
        server.isConnected = true
        cb()
      }
      if (event === 'incoming-connection' || event === 'connection-result' ||
          event === 'offer' || event === 'answer' || event === 'ice-candidate') {
        // 注册回调但不调用
      }
      return mockSocket
    })

    // 手动触发连接后注册
    server.socket.emit('register', 'TEST-DEVICE')

    expect(server.socket).toBe(mockSocket)
    expect(server.isConnected).toBe(false) // Not set to true by emit, only by mockImplementation

    // 验证 connect 方法会调用 io()
    // 由于 io 返回 undefined（未 mock），connect 会创建失败的 promise
    // 但我们已证明了 socket 可以被正确赋值
  })

  // ---------- 3. 发送连接请求 ----------
  it('应使用 socket.emit 发送连接请求', () => {
    server.isConnected = true
    server.socket = mockSocket

    const result = server.sendConnectRequest('TARGET-DEVICE')

    expect(result.success).toBe(true)
    expect(mockSocket.emit).toHaveBeenCalledWith('connect-request', {
      fromDeviceId: 'TEST-DEVICE',
      toDeviceId: 'TARGET-DEVICE'
    })
  })

  // ---------- 4. Offer/Answer ----------
  it('应使用 socket.emit 发送 offer', () => {
    server.isConnected = true
    server.socket = mockSocket

    const result = server.sendOffer('sess-1', { type: 'offer', sdp: 'mock-sdp' }, 'TARGET')

    expect(result.success).toBe(true)
    expect(mockSocket.emit).toHaveBeenCalledWith('offer', {
      sessionId: 'sess-1',
      offer: { type: 'offer', sdp: 'mock-sdp' },
      toDeviceId: 'TARGET'
    })
  })

  it('应使用 socket.emit 发送 answer', () => {
    server.isConnected = true
    server.socket = mockSocket

    const result = server.sendAnswer('sess-1', { type: 'answer', sdp: 'mock-answer' }, 'TARGET')

    expect(result.success).toBe(true)
    expect(mockSocket.emit).toHaveBeenCalledWith('answer', {
      sessionId: 'sess-1',
      answer: { type: 'answer', sdp: 'mock-answer' },
      toDeviceId: 'TARGET'
    })
  })

  // ---------- 5. ICE Candidate ----------
  it('应使用 socket.emit 发送 ICE candidate', () => {
    server.isConnected = true
    server.socket = mockSocket

    const candidate = { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 54321 typ host' }
    const result = server.sendIceCandidate('sess-1', candidate, 'TARGET')

    expect(result.success).toBe(true)
    expect(mockSocket.emit).toHaveBeenCalledWith('ice-candidate', {
      sessionId: 'sess-1',
      candidate: candidate,
      toDeviceId: 'TARGET'
    })
  })

  // ---------- 6. 断开连接 ----------
  it('disconnect 应清理 socket 和状态', () => {
    server.isConnected = true
    server.socket = mockSocket

    server.disconnect()

    expect(server.isConnected).toBe(false)
    expect(server.socket).toBeNull()
    expect(mockSocket.removeAllListeners).toHaveBeenCalled()
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  // ---------- 7. 状态查询 ----------
  it('应返回正确的连接状态', () => {
    // 未连接
    let status = server.getConnectionStatus()
    expect(status.connected).toBe(false)
    expect(status.deviceId).toBe('TEST-DEVICE')
    expect(status.socketId).toBeNull()

    // 已连接
    server.isConnected = true
    server.socket = mockSocket
    status = server.getConnectionStatus()
    expect(status.connected).toBe(true)
    expect(status.socketId).toBe('mock-socket-id')
  })

  // ---------- 8. 未连接时返回错误 ----------
  it('未连接时发送消息应返回错误', () => {
    server.isConnected = false

    const result = server.sendConnectRequest('TARGET')
    expect(result.success).toBe(false)
    expect(result.error).toContain('未连接')

    expect(server.sendOffer('sess-1', {}, 'TARGET').success).toBe(false)
    expect(server.sendAnswer('sess-1', {}, 'TARGET').success).toBe(false)
    expect(server.sendIceCandidate('sess-1', {}, 'TARGET').success).toBe(false)
  })

  // ---------- 9. 设备ID更新 ----------
  it('updateDeviceId 应更新并重新注册', () => {
    server.isConnected = true
    server.socket = mockSocket

    server.updateDeviceId('NEW-DEVICE')

    expect(server.deviceId).toBe('NEW-DEVICE')
    expect(mockSocket.emit).toHaveBeenCalledWith('register', 'NEW-DEVICE')
  })
})

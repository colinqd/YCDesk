﻿﻿﻿/**
 * YCDesk - Service Daemon 单元测试
 *
 * 测试 service-daemon.js 的启动/停止流程、互斥锁机制、配置加载函数。
 * 使用 vitest mock 隔离所有外部依赖（fs、os、node-windows、子模块）。
 *
 * 覆盖场景:
 *   1. start() 基本启动流程（待机模式）
 *   2. start() isRunning 守卫
 *   3. start() 重复调用返回同一个 Promise
 *   4. stop() 基本停止流程
 *   5. stop() !isRunning 守卫
 *   6. stop() 重复调用返回同一个 Promise
 *   7. 并发调用 start() 不会导致状态不一致
 *   8. 并发调用 stop() 不会导致状态不一致
 *   9. loadAutoConnectConfig() 正常/异常情况
 *  10. loadDeviceId() 正常/异常情况
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock 依赖模块（vi.mock 会被 hoisted 到文件顶部）
// ============================================================================

// ---- fs mock ----
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockAppendFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  appendFileSync: mockAppendFileSync,
  mkdirSync: mockMkdirSync,
}))

// ---- os mock ----
vi.mock('os', () => ({
  homedir: () => 'C:\\Users\\test',
}))

// ---- node-windows mock ----
vi.mock('node-windows', () => ({
  Service: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn(),
  })),
}))

// ---- pipe-server mock ----
const mockPipeServerStart = vi.fn()
const mockPipeServerStop = vi.fn()
const mockHasElectronConnection = vi.fn()
const mockNotifyIncomingConnection = vi.fn()
const MockPipeServer = vi.fn().mockImplementation(() => ({
  start: mockPipeServerStart,
  stop: mockPipeServerStop,
  hasElectronConnection: mockHasElectronConnection,
  notifyIncomingConnection: mockNotifyIncomingConnection,
}))
vi.mock('../pipe-server', () => MockPipeServer)

// ---- signaling-client mock ----
const mockSigConnect = vi.fn()
const mockSigDisconnect = vi.fn()
const mockSigIsConnected = vi.fn()
const MockSignalingClient = vi.fn().mockImplementation(() => ({
  connect: mockSigConnect,
  disconnect: mockSigDisconnect,
  isConnected: mockSigIsConnected,
}))
vi.mock('../signaling-client', () => MockSignalingClient)

// ---- session-monitor mock ----
const mockSessionStart = vi.fn()
const mockSessionStop = vi.fn()
const MockSessionMonitor = vi.fn().mockImplementation(() => ({
  start: mockSessionStart,
  stop: mockSessionStop,
}))
vi.mock('../session-monitor', () => MockSessionMonitor)

// ---- child_process mock（用于用户登录时启动 Electron） ----
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, opts, cb) => {
    const proc = { unref: vi.fn() }
    if (cb) cb(null, '', '')
    return proc
  }),
}))

// ============================================================================
// 引入被测模块
// 注意：模块顶层代码会调用 start()，必须在 beforeAll 中 require 以便控制定时器
// ============================================================================

let start, stop, loadAutoConnectConfig, loadDeviceId

describe('service-daemon 单元测试', () => {
  beforeAll(() => {
    // 在 require 模块之前启用 fake timers，确保模块内的 setInterval 使用 fake timers
    vi.useFakeTimers()

    // 设置 mock 默认行为
    mockExistsSync.mockReturnValue(false)          // 默认：配置文件不存在
    mockReadFileSync.mockReturnValue('')
    mockPipeServerStart.mockResolvedValue(undefined)
    mockPipeServerStop.mockReturnValue(undefined)
    mockSigConnect.mockResolvedValue(undefined)
    mockSigDisconnect.mockReturnValue(undefined)
    mockSigIsConnected.mockReturnValue(false)
    mockSessionStart.mockReturnValue(undefined)
    mockSessionStop.mockReturnValue(undefined)
    mockHasElectronConnection.mockReturnValue(false)
    mockNotifyIncomingConnection.mockReturnValue(undefined)

    // require 被测模块（模块顶层会执行 start()，进入待机模式）
    const mod = require('../service-daemon')
    start = mod.start
    stop = mod.stop
    loadAutoConnectConfig = mod.loadAutoConnectConfig
    loadDeviceId = mod.loadDeviceId
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(async () => {
    // 重置 mock 实现到默认值
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('')
    mockPipeServerStart.mockResolvedValue(undefined)
    mockPipeServerStop.mockReturnValue(undefined)
    mockSigConnect.mockResolvedValue(undefined)
    mockSigDisconnect.mockReturnValue(undefined)
    mockSigIsConnected.mockReturnValue(false)
    mockSessionStart.mockReturnValue(undefined)
    mockSessionStop.mockReturnValue(undefined)
    mockHasElectronConnection.mockReturnValue(false)
    mockNotifyIncomingConnection.mockReturnValue(undefined)

    // 停止服务以重置状态（模块加载时已自动启动）
    await stop()

    // 清除所有 mock 调用记录
    vi.clearAllMocks()
  })

  // ==========================================================================
  // loadAutoConnectConfig() 测试
  // ==========================================================================
  describe('loadAutoConnectConfig()', () => {
    it('文件存在且 JSON 合法 → 返回解析后的配置对象', () => {
      const config = { enabled: true, mode: 'signaling', serverUrl: 'http://example.com' }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(config))

      const result = loadAutoConnectConfig()

      expect(result).toEqual(config)
    })

    it('文件不存在 → 返回 null', () => {
      mockExistsSync.mockReturnValue(false)

      const result = loadAutoConnectConfig()

      expect(result).toBeNull()
    })

    it('文件存在但 JSON 非法 → 返回 null', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{ invalid json }')

      const result = loadAutoConnectConfig()

      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // loadDeviceId() 测试
  // ==========================================================================
  describe('loadDeviceId()', () => {
    it('文件存在且有内容 → 返回去空格后的设备 ID', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('  device-abc-123  \n')

      const result = loadDeviceId()

      expect(result).toBe('device-abc-123')
    })

    it('文件不存在 → 返回 null', () => {
      mockExistsSync.mockReturnValue(false)

      const result = loadDeviceId()

      expect(result).toBeNull()
    })

    it('读取时抛出异常 → 返回 null', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => { throw new Error('Permission denied') })

      const result = loadDeviceId()

      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // start() 测试
  // ==========================================================================
  describe('start()', () => {
    it('基本启动流程：启动 pipe server，进入待机模式', async () => {
      await start()

      // pipe server 被创建并启动
      expect(MockPipeServer).toHaveBeenCalledTimes(1)
      expect(mockPipeServerStart).toHaveBeenCalledTimes(1)
      // 未启用自动连接时，不应初始化信令客户端和会话监控
      expect(MockSignalingClient).not.toHaveBeenCalled()
      expect(MockSessionMonitor).not.toHaveBeenCalled()
    })

    it('isRunning 守卫：已运行时再次调用 start() 应直接返回 undefined', async () => {
      await start()
      mockPipeServerStart.mockClear()

      const result = await start()

      // 已运行，pipe server 不应再次启动
      expect(result).toBeUndefined()
      expect(mockPipeServerStart).not.toHaveBeenCalled()
    })

    it('重复调用返回同一个 Promise（_startPromise 互斥锁）', async () => {
      // 第一次调用创建 Promise
      const p1 = start()
      // 第二次调用在 _startPromise 存在时，应返回同一个 Promise
      const p2 = start()

      expect(p1).toBe(p2)

      await p1
    })
  })

  // ==========================================================================
  // stop() 测试
  // ==========================================================================
  describe('stop()', () => {
    it('基本停止流程：停止 pipe server', async () => {
      await start() // 先启动
      mockPipeServerStop.mockClear()

      await stop()

      expect(mockPipeServerStop).toHaveBeenCalledTimes(1)
    })

    it('!isRunning 守卫：未运行时调用 stop() 应直接返回 undefined', async () => {
      // beforeEach 已调用 stop()，此时 isRunning 为 false
      const result = await stop()

      expect(result).toBeUndefined()
      expect(mockPipeServerStop).not.toHaveBeenCalled()
    })

    it('重复调用返回同一个 Promise（_stopPromise 互斥锁）', async () => {
      await start() // 先启动

      // 第一次调用创建 Promise
      const p1 = stop()
      // 第二次调用在 _stopPromise 存在时，应返回同一个 Promise
      const p2 = stop()

      expect(p1).toBe(p2)

      await p1
    })
  })

  // ==========================================================================
  // 并发 start() 测试
  // ==========================================================================
  describe('并发调用 start()', () => {
    it('多次同步调用 start() 不会导致状态不一致', async () => {
      // 同步发起 5 次 start() 调用
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(start())
      }

      await Promise.all(promises)

      // pipe server 只应启动一次
      expect(mockPipeServerStart).toHaveBeenCalledTimes(1)
      // MockPipeServer 只应实例化一次
      expect(MockPipeServer).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // 并发 stop() 测试
  // ==========================================================================
  describe('并发调用 stop()', () => {
    it('多次同步调用 stop() 不会导致状态不一致', async () => {
      await start() // 先启动
      mockPipeServerStop.mockClear()

      // 同步发起 5 次 stop() 调用
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(stop())
      }

      await Promise.all(promises)

      // pipe server 只应停止一次
      expect(mockPipeServerStop).toHaveBeenCalledTimes(1)
    })
  })
})

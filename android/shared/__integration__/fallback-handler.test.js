/**
 * YCDesk - FallbackHandler 降级处理测试
 *
 * 测试辅助通道降级策略的完整处理流程：
 * 通道故障 → FallbackHandler 检测 → 执行降级策略 → 用户通知 → 自动重试
 *
 * 覆盖场景:
 *   1. 手动复制策略执行
 *   2. 禁用策略执行
 *   3. 用户通知生成与取消
 *   4. 自动重试调度与取消
 *   5. 事件监听与发射
 *   6. 通道关闭后的重连触发
 *   7. 重置与销毁清理
 *   8. 未知通道类型处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { FallbackHandler, FallbackStrategy } = require('../fallback-handler.js')

describe('FallbackHandler 降级处理', () => {
  let handler

  beforeEach(() => {
    handler = new FallbackHandler({ logger: console })
  })

  afterEach(() => {
    handler.destroy()
  })

  // ---------- 1. 手动复制策略 ----------
  it('剪贴板故障应执行手动复制降级策略', () => {
    const events = []
    handler.on('manual-mode-enabled', (data) => events.push(data))
    handler.on('fallback-executed', (data) => events.push(data))

    handler.handleFallback('clipboard', new Error('通道不可用'))

    expect(handler.getFallbackStatus('clipboard')).toBeDefined()
    expect(handler.getFallbackStatus('clipboard').strategy).toBe(FallbackStrategy.MANUAL_COPY)
    expect(events.some(e => e.channelType === 'clipboard')).toBe(true)
  })

  // ---------- 2. 禁用策略 ----------
  it('文件传输故障应执行禁用降级策略', () => {
    const events = []
    handler.on('feature-disabled', (data) => events.push(data))

    handler.handleFallback('file-transfer', new Error('文件传输故障'))

    const status = handler.getFallbackStatus('file-transfer')
    expect(status.strategy).toBe(FallbackStrategy.DISABLED)
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  // ---------- 3. 用户通知 ----------
  it('降级后应生成用户通知并可取消', () => {
    const notifications = []
    handler.on('user-notification', (n) => notifications.push(n))

    handler.handleFallback('clipboard', new Error('通道不可用'))

    const allNotifications = handler.getUserNotifications()
    expect(allNotifications.length).toBeGreaterThanOrEqual(1)
    expect(allNotifications[0].message).toContain('剪贴板')
    expect(allNotifications[0].dismissible).toBe(true)

    // 取消通知
    handler.dismissNotification('clipboard')
    expect(handler.getUserNotifications().length).toBe(0)
  })

  // ---------- 4. 自动重试调度 ----------
  it('可重试的通道故障应调度自动重试', async () => {
    const mockManager = {
      on: vi.fn(),
      off: vi.fn(),
      loadChannel: vi.fn().mockRejectedValue(new Error('重试失败'))
    }
    handler.setAuxiliaryChannelManager(mockManager)

    // 触发剪贴板降级（autoRetryDelay: 30000）
    handler.handleFallback('clipboard', new Error('通道不可用'))

    // 验证自动重试已调度
    expect(handler.autoRetryTimers.has('clipboard')).toBe(true)
  })

  // ---------- 5. 重试成功后状态清理 ----------
  it('重试成功后应清除降级状态和通知', async () => {
    const mockManager = {
      on: vi.fn(),
      off: vi.fn(),
      loadChannel: vi.fn().mockResolvedValue()
    }
    handler.setAuxiliaryChannelManager(mockManager)

    handler.handleFallback('file-transfer', new Error('传输故障'))

    // 手动触发重试
    await handler.attemptRetry('file-transfer')

    // 状态应被清除
    expect(handler.getFallbackStatus('file-transfer')).toBeUndefined()
  })

  // ---------- 6. 取消自动重试 ----------
  it('应能取消指定通道的自动重试', () => {
    handler.handleFallback('clipboard', new Error('通道不可用'))

    expect(handler.autoRetryTimers.has('clipboard')).toBe(true)

    handler.cancelAutoRetry('clipboard')
    expect(handler.autoRetryTimers.has('clipboard')).toBe(false)
  })

  // ---------- 7. 事件监听与取消 ----------
  it('应能添加和移除事件监听器', () => {
    const callback = vi.fn()

    handler.on('fallback-executed', callback)
    handler.handleFallback('audio', new Error('音频不可用'))

    expect(callback).toHaveBeenCalledTimes(1)

    handler.off('fallback-executed', callback)
    handler.handleFallback('clipboard', new Error('再次测试'))

    // 移除后不应再触发
    expect(callback).toHaveBeenCalledTimes(1)
  })

  // ---------- 8. 未知通道类型 ----------
  it('未知通道类型不应崩溃', () => {
    expect(() => {
      handler.handleFallback('unknown-type', new Error('未知'))
    }).not.toThrow()
    expect(handler.getAllFallbackStatus()).toEqual({})
  })
})

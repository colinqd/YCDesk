/**
 * YCDesk - AuthManager 流程集成测试
 *
 * 测试密码设置、验证、速率限制和加密流程的完整集成。
 * 使用真实的 Node.js crypto 模块（无需 mock）。
 *
 * 覆盖场景:
 *   1. 设置密码并验证存在
 *   2. 正确密码验证通过
 *   3. 错误密码验证失败
 *   4. 多次失败触发速率限制（锁定）
 *   5. 锁定超时后恢复
 *   6. 清除密码
 *   7. 密码哈希验证
 *   8. 加解密流程
 *   9. Token 生成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// 注意: 该测试直接从 windows/src/main 导入 auth-manager
const auth = require('../auth-manager.js')

describe('AuthManager 流程集成', () => {
  // 每个测试前清除状态
  beforeEach(() => {
    auth.clearPassword()
  })

  // ---------- 1. 设置密码 ----------
  it('应该能设置密码并检测其存在', () => {
    const result = auth.setPassword('MySecurePass123!')
    expect(result).toEqual({ success: true })
    expect(auth.hasPassword()).toBe(true)
    expect(auth.getPassword()).toBe('MySecurePass123!')
  })

  // ---------- 2. 正确密码验证 ----------
  it('正确密码应该验证通过', () => {
    auth.setPassword('correct-password')
    const result = auth.verifyPassword('correct-password')
    expect(result.success).toBe(true)
    expect(result.lockedOut).toBeFalsy()
  })

  // ---------- 3. 错误密码验证 ----------
  it('错误密码应该验证失败', () => {
    auth.setPassword('real-password')
    const result = auth.verifyPassword('wrong-password')
    expect(result.success).toBe(false)
  })

  // ---------- 4. 速率限制 ----------
  it('多次错误密码应触发锁定', () => {
    auth.setPassword('secret')

    // 连续错误 5 次
    for (let i = 0; i < 5; i++) {
      const result = auth.verifyPassword('wrong')
      if (i < 4) {
        expect(result.success).toBe(false)
        expect(result.lockedOut).toBeFalsy()
      }
    }

    // 第 6 次应被锁定
    const lockedResult = auth.verifyPassword('wrong')
    expect(lockedResult.lockedOut).toBe(true)
    expect(lockedResult.success).toBe(false)
  })

  // ---------- 5. 锁定超时 ----------
  it('锁定超时后应该恢复验证能力', async () => {
    vi.useFakeTimers()

    auth.setPassword('secret')

    // 触发锁定
    for (let i = 0; i < 6; i++) {
      auth.verifyPassword('wrong')
    }

    // 验证已锁定
    const locked = auth.verifyPassword('secret')
    expect(locked.lockedOut).toBe(true)

    // 快进 31 秒（超过 30 秒锁定时间）
    vi.advanceTimersByTime(31000)

    // 锁定应已解除
    const recovered = auth.verifyPassword('secret')
    expect(recovered.lockedOut).toBeFalsy()
    expect(recovered.success).toBe(true)

    vi.useRealTimers()
  })

  // ---------- 6. 清除密码 ----------
  it('清除密码后应返回无密码状态', () => {
    auth.setPassword('temp-password')
    expect(auth.hasPassword()).toBe(true)

    auth.clearPassword()
    expect(auth.hasPassword()).toBe(false)
    expect(auth.getPassword()).toBeNull()

    // 无密码时验证应返回 noPasswordSet
    const result = auth.verifyPassword('anything')
    expect(result.noPasswordSet).toBe(true)
  })

  // ---------- 7. 密码哈希 ----------
  it('密码哈希应该可验证', () => {
    const { salt, hash } = auth.hashPassword('test-password')
    expect(salt).toBeDefined()
    expect(hash).toBeDefined()
    expect(typeof salt).toBe('string')
    expect(typeof hash).toBe('string')

    // 验证正确密码
    const valid = auth.verifyHash('test-password', salt, hash)
    expect(valid).toBe(true)

    // 验证错误密码
    const invalid = auth.verifyHash('wrong-password', salt, hash)
    expect(invalid).toBe(false)
  })

  // ---------- 8. 加解密 ----------
  it('加密数据应该能解密还原', () => {
    auth.setPassword('encrypt-test-password')
    const originalData = { userId: 'USER-01', role: 'controller' }

    const encrypted = auth.encrypt(originalData)
    expect(encrypted.success).toBe(true)
    expect(encrypted.data).toBeDefined()
    expect(encrypted.data.salt).toBeDefined()
    expect(encrypted.data.iv).toBeDefined()
    expect(encrypted.data.tag).toBeDefined()
    expect(encrypted.data.encrypted).toBeDefined()

    const decrypted = auth.decrypt(encrypted.data)
    expect(decrypted.success).toBe(true)
    expect(decrypted.data).toEqual(originalData)
  })

  // ---------- 9. Token 生成 ----------
  it('生成的 token 应该是唯一的十六进制字符串', () => {
    const token1 = auth.generateToken()
    const token2 = auth.generateToken()

    expect(typeof token1).toBe('string')
    expect(token1.length).toBeGreaterThan(10)
    expect(token1).not.toBe(token2)
  })
})

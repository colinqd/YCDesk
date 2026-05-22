/**
 * YCDesk AuthManager 单元测试
 *
 * 测试密码管理、验证、加密解密、令牌生成等功能。
 * auth-manager.js 使用模块级状态，所有测试共享同一实例，
 * 每个测试前通过 clearPassword() 重置状态。
 */

import { describe, it, expect, beforeEach } from 'vitest'

// 从平台代码导入（Windows 和 Linux 版本逻辑相同）
const auth = require('../windows/src/main/auth-manager')

beforeEach(() => {
  auth.clearPassword()
})

// ─── setPassword ───────────────────────────────────────────────────

describe('setPassword', () => {
  it('设置有效密码返回成功', () => {
    const result = auth.setPassword('mypassword')
    expect(result.success).toBe(true)
  })

  it('空密码返回错误', () => {
    const result = auth.setPassword('')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('null 密码返回错误', () => {
    const result = auth.setPassword(null)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('undefined 密码返回错误', () => {
    const result = auth.setPassword(undefined)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('长度不足 4 位的密码返回错误', () => {
    const result = auth.setPassword('abc')
    expect(result.success).toBe(false)
    expect(result.error).toContain('至少')
  })

  it('长度为 4 的密码应成功', () => {
    const result = auth.setPassword('abcd')
    expect(result.success).toBe(true)
  })

  it('覆盖已设置的密码', () => {
    auth.setPassword('first')
    const result = auth.setPassword('second')
    expect(result.success).toBe(true)
    expect(auth.getPassword()).toBe('second')
  })
})

// ─── getPassword / hasPassword ──────────────────────────────────────

describe('getPassword / hasPassword', () => {
  it('未设置时 getPassword 返回 null', () => {
    expect(auth.getPassword()).toBeNull()
  })

  it('设置后 getPassword 返回密码明文', () => {
    auth.setPassword('secret123')
    expect(auth.getPassword()).toBe('secret123')
  })

  it('未设置时 hasPassword 返回 false', () => {
    expect(auth.hasPassword()).toBe(false)
  })

  it('设置后 hasPassword 返回 true', () => {
    auth.setPassword('secret123')
    expect(auth.hasPassword()).toBe(true)
  })
})

// ─── clearPassword ─────────────────────────────────────────────────

describe('clearPassword', () => {
  it('清除后 getPassword 返回 null', () => {
    auth.setPassword('secret123')
    auth.clearPassword()
    expect(auth.getPassword()).toBeNull()
  })

  it('清除后 hasPassword 返回 false', () => {
    auth.setPassword('secret123')
    auth.clearPassword()
    expect(auth.hasPassword()).toBe(false)
  })

  it('重复清除不报错', () => {
    auth.setPassword('secret123')
    auth.clearPassword()
    auth.clearPassword()
    expect(auth.getPassword()).toBeNull()
  })
})

// ─── verifyPassword ────────────────────────────────────────────────

describe('verifyPassword', () => {
  it('未设置密码时直接通过并标记 noPasswordSet', () => {
    const result = auth.verifyPassword('anything')
    expect(result.success).toBe(true)
    expect(result.noPasswordSet).toBe(true)
  })

  it('正确密码验证通过', () => {
    auth.setPassword('correct')
    const result = auth.verifyPassword('correct')
    expect(result.success).toBe(true)
  })

  it('错误密码返回失败信息', () => {
    auth.setPassword('correct')
    const result = auth.verifyPassword('wrong')
    expect(result.success).toBe(false)
    expect(result.error).toContain('密码错误')
  })

  it('错误密码返回剩余尝试次数', () => {
    auth.setPassword('correct')
    const result = auth.verifyPassword('wrong')
    expect(result.remainingAttempts).toBe(4)
  })

  it('连续 5 次错误密码后触发锁定', () => {
    auth.setPassword('correct')

    for (let i = 0; i < 4; i++) {
      const r = auth.verifyPassword('wrong')
      expect(r.remainingAttempts).toBe(4 - i)
    }

    // 第 5 次 → 锁定
    const locked = auth.verifyPassword('wrong')
    expect(locked.success).toBe(false)
    expect(locked.lockedOut).toBe(true)
    expect(locked.error).toContain('锁定')
  })

  it('锁定期间再次验证仍被锁定', () => {
    auth.setPassword('correct')

    // 触发锁定
    for (let i = 0; i < 5; i++) {
      auth.verifyPassword('wrong')
    }

    // 锁定期间验证
    const result = auth.verifyPassword('correct')
    expect(result.success).toBe(false)
    expect(result.lockedOut).toBe(true)
  })

  it('正确密码重置失败计数和锁定', () => {
    auth.setPassword('correct')

    // 失败 3 次
    for (let i = 0; i < 3; i++) {
      auth.verifyPassword('wrong')
    }

    // 正确密码重置
    const correct = auth.verifyPassword('correct')
    expect(correct.success).toBe(true)

    // 再次失败应从 remainingAttempts=4 开始
    const fail = auth.verifyPassword('wrong')
    expect(fail.remainingAttempts).toBe(4)
  })

  it('不同长度的密码返回错误（不会抛出异常）', () => {
    auth.setPassword('longpassword')
    // timingSafeEqual 要求两个 Buffer 长度相同，已处理为提前返回 false
    expect(() => auth.verifyPassword('short')).not.toThrow()
    const result = auth.verifyPassword('short')
    expect(result.success).toBe(false)
    expect(result.error).toContain('密码错误')
  })
})

// ─── hashPassword / verifyHash ─────────────────────────────────────

describe('hashPassword / verifyHash', () => {
  it('hashPassword 返回 salt 和 hash 字符串', () => {
    const result = auth.hashPassword('mypassword')
    expect(result.salt).toBeDefined()
    expect(result.hash).toBeDefined()
    expect(typeof result.salt).toBe('string')
    expect(typeof result.hash).toBe('string')
  })

  it('salt 长度为 64 个 hex 字符（32 字节）', () => {
    const result = auth.hashPassword('mypassword')
    expect(result.salt.length).toBe(64)
  })

  it('hash 长度为 64 个 hex 字符（32 字节）', () => {
    const result = auth.hashPassword('mypassword')
    expect(result.hash.length).toBe(64)
  })

  it('相同密码每次生成不同的 salt 和 hash', () => {
    const r1 = auth.hashPassword('same')
    const r2 = auth.hashPassword('same')
    expect(r1.salt).not.toBe(r2.salt)
    expect(r1.hash).not.toBe(r2.hash)
  })

  it('verifyHash 对正确密码返回 true', () => {
    const { salt, hash } = auth.hashPassword('mypassword')
    const valid = auth.verifyHash('mypassword', salt, hash)
    expect(valid).toBe(true)
  })

  it('verifyHash 对错误密码返回 false', () => {
    const { salt, hash } = auth.hashPassword('mypassword')
    const valid = auth.verifyHash('wrongpassword', salt, hash)
    expect(valid).toBe(false)
  })

  it('verifyHash 对不同 salt 的相同密码返回 false', () => {
    const { salt, hash } = auth.hashPassword('mypassword')
    // 使用相同的 hash 但不同的 salt（另一个 hash 的结果的 salt）
    const r2 = auth.hashPassword('mypassword')
    const valid = auth.verifyHash('mypassword', r2.salt, hash)
    expect(valid).toBe(false)
  })
})

// ─── encrypt / decrypt ─────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('使用已设置的连接密码加密解密成功', () => {
    auth.setPassword('connectionPass')
    const data = { userId: 1, name: '测试用户' }

    const encrypted = auth.encrypt(data)
    expect(encrypted.success).toBe(true)
    expect(encrypted.data.salt).toBeDefined()
    expect(encrypted.data.iv).toBeDefined()
    expect(encrypted.data.tag).toBeDefined()
    expect(encrypted.data.encrypted).toBeDefined()

    const decrypted = auth.decrypt(encrypted.data)
    expect(decrypted.success).toBe(true)
    expect(decrypted.data).toEqual(data)
  })

  it('使用显式密码加密解密成功', () => {
    const data = { key: 'value', num: 42 }

    const encrypted = auth.encrypt(data, 'explicitPass')
    expect(encrypted.success).toBe(true)

    const decrypted = auth.decrypt(encrypted.data, 'explicitPass')
    expect(decrypted.success).toBe(true)
    expect(decrypted.data).toEqual(data)
  })

  it('未设置密码且未提供密码时加密失败', () => {
    const data = { test: true }
    const result = auth.encrypt(data)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('未设置密码且未提供密码时解密失败', () => {
    const result = auth.decrypt({ salt: 'a', iv: 'b', tag: 'c', encrypted: 'd' })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('错误密码解密失败', () => {
    auth.setPassword('correct')
    const data = { secret: 'data' }
    const encrypted = auth.encrypt(data)

    const decrypted = auth.decrypt(encrypted.data, 'wrong')
    expect(decrypted.success).toBe(false)
    expect(decrypted.error).toBeDefined()
  })

  it('加密不同数据类型', () => {
    auth.setPassword('pass')
    const testCases = [
      { a: 1, b: 'string', c: true },
      [1, 2, 3],
      { nested: { array: [1, 2, 3], obj: { x: 1 } } }
    ]

    for (const tc of testCases) {
      const enc = auth.encrypt(tc)
      expect(enc.success).toBe(true)
      const dec = auth.decrypt(enc.data)
      expect(dec.success).toBe(true)
      expect(dec.data).toEqual(tc)
    }
  })

  it('篡改加密数据后解密失败', () => {
    auth.setPassword('pass')
    const data = { important: 'info' }
    const encrypted = auth.encrypt(data)

    // 篡改加密内容
    const tampered = {
      ...encrypted.data,
      encrypted: encrypted.data.encrypted + 'ff'
    }
    const result = auth.decrypt(tampered)
    expect(result.success).toBe(false)
  })
})

// ─── generateToken ─────────────────────────────────────────────────

describe('generateToken', () => {
  it('返回 64 字符的 hex 字符串', () => {
    const token = auth.generateToken()
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.length).toBe(64)
  })

  it('只包含 0-9 a-f 字符', () => {
    const token = auth.generateToken()
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('每次调用生成不同令牌', () => {
    const t1 = auth.generateToken()
    const t2 = auth.generateToken()
    expect(t1).not.toBe(t2)
  })
})

// ─── createAuthMessage / verifyAuthMessage ─────────────────────────

describe('createAuthMessage', () => {
  it('创建包含 type 字段的消息', () => {
    const msg = auth.createAuthMessage('auth-challenge', { nonce: 'abc' })
    expect(msg.type).toBe('auth-challenge')
  })

  it('消息包含 timestamp 字段', () => {
    const msg = auth.createAuthMessage('auth-response', {})
    expect(msg.timestamp).toBeDefined()
    expect(typeof msg.timestamp).toBe('number')
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('消息包含 token 字段', () => {
    const msg = auth.createAuthMessage('test', {})
    expect(msg.token).toBeDefined()
    expect(typeof msg.token).toBe('string')
    expect(msg.token.length).toBe(64)
  })

  it('消息包含 data 字段', () => {
    const msg = auth.createAuthMessage('test', { foo: 'bar' })
    expect(msg.data).toEqual({ foo: 'bar' })
  })

  it('消息时间戳接近当前时间', () => {
    const before = Date.now()
    const msg = auth.createAuthMessage('test', {})
    const after = Date.now()
    expect(msg.timestamp).toBeGreaterThanOrEqual(before)
    expect(msg.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('verifyAuthMessage', () => {
  it('有效消息验证通过', () => {
    const msg = auth.createAuthMessage('test', {})
    expect(auth.verifyAuthMessage(msg)).toBe(true)
  })

  it('超时消息验证失败', () => {
    const msg = auth.createAuthMessage('test', {})
    // 设置一个非常早的时间戳
    msg.timestamp = Date.now() - 60000 // 60秒前
    expect(auth.verifyAuthMessage(msg, 30000)).toBe(false)
  })

  it('未来时间戳验证失败', () => {
    const msg = auth.createAuthMessage('test', {})
    msg.timestamp = Date.now() + 10000 // 10秒后
    expect(auth.verifyAuthMessage(msg)).toBe(false)
  })

  it('null 消息验证失败', () => {
    expect(auth.verifyAuthMessage(null)).toBe(false)
  })

  it('不含 timestamp 的消息验证失败', () => {
    expect(auth.verifyAuthMessage({ token: 'abc' })).toBe(false)
  })

  it('不含 token 的消息验证失败', () => {
    expect(auth.verifyAuthMessage({ timestamp: Date.now() })).toBe(false)
  })

  it('自定义 maxAge 参数', () => {
    const msg = auth.createAuthMessage('test', {})
    // 20秒前的消息，maxAge=10000 应失败
    msg.timestamp = Date.now() - 20000
    expect(auth.verifyAuthMessage(msg, 10000)).toBe(false)
    // maxAge=30000 应通过
    expect(auth.verifyAuthMessage(msg, 30000)).toBe(true)
  })
})

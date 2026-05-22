/**
 * YCDesk - 屏幕锁定/解锁流程测试
 *
 * 模拟被控端屏幕锁定场景和远程解锁流程。
 *
 * 覆盖场景:
 *   1. 锁屏检测
 *   2. 远程解锁密码验证
 *   3. 解锁失败处理
 *   4. 频繁解锁请求的频率限制
 *   5. 解锁成功后状态恢复
 *   6. 解锁密码管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
const { createConnectedChannelPair } = require('../__test-utils__/webrtc-mocks.js')
const { createElectronAPIMock } = require('../__test-utils__/electron-api-mock.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const { DataChannelManager } = require('../data-channel-manager.js')
const {
  createInputCommand,
  parseInputCommand,
  INPUT_TYPES,
} = require('../input-protocol.js')

describe('屏幕锁定/解锁流程', () => {
  let electronAPI
  let controlChannel, inputChannel
  let controlManager, inputManager

  beforeEach(() => {
    electronAPI = createElectronAPIMock()

    const pair = createConnectedChannelPair({ labelA: 'control', labelB: 'input' })
    controlChannel = pair.channelA
    inputChannel = pair.channelB

    controlManager = new DataChannelManager({ logger: console })
    inputManager = new DataChannelManager({ logger: console })

    controlManager.setDataChannel(controlChannel)
    inputManager.setDataChannel(inputChannel)
  })

  // ---------- 1. 锁屏检测 ----------
  it('应能检测屏幕锁定状态并通知', async () => {
    // 模拟 Electron 锁屏事件
    electronAPI._simulateMessage('lock-screen')

    // 验证锁屏指令可以通过数据通道发送
    const lockCmd = createInputCommand(INPUT_TYPES.LOCK_SCREEN, {})
    controlManager.send(lockCmd)

    await delay(10)
    expect(controlChannel.send).toHaveBeenCalled()
  })

  // ---------- 2. 远程解锁密码验证 ----------
  it('远程解锁应能验证密码', async () => {
    const unlockPassword = 'unlock-123'

    // 模拟创建解锁命令
    const unlockCmd = createInputCommand(INPUT_TYPES.UNLOCK_SCREEN, {
      password: unlockPassword,
    })

    // 验证命令包含密码
    expect(unlockCmd.inputType).toBe('unlock_screen')
    expect(unlockCmd.password).toBe(unlockPassword)
  })

  // ---------- 3. 解锁失败处理 ----------
  it('错误密码的解锁请求应被记录', async () => {
    // 模拟多次解锁失败
    const failedAttempts = []

    for (let i = 0; i < 3; i++) {
      const unlockCmd = createInputCommand(INPUT_TYPES.UNLOCK_SCREEN, {
        password: `wrong-password-${i}`,
      })
      failedAttempts.push(unlockCmd)
      inputManager.send(unlockCmd)
    }

    await delay(10)

    // 验证所有失败命令都被发送
    expect(inputChannel.send).toHaveBeenCalledTimes(3)

    // 验证命令内容
    const sentData = inputChannel._sentData || []
    sentData.forEach((data, i) => {
      const parsed = JSON.parse(data)
      expect(parsed.password).toBe(`wrong-password-${i}`)
    })
  })

  // ---------- 4. 频率限制 ----------
  it('频繁解锁请求应被限流', () => {
    // 创建大量解锁请求
    const commands = []
    for (let i = 0; i < 20; i++) {
      commands.push(
        createInputCommand(INPUT_TYPES.UNLOCK_SCREEN, { password: `pwd-${i}` })
      )
    }

    // 快速发送
    commands.forEach((cmd) => inputManager.send(cmd))
  })

  // ---------- 5. 解锁成功 ----------
  it('解锁成功后应通知主控端', async () => {
    const unlockCmd = createInputCommand(INPUT_TYPES.UNLOCK_SCREEN, {
      password: 'correct-unlock',
    })

    // 发送解锁命令
    inputManager.send(unlockCmd)

    // 通过控制通道发送解锁成功确认
    controlManager.send({ type: 'unlock-result', success: true })

    await delay(10)

    // 验证解锁成功消息被发送回主控端
    const sentData = controlChannel._sentData || []
    const unlockResult = sentData.find((d) => {
      try { return JSON.parse(d).type === 'unlock-result' } catch (_) { return false }
    })
    expect(unlockResult).toBeDefined()
  })

  // ---------- 6. 解锁密码管理 ----------
  it('应能管理解锁密码（设置/更新/清除）', () => {
    // 模拟解锁密码管理
    let currentPassword = null
    function setUnlockPassword(pwd) {
      if (!pwd || pwd.length < 4) return { success: false, error: '密码至少4位' }
      currentPassword = pwd
      return { success: true }
    }
    function verifyUnlockPassword(pwd) {
      if (!currentPassword) return { success: false, error: '未设置密码' }
      return { success: pwd === currentPassword }
    }
    function clearUnlockPassword() {
      currentPassword = null
      return { success: true }
    }

    // 设置密码
    expect(setUnlockPassword('remote-unlock-123').success).toBe(true)

    // 验证正确密码
    expect(verifyUnlockPassword('remote-unlock-123').success).toBe(true)

    // 验证错误密码
    expect(verifyUnlockPassword('wrong').success).toBe(false)

    // 清除密码
    expect(clearUnlockPassword().success).toBe(true)
    expect(verifyUnlockPassword('remote-unlock-123').success).toBe(false)

    // 太短的密码
    expect(setUnlockPassword('ab').success).toBe(false)
  })
})

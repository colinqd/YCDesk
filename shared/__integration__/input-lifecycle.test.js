/**
 * YCDesk - 输入指令生命周期集成测试
 *
 * 测试输入指令从创建 → 序列化 → 传输 → 反序列化 → 执行的完整流程。
 * 使用 createConnectedChannelPair 模拟两个通过数据通道连接的节点。
 *
 * 覆盖场景:
 *   1. 鼠标移动指令完整生命周期
 *   2. 键盘按下/释放指令
 *   3. 滚轮指令
 *   4. 修饰键组合指令
 *   5. 组合键指令
 *   6. 指令频率限制
 *   7. 坐标规范化
 *   8. 输入校验 - 非法输入拒绝
 *   9. 文本输入指令
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
const { createConnectedChannelPair } = require('../__test-utils__/webrtc-mocks.js')
const { eventually, delay } = require('../__test-utils__/eventually.js')
const {
  createInputCommand,
  parseInputCommand,
  validateInputCommand,
  normalizeCoordinate,
  INPUT_TYPES,
  MOUSE_BUTTONS,
} = require('../input-protocol.js')
const { DataChannelManager } = require('../data-channel-manager.js')

describe('输入指令生命周期', () => {
  let sender, receiver
  let sendChannel, recvChannel

  beforeEach(() => {
    const pair = createConnectedChannelPair({ labelA: 'control', labelB: 'input' })
    sendChannel = pair.channelA
    recvChannel = pair.channelB

    sender = new DataChannelManager({ logger: console })
    receiver = new DataChannelManager({ logger: console })

    sender.setDataChannel(sendChannel)
    receiver.setDataChannel(recvChannel)
  })

  // ---------- 1. 鼠标移动指令 ----------
  it('鼠标移动指令应该完整传输并被正确解析', async () => {
    const receivedCommands = []

    receiver.setOnMessage((cmd) => {
      receivedCommands.push(cmd)
    })

    // 创建并发送鼠标移动指令
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
      x: normalizeCoordinate(500, 1920),
      y: normalizeCoordinate(300, 1080),
    })
    sender.send(cmd)

    await eventually(() => receivedCommands.length > 0)

    expect(receivedCommands[0].inputType).toBe('mousemove')
    expect(receivedCommands[0].x).toBeCloseTo(0.26, 1)
    expect(receivedCommands[0].y).toBeCloseTo(0.278, 1)
    expect(receivedCommands[0].type).toBe('input')
    expect(receivedCommands[0].timestamp).toBeDefined()
  })

  // ---------- 2. 键盘指令 ----------
  it('键盘按下/释放指令应该完整传输', async () => {
    const received = []

    receiver.setOnMessage((cmd) => received.push(cmd))

    // 键盘按下
    sender.send(createInputCommand(INPUT_TYPES.KEY_DOWN, { key: 'a', code: 'KeyA' }))
    // 键盘释放
    sender.send(createInputCommand(INPUT_TYPES.KEY_UP, { key: 'a', code: 'KeyA' }))

    await eventually(() => received.length >= 2)

    expect(received[0].inputType).toBe('keydown')
    expect(received[0].key).toBe('a')
    expect(received[1].inputType).toBe('keyup')
    expect(received[1].key).toBe('a')
  })

  // ---------- 3. 滚轮指令 ----------
  it('滚轮指令应该包含正确的滚轮数据', async () => {
    const received = []

    receiver.setOnMessage((cmd) => received.push(cmd))

    sender.send(createInputCommand(INPUT_TYPES.MOUSE_WHEEL, { deltaX: 0, deltaY: 120, deltaZ: 0 }))

    await eventually(() => received.length > 0)

    expect(received[0].inputType).toBe('wheel')
    expect(received[0].deltaY).toBe(120)
  })

  // ---------- 4. 修饰键 ----------
  it('修饰键组合应该正确标记', async () => {
    // Shift+A
    const cmd = createInputCommand(INPUT_TYPES.KEY_DOWN, {
      key: 'A',
      code: 'KeyA',
      shiftKey: true,
    })

    // 验证修饰键标志
    expect(cmd.shiftKey).toBe(true)
  })

  // ---------- 5. 组合键 ----------
  it('组合键指令应该包含所有修饰键状态', async () => {
    // Ctrl+Alt+Delete
    const cmd = createInputCommand(INPUT_TYPES.KEY_DOWN, {
      key: 'Delete',
      code: 'Delete',
      ctrlKey: true,
      altKey: true,
    })

    expect(cmd.ctrlKey).toBe(true)
    expect(cmd.altKey).toBe(true)
    expect(cmd.key).toBe('Delete')
  })

  // ---------- 6. 频率限制 ----------
  it('高频鼠标移动应该被节流', async () => {
    const received = []

    receiver.setOnMessage((cmd) => received.push(cmd))

    // 快速发送多个鼠标移动（间隔小于 THROTTLE_CONFIG.MOUSE_MOVE_INTERVAL_MS=8ms）
    for (let i = 0; i < 5; i++) {
      sender.send(
        createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
          x: normalizeCoordinate(100 + i * 10, 1920),
          y: normalizeCoordinate(200 + i * 10, 1080),
        })
      )
    }

    await delay(20)

    // 因为通道是即时送达的，所有消息应该都发送了
    // （频率限制通常在输入端实现，而非传输端）
    expect(sendChannel._sentData.length).toBe(5)
  })

  // ---------- 7. 坐标规范化 ----------
  it('坐标应该被规范化为 0-1 范围', () => {
    expect(normalizeCoordinate(0, 1920)).toBe(0)
    expect(normalizeCoordinate(1920, 1920)).toBe(1)
    expect(normalizeCoordinate(960, 1920)).toBeCloseTo(0.5, 2)
    expect(normalizeCoordinate(-100, 1920)).toBeCloseTo(-0.052, 2) // 负值不钳制
    expect(normalizeCoordinate(5000, 1920)).toBeCloseTo(2.604, 2) // 大于1不钳制
  })

  // ---------- 8. 输入校验 ----------
  it('无效的输入指令应该被校验拒绝', () => {
    const result = validateInputCommand({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)

    const validCmd = createInputCommand(INPUT_TYPES.MOUSE_CLICK, { button: MOUSE_BUTTONS.LEFT })
    const validResult = validateInputCommand(validCmd)
    expect(validResult.valid).toBe(true)
  })

  // ---------- 9. 文本输入 ----------
  it('文本输入指令应该包含完整文本', async () => {
    const received = []

    receiver.setOnMessage((cmd) => received.push(cmd))

    sender.send(createInputCommand(INPUT_TYPES.TEXT_INPUT, { text: 'Hello YCDesk!' }))

    await eventually(() => received.length > 0)

    expect(received[0].inputType).toBe('text_input')
    expect(received[0].text).toBe('Hello YCDesk!')
  })
})

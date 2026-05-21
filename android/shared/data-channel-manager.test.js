/**
 * YCDesk DataChannel 管理器单元测试
 *
 * 测试 DataChannelManager 的队列、重发、事件处理等功能
 * 使用模拟的 DataChannel 对象（RTCDataChannel 在 Node.js 中不可用）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// 动态导入 DataChannelManager（CJS 模块）
const { DataChannelManager, DATA_CHANNEL_STATE } = require('./data-channel-manager.js')

/**
 * 创建模拟 DataChannel 对象
 */
function createMockChannel(initialState = 'open') {
  const listeners = {}
  return {
    readyState: initialState,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // 事件注册属性（DataChannelManager 直接赋值 onxxx）
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    onbufferedamountlow: null
  }
}

// ==================== 常量 ====================

describe('DATA_CHANNEL_STATE 常量', () => {
  it('CONNECTING 为 connecting', () => {
    expect(DATA_CHANNEL_STATE.CONNECTING).toBe('connecting')
  })

  it('OPEN 为 open', () => {
    expect(DATA_CHANNEL_STATE.OPEN).toBe('open')
  })

  it('CLOSING 为 closing', () => {
    expect(DATA_CHANNEL_STATE.CLOSING).toBe('closing')
  })

  it('CLOSED 为 closed', () => {
    expect(DATA_CHANNEL_STATE.CLOSED).toBe('closed')
  })
})

// ==================== 初始化 ====================

describe('DataChannelManager 初始化', () => {
  let manager

  beforeEach(() => {
    manager = new DataChannelManager()
  })

  it('初始 dataChannel 为 null', () => {
    expect(manager.dataChannel).toBeNull()
  })

  it('初始消息队列为空', () => {
    expect(manager.messageQueue).toEqual([])
  })

  it('默认 maxRetries 为 3', () => {
    expect(manager.options.maxRetries).toBe(3)
  })

  it('默认 retryInterval 为 1000', () => {
    expect(manager.options.retryInterval).toBe(1000)
  })

  it('默认 maxQueueSize 为 100', () => {
    expect(manager.options.maxQueueSize).toBe(100)
  })

  it('isOpen 返回 null（无通道）', () => {
    expect(manager.isOpen()).toBeNull()
  })

  it('getReadyState 返回 closed（无通道）', () => {
    expect(manager.getReadyState()).toBe('closed')
  })

  it('getBufferedAmount 返回 0（无通道）', () => {
    expect(manager.getBufferedAmount()).toBe(0)
  })
})

describe('DataChannelManager 自定义选项', () => {
  it('可以传入自定义选项覆盖默认值', () => {
    const manager = new DataChannelManager({
      maxRetries: 5,
      retryInterval: 2000,
      maxQueueSize: 200
    })
    expect(manager.options.maxRetries).toBe(5)
    expect(manager.options.retryInterval).toBe(2000)
    expect(manager.options.maxQueueSize).toBe(200)
  })
})

// ==================== setDataChannel ====================

describe('setDataChannel', () => {
  let manager

  beforeEach(() => {
    manager = new DataChannelManager()
  })

  it('设置通道后 dataChannel 不为 null', () => {
    const mock = createMockChannel('open')
    manager.setDataChannel(mock)
    expect(manager.dataChannel).toBe(mock)
  })

  it('通道 open 状态下自动刷新队列', () => {
    const mock = createMockChannel('open')
    manager.messageQueue.push({ message: { test: true }, requireAck: false })
    manager.setDataChannel(mock)
    // sendRaw 被调用（队列刷新）
    expect(mock.send).toHaveBeenCalled()
    expect(manager.messageQueue.length).toBe(0)
  })

  it('通道非 open 状态不刷新队列', () => {
    const mock = createMockChannel('connecting')
    manager.messageQueue.push({ message: { test: true }, requireAck: false })
    manager.setDataChannel(mock)
    expect(mock.send).not.toHaveBeenCalled()
  })

  it('注册事件处理函数', () => {
    const mock = createMockChannel('open')
    manager.setDataChannel(mock)
    expect(typeof mock.onopen).toBe('function')
    expect(typeof mock.onclose).toBe('function')
    expect(typeof mock.onerror).toBe('function')
    expect(typeof mock.onmessage).toBe('function')
    expect(typeof mock.onbufferedamountlow).toBe('function')
  })

  it('替换通道时移除旧通道的监听器', () => {
    const oldMock = createMockChannel('open')
    manager.setDataChannel(oldMock)
    const oldOnOpen = oldMock.onopen

    const newMock = createMockChannel('open')
    manager.setDataChannel(newMock)

    // 旧通道的监听器应被置空
    expect(oldMock.onopen).toBeNull()
    // 新通道有监听器
    expect(typeof newMock.onopen).toBe('function')
  })
})

// ==================== send ====================

describe('send', () => {
  let manager
  let mockChannel

  beforeEach(() => {
    manager = new DataChannelManager()
    mockChannel = createMockChannel('open')
    manager.setDataChannel(mockChannel)
  })

  it('通道开启时发送消息', () => {
    const result = manager.send({ type: 'test', data: 'hello' })
    expect(result).toBe(true)
    expect(mockChannel.send).toHaveBeenCalled()
  })

  it('发送消息包含时间戳', () => {
    manager.send({ type: 'test' })
    const sent = JSON.parse(mockChannel.send.mock.calls[0][0])
    expect(sent).toHaveProperty('timestamp')
    expect(typeof sent.timestamp).toBe('number')
  })

  it('通道关闭时消息入队', () => {
    mockChannel.readyState = 'closed'
    const result = manager.send({ type: 'test' })
    expect(result).toBe(false)
    expect(manager.messageQueue.length).toBe(1)
  })

  it('requireAck 为 true 时添加消息 ID', () => {
    manager.send({ type: 'test' }, true)
    const sent = JSON.parse(mockChannel.send.mock.calls[0][0])
    expect(sent).toHaveProperty('id')
    expect(typeof sent.id).toBe('number')
  })

  it('requireAck 消息进入待确认队列', () => {
    manager.send({ type: 'test' }, true)
    expect(manager.pendingMessages.size).toBe(1)
  })

  it('requireAck 为 false 时无消息 ID', () => {
    manager.send({ type: 'test' }, false)
    const sent = JSON.parse(mockChannel.send.mock.calls[0][0])
    expect(sent).not.toHaveProperty('id')
  })
})

// ==================== enqueue / flushQueue ====================

describe('消息队列', () => {
  let manager

  beforeEach(() => {
    manager = new DataChannelManager({ maxQueueSize: 3 })
  })

  it('入队消息可被取出', () => {
    manager.enqueue({ test: true }, false)
    expect(manager.messageQueue.length).toBe(1)
  })

  it('队列满时丢弃最早的消息', () => {
    manager.enqueue({ id: 1 }, false)
    manager.enqueue({ id: 2 }, false)
    manager.enqueue({ id: 3 }, false)
    manager.enqueue({ id: 4 }, false) // 超过 maxQueueSize=3

    expect(manager.messageQueue.length).toBe(3)
    expect(manager.messageQueue[0].message.id).toBe(2) // id:1 被丢弃
  })

  it('flushQueue 发送队列中所有消息', () => {
    const mock = createMockChannel('open')
    manager.setDataChannel(mock)
    manager.messageQueue.push({ message: { a: 1 }, requireAck: false })
    manager.messageQueue.push({ message: { b: 2 }, requireAck: false })

    manager.flushQueue()
    expect(mock.send).toHaveBeenCalledTimes(2)
    expect(manager.messageQueue.length).toBe(0)
  })

  it('通道关闭时 flushQueue 不发送', () => {
    const mock = createMockChannel('closed')
    manager.setDataChannel(mock)
    manager.messageQueue.push({ message: { a: 1 }, requireAck: false })
    manager.flushQueue()
    expect(mock.send).not.toHaveBeenCalled()
  })
})

// ==================== handleMessage ====================

describe('handleMessage', () => {
  let manager
  let receivedMessages

  beforeEach(() => {
    manager = new DataChannelManager()
    receivedMessages = []
    manager.setOnMessage(msg => receivedMessages.push(msg))
  })

  it('收到数据时触发 onMessage 回调', () => {
    const data = { type: 'video', data: 'frame' }
    manager.handleMessage({ data: JSON.stringify(data) })
    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].type).toBe('video')
  })

  it('收到 ack 时清理 pending 消息', () => {
    manager.send({ type: 'test' }, true)
    const messageId = manager.pendingMessages.keys().next().value

    manager.handleMessage({ data: JSON.stringify({ ack: true, ackId: messageId }) })

    expect(manager.pendingMessages.has(messageId)).toBe(false)
  })

  it('无效 JSON 不触发回调', () => {
    manager.handleMessage({ data: 'not-json' })
    expect(receivedMessages.length).toBe(0)
  })

  it('自动发送 ack（消息含 id 且不是 ack 本身）', () => {
    const mock = createMockChannel('open')
    manager.setDataChannel(mock)

    manager.handleMessage({ data: JSON.stringify({ id: 42, type: 'data' }) })

    // 应该发送 ack 回复
    const lastCall = JSON.parse(mock.send.mock.calls[mock.send.mock.calls.length - 1][0])
    expect(lastCall.ack).toBe(true)
    expect(lastCall.ackId).toBe(42)
  })
})

// ==================== 事件回调 ====================

describe('事件回调', () => {
  let manager
  let mockChannel

  beforeEach(() => {
    manager = new DataChannelManager()
    mockChannel = createMockChannel('connecting')
    manager.setDataChannel(mockChannel)
  })

  it('onOpen 触发时刷新队列', () => {
    manager.messageQueue.push({ message: { test: true }, requireAck: false })
    // 模拟真实场景：onopen 触发时 readyState 已变为 'open'
    mockChannel.readyState = 'open'
    mockChannel.onopen()
    expect(mockChannel.send).toHaveBeenCalled()
  })

  it('onOpen 触发自定义回调', () => {
    let opened = false
    manager.setOnOpen(() => { opened = true })
    mockChannel.onopen()
    expect(opened).toBe(true)
  })

  it('onClose 触发自定义回调', () => {
    let closed = false
    manager.setOnClose(() => { closed = true })
    mockChannel.onclose()
    expect(closed).toBe(true)
  })

  it('onError 触发自定义回调', () => {
    let lastError = null
    manager.setOnError(e => { lastError = e })
    mockChannel.onerror(new Error('test error'))
    expect(lastError).toBeInstanceOf(Error)
    expect(lastError.message).toBe('test error')
  })
})

// ==================== close / reset / destroy ====================

describe('清理操作', () => {
  let manager
  let mockChannel

  beforeEach(() => {
    manager = new DataChannelManager()
    mockChannel = createMockChannel('open')
    manager.setDataChannel(mockChannel)
    manager.send({ type: 'test' }, true) // 添加 pending 消息
    manager.messageQueue.push({ message: { q: 1 }, requireAck: false })
  })

  it('close 清空队列并关闭通道', () => {
    manager.close()
    expect(manager.messageQueue.length).toBe(0)
    expect(manager.pendingMessages.size).toBe(0)
    expect(mockChannel.close).toHaveBeenCalled()
    expect(manager.dataChannel).toBeNull()
  })

  it('close 移除事件监听', () => {
    manager.close()
    expect(mockChannel.onopen).toBeNull()
    expect(mockChannel.onclose).toBeNull()
    expect(mockChannel.onerror).toBeNull()
    expect(mockChannel.onmessage).toBeNull()
  })

  it('reset 清空并重置 messageIdCounter', () => {
    manager.reset()
    expect(manager.messageIdCounter).toBe(0)
    expect(manager.messageQueue.length).toBe(0)
  })

  it('destroy 清理所有资源', () => {
    manager.destroy()
    expect(manager.dataChannel).toBeNull()
    expect(manager.callbacks).toEqual({})
    expect(manager.options).toBeNull()
  })
})

// ==================== 集成场景 ====================

describe('集成场景', () => {
  it('发送 → ack 确认 → 自动重发超限后放弃', async () => {
    const manager = new DataChannelManager({ maxRetries: 1, retryInterval: 10 })
    const mock = createMockChannel('open')
    manager.setDataChannel(mock)

    // 发送需确认的消息
    manager.send({ type: 'important' }, true)
    const messageId = manager.pendingMessages.keys().next().value
    expect(manager.pendingMessages.size).toBe(1)

    // 等待重发（maxRetries=1 意味着重试 1 次后放弃）
    await new Promise(resolve => setTimeout(resolve, 50))

    // 因为从未发送 ack，重试超限后消息被移除
    expect(manager.pendingMessages.size).toBe(0)
  })

  it('多消息队列 + 通道恢复后自动发送', () => {
    const manager = new DataChannelManager()
    const mock = createMockChannel('connecting')

    // 通道未开启时发送
    manager.setDataChannel(mock)
    manager.send({ msg: 1 })
    manager.send({ msg: 2 })
    manager.send({ msg: 3 })

    expect(manager.messageQueue.length).toBe(3)
    expect(mock.send).not.toHaveBeenCalled()

    // 通道开启，自动刷新队列
    mock.readyState = 'open'
    mock.onopen()

    expect(mock.send).toHaveBeenCalledTimes(3)
    expect(manager.messageQueue.length).toBe(0)
  })

  it('缓冲数据超限时入队等待', () => {
    const manager = new DataChannelManager()
    const mock = createMockChannel('open')
    mock.bufferedAmount = 1024 * 1024 + 1 // 超过 1MB 阈值
    manager.setDataChannel(mock)

    manager.send({ data: 'large' })

    expect(manager.messageQueue.length).toBe(1)
  })
})

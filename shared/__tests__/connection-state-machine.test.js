const path = require('path')

const modulePath = path.resolve(__dirname, '../connection-state-machine.js')
delete require.cache[modulePath]
const { ConnectionStateMachine, ConnectionState } = require(modulePath)

describe('ConnectionStateMachine', () => {
  let sm

  beforeEach(() => {
    sm = new ConnectionStateMachine()
  })

  describe('初始状态', () => {
    it('初始状态应为 idle', () => {
      expect(sm.getState()).toBe('idle')
    })

    it('初始 previousState 应为 null', () => {
      expect(sm.getPreviousState()).toBeNull()
    })

    it('初始 isConnected 应为 false', () => {
      expect(sm.isConnected()).toBe(false)
    })

    it('初始 isError 应为 false', () => {
      expect(sm.isError()).toBe(false)
    })
  })

  describe('状态转换 — 正常连接流程', () => {
    it('idle -> connecting 应成功', () => {
      expect(sm.transition('connecting')).toBe(true)
      expect(sm.getState()).toBe('connecting')
    })

    it('connecting -> authenticating 应成功', () => {
      sm.transition('connecting')
      expect(sm.transition('authenticating')).toBe(true)
    })

    it('authenticating -> negotiating 应成功', () => {
      sm.transition('connecting')
      sm.transition('authenticating')
      expect(sm.transition('negotiating')).toBe(true)
    })

    it('negotiating -> creating-channel 应成功', () => {
      sm.transition('connecting')
      sm.transition('authenticating')
      sm.transition('negotiating')
      expect(sm.transition('creating-channel')).toBe(true)
    })

    it('creating-channel -> resolution-negotiating 应成功', () => {
      sm.transition('connecting')
      sm.transition('authenticating')
      sm.transition('negotiating')
      sm.transition('creating-channel')
      expect(sm.transition('resolution-negotiating')).toBe(true)
    })

    it('resolution-negotiating -> waiting-video 应成功', () => {
      sm.transition('connecting')
      sm.transition('authenticating')
      sm.transition('negotiating')
      sm.transition('creating-channel')
      sm.transition('resolution-negotiating')
      expect(sm.transition('waiting-video')).toBe(true)
    })

    it('waiting-video -> displaying-first-frame 应成功', () => {
      sm.transition('connecting'); sm.transition('authenticating')
      sm.transition('negotiating'); sm.transition('creating-channel')
      sm.transition('resolution-negotiating'); sm.transition('waiting-video')
      expect(sm.transition('displaying-first-frame')).toBe(true)
    })

    it('displaying-first-frame -> loading-auxiliary 应成功', () => {
      sm.transition('connecting'); sm.transition('authenticating')
      sm.transition('negotiating'); sm.transition('creating-channel')
      sm.transition('resolution-negotiating'); sm.transition('waiting-video')
      sm.transition('displaying-first-frame')
      expect(sm.transition('loading-auxiliary')).toBe(true)
    })

    it('loading-auxiliary -> connected 应成功', () => {
      sm.transition('connecting'); sm.transition('authenticating')
      sm.transition('negotiating'); sm.transition('creating-channel')
      sm.transition('resolution-negotiating'); sm.transition('waiting-video')
      sm.transition('displaying-first-frame'); sm.transition('loading-auxiliary')
      expect(sm.transition('connected')).toBe(true)
    })

    it('displaying-first-frame -> connected 也应有效（直连模式）', () => {
      sm.transition('connecting'); sm.transition('authenticating')
      sm.transition('negotiating'); sm.transition('creating-channel')
      sm.transition('resolution-negotiating'); sm.transition('waiting-video')
      sm.transition('displaying-first-frame')
      expect(sm.transition('connected')).toBe(true)
    })
  })

  describe('非法状态转换', () => {
    it('connected -> authenticating 应被拒绝', () => {
      sm.forceTransition('connected')
      expect(sm.transition('authenticating')).toBe(false)
      expect(sm.getState()).toBe('connected')
    })

    it('idle -> negotiating 应被拒绝（跳级）', () => {
      expect(sm.transition('negotiating')).toBe(false)
      expect(sm.getState()).toBe('idle')
    })

    it('connected -> idle 应被拒绝', () => {
      sm.forceTransition('connected')
      expect(sm.transition('idle')).toBe(false)
    })

    it('非法转换返回 false', () => {
      const result = sm.transition('negotiating')
      expect(result).toBe(false)
    })
  })

  describe('forceTransition', () => {
    it('forceTransition 应跳过校验', () => {
      sm.forceTransition('connected')
      expect(sm.getState()).toBe('connected')
    })

    it('forceTransition 应返回 true', () => {
      expect(sm.forceTransition('connected')).toBe(true)
    })
  })

  describe('断开和重连', () => {
    it('connected -> disconnecting -> idle 应成功', () => {
      sm.forceTransition('connected')
      expect(sm.transition('disconnecting')).toBe(true)
      expect(sm.transition('idle')).toBe(true)
      expect(sm.getState()).toBe('idle')
    })

    it('connected -> reconnecting -> connecting 应成功', () => {
      sm.forceTransition('connected')
      expect(sm.transition('reconnecting')).toBe(true)
      expect(sm.transition('connecting')).toBe(true)
      expect(sm.getState()).toBe('connecting')
    })
  })

  describe('错误处理', () => {
    it('从 connecting 到 error 应成功', () => {
      sm.transition('connecting')
      expect(sm.transition('error')).toBe(true)
    })

    it('从 error 到 idle 应成功', () => {
      sm.forceTransition('error')
      expect(sm.transition('idle')).toBe(true)
    })

    it('从 error 到 connecting 应成功（重连）', () => {
      sm.forceTransition('error')
      expect(sm.transition('connecting')).toBe(true)
    })
  })

  describe('监听器', () => {
    it('addListener 应收到状态变化通知', () => {
      const fn = vi.fn()
      sm.addListener(fn)
      sm.transition('connecting')
      expect(fn).toHaveBeenCalledWith('connecting', 'idle', null)
    })

    it('addListener 返回取消函数', () => {
      const fn = vi.fn()
      const unsubscribe = sm.addListener(fn)
      unsubscribe()
      sm.transition('connecting')
      expect(fn).not.toHaveBeenCalled()
    })

    it('listener 异常不应影响其他 listener', () => {
      const badFn = vi.fn(() => { throw new Error('test error') })
      const goodFn = vi.fn()
      sm.addListener(badFn)
      sm.addListener(goodFn)
      sm.transition('connecting')
      expect(goodFn).toHaveBeenCalled()
    })

    it('transition 附带 data 时应传递给 listener', () => {
      const fn = vi.fn()
      sm.addListener(fn)
      sm.transition('connecting', { key: 'value' })
      expect(fn).toHaveBeenCalledWith('connecting', 'idle', { key: 'value' })
    })
  })

  describe('isConnected', () => {
    it('CONNECTED 状态应返回 true', () => {
      sm.forceTransition('connected')
      expect(sm.isConnected()).toBe(true)
    })

    it('LOADING_AUXILIARY 状态应返回 true', () => {
      sm.forceTransition('loading-auxiliary')
      expect(sm.isConnected()).toBe(true)
    })

    it('非连接状态应返回 false', () => {
      expect(sm.isConnected()).toBe(false)
    })
  })

  describe('reset', () => {
    it('reset 应回到 idle', () => {
      sm.forceTransition('connected')
      sm.stateData = { old: 'data' }
      sm.reset()
      expect(sm.getState()).toBe('idle')
      expect(sm.getStateData()).toEqual({})
    })
  })

  describe('stateData', () => {
    it('setStateData 应合并数据', () => {
      sm.setStateData({ a: 1 })
      sm.setStateData({ b: 2 })
      expect(sm.getStateData()).toEqual({ a: 1, b: 2 })
    })

    it('transition 携带 data 时应合并', () => {
      sm.transition('connecting', { host: 'localhost' })
      expect(sm.getStateData()).toHaveProperty('host', 'localhost')
    })
  })

  describe('canTransitionTo', () => {
    it('合法转换应返回 true', () => {
      expect(sm.canTransitionTo('connecting')).toBe(true)
    })

    it('非法转换应返回 false', () => {
      expect(sm.canTransitionTo('negotiating')).toBe(false)
    })
  })

  describe('toJSON', () => {
    it('应包含 state 和 previousState', () => {
      sm.transition('connecting')
      const json = sm.toJSON()
      expect(json.state).toBe('connecting')
      expect(json.previousState).toBe('idle')
    })
  })

  describe('isInState', () => {
    it('在指定状态时返回 true', () => {
      expect(sm.isInState('idle')).toBe(true)
      expect(sm.isInState('connecting')).toBe(false)
    })
  })
})
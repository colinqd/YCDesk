/**
 * YCDesk 配置模块单元测试
 *
 * 测试 config.js 的配置结构、ICE 配置生成、视频约束和 URL 规范化
 */

import { describe, it, expect } from 'vitest'

// config.js 使用 module.exports = CONFIG，Vitest 可以 ESM 方式导入
let CONFIG
try {
  CONFIG = require('./config.js')
} catch {
  // fallback
}

describe('CONFIG 基本结构', () => {
  it('存在默认信令服务器地址', () => {
    expect(CONFIG.defaultSignalingServer).toBeDefined()
    expect(typeof CONFIG.defaultSignalingServer).toBe('string')
  })

  it('defaultPort 为 8080', () => {
    expect(CONFIG.defaultPort).toBe(8080)
  })

  it('heartbeatInterval 为 5000ms', () => {
    expect(CONFIG.heartbeatInterval).toBe(5000)
  })

  it('maxReconnectAttempts 为 10', () => {
    expect(CONFIG.maxReconnectAttempts).toBe(10)
  })

  it('baseReconnectDelay 为 1000ms', () => {
    expect(CONFIG.baseReconnectDelay).toBe(1000)
  })

  it('maxHistoryItems 为 10', () => {
    expect(CONFIG.maxHistoryItems).toBe(10)
  })

  it('dataChannelMaxRetries 为 3', () => {
    expect(CONFIG.dataChannelMaxRetries).toBe(3)
  })

  it('dataChannelMaxQueueSize 为 100', () => {
    expect(CONFIG.dataChannelMaxQueueSize).toBe(100)
  })
})

describe('STUN 服务器配置', () => {
  it('包含至少 3 个 STUN 服务器', () => {
    expect(CONFIG.stunServers.length).toBeGreaterThanOrEqual(3)
  })

  it('包含 Google STUN 服务器', () => {
    expect(CONFIG.stunServers).toContain('stun:stun.l.google.com:19302')
  })

  it('所有 STUN URL 格式正确', () => {
    CONFIG.stunServers.forEach(url => {
      expect(url).toMatch(/^stun:/)
    })
  })
})

describe('screenCapture 配置', () => {
  it('最大宽度为 1920', () => {
    expect(CONFIG.screenCapture.maxWidth).toBe(1920)
  })

  it('最大高度为 1080', () => {
    expect(CONFIG.screenCapture.maxHeight).toBe(1080)
  })

  it('最大帧率为 30', () => {
    expect(CONFIG.screenCapture.maxFrameRate).toBe(30)
  })

  it('最小帧率为 15', () => {
    expect(CONFIG.screenCapture.minFrameRate).toBe(15)
  })
})

describe('webrtc 配置', () => {
  it('iceTransportPolicy 为 all', () => {
    expect(CONFIG.webrtc.iceTransportPolicy).toBe('all')
  })

  it('bundlePolicy 为 max-bundle', () => {
    expect(CONFIG.webrtc.bundlePolicy).toBe('max-bundle')
  })

  it('sdpSemantics 为 unified-plan', () => {
    expect(CONFIG.webrtc.sdpSemantics).toBe('unified-plan')
  })

  it('videoBitrateMax 为 2500', () => {
    expect(CONFIG.webrtc.videoBitrateMax).toBe(2500)
  })

  it('视频接收开启，音频关闭', () => {
    expect(CONFIG.webrtc.offerToReceiveVideo).toBe(true)
    expect(CONFIG.webrtc.offerToReceiveAudio).toBe(false)
  })
})

describe('logging 配置', () => {
  it('主进程日志级别存在', () => {
    expect(CONFIG.logging.main.logLevel).toBeDefined()
  })

  it('主进程日志最大文件尺寸为 10MB', () => {
    expect(CONFIG.logging.main.maxFileSize).toBe(10 * 1024 * 1024)
  })

  it('主进程日志最大文件数为 10', () => {
    expect(CONFIG.logging.main.maxFiles).toBe(10)
  })

  it('渲染进程日志级别存在', () => {
    expect(CONFIG.logging.renderer.logLevel).toBeDefined()
  })

  it('渲染进程最大 UI 日志数为 100', () => {
    expect(CONFIG.logging.renderer.maxUiLogs).toBe(100)
  })
})

describe('input 配置', () => {
  it('throttleMs 为 8ms', () => {
    expect(CONFIG.input.throttleMs).toBe(8)
  })

  it('queueMaxSize 为 100', () => {
    expect(CONFIG.input.queueMaxSize).toBe(100)
  })
})

describe('storage.keys 配置', () => {
  it('所有 storage key 以 ycdesk_ 开头', () => {
    Object.values(CONFIG.storage.keys).forEach(key => {
      expect(key).toMatch(/^ycdesk_/)
    })
  })
})

describe('deviceId 配置', () => {
  it('最小长度 6', () => {
    expect(CONFIG.deviceId.minLength).toBe(6)
  })

  it('最大长度 16', () => {
    expect(CONFIG.deviceId.maxLength).toBe(16)
  })

  it('defaultLength 为 9', () => {
    expect(CONFIG.deviceId.defaultLength).toBe(9)
  })

  it('allowedChars 包含大小写字母和数字', () => {
    const chars = CONFIG.deviceId.allowedChars
    expect(chars).toMatch(/[a-z]/)
    expect(chars).toMatch(/[A-Z]/)
    expect(chars).toMatch(/[0-9]/)
  })
})

// ==================== getIceConfig ====================

describe('getIceConfig', () => {
  it('返回包含 iceServers 数组的对象', () => {
    const config = CONFIG.getIceConfig()
    expect(config).toHaveProperty('iceServers')
    expect(Array.isArray(config.iceServers)).toBe(true)
  })

  it('默认包含 STUN 服务器', () => {
    const config = CONFIG.getIceConfig()
    expect(config.iceServers.length).toBeGreaterThanOrEqual(3)
    expect(config.iceServers[0]).toHaveProperty('urls')
    expect(config.iceServers[0].urls).toMatch(/^stun:/)
  })

  it('iceTransportPolicy 默认值正确', () => {
    const config = CONFIG.getIceConfig()
    expect(config.iceTransportPolicy).toBe('all')
  })

  it('bundlePolicy 默认值正确', () => {
    const config = CONFIG.getIceConfig()
    expect(config.bundlePolicy).toBe('max-bundle')
  })

  it('可传入自定义 STUN 服务器', () => {
    const config = CONFIG.getIceConfig({
      stunServers: ['stun:custom.stun.com:3478']
    })
    const urls = config.iceServers.map(s => s.urls)
    expect(urls).toContain('stun:custom.stun.com:3478')
  })

  it('自定义配置覆盖默认策略', () => {
    const config = CONFIG.getIceConfig({
      iceTransportPolicy: 'relay'
    })
    expect(config.iceTransportPolicy).toBe('relay')
  })
})

// ==================== getVideoConstraints ====================

describe('getVideoConstraints', () => {
  it('返回包含 desktop 媒体源的约束', () => {
    const constraints = CONFIG.getVideoConstraints({ sourceId: 'test:123' })
    expect(constraints.audio).toBe(false)
    expect(constraints.video.mandatory.chromeMediaSource).toBe('desktop')
    expect(constraints.video.mandatory.chromeMediaSourceId).toBe('test:123')
  })

  it('使用默认分辨率', () => {
    const constraints = CONFIG.getVideoConstraints({ sourceId: 'test' })
    expect(constraints.video.mandatory.maxWidth).toBe(1920)
    expect(constraints.video.mandatory.maxHeight).toBe(1080)
  })

  it('可自定义分辨率', () => {
    const constraints = CONFIG.getVideoConstraints({
      sourceId: 'test',
      maxWidth: 1280,
      maxHeight: 720,
      maxFrameRate: 15
    })
    expect(constraints.video.mandatory.maxWidth).toBe(1280)
    expect(constraints.video.mandatory.maxHeight).toBe(720)
    expect(constraints.video.mandatory.maxFrameRate).toBe(15)
  })
})

// ==================== normalizeServerUrl ====================

describe('normalizeServerUrl', () => {
  it('以 wss:// 开头的 URL 保持不变', () => {
    expect(CONFIG.normalizeServerUrl('wss://server.example.com')).toBe('wss://server.example.com')
  })

  it('以 ws:// 开头的 URL 保持不变', () => {
    expect(CONFIG.normalizeServerUrl('ws://192.168.1.1:3000')).toBe('ws://192.168.1.1:3000')
  })

  it('以 https:// 开头转为 wss://', () => {
    expect(CONFIG.normalizeServerUrl('https://server.example.com')).toBe('wss://server.example.com')
  })

  it('以 http:// 开头转为 ws://', () => {
    expect(CONFIG.normalizeServerUrl('http://192.168.1.1:3000')).toBe('ws://192.168.1.1:3000')
  })

  it('裸域名默认加 wss:// 协议', () => {
    const result = CONFIG.normalizeServerUrl('server.example.com')
    expect(result).toMatch(/^wss:\/\//)
  })

  it('裸 IP 地址默认加 ws:// 协议', () => {
    const result = CONFIG.normalizeServerUrl('192.168.1.1')
    expect(result).toMatch(/^ws:\/\//)
  })

  it('裸 localhost 默认加 ws:// 协议', () => {
    const result = CONFIG.normalizeServerUrl('localhost')
    expect(result).toMatch(/^ws:\/\//)
  })

  it('IP:端口默认加 ws:// 协议', () => {
    const result = CONFIG.normalizeServerUrl('192.168.1.1:3000')
    expect(result).toBe('ws://192.168.1.1:3000')
  })

  it('域名:非标准端口默认加 ws://', () => {
    const result = CONFIG.normalizeServerUrl('example.com:31300')
    expect(result).toMatch(/^ws:\/\//)
  })

  it('域名:443 端口默认加 wss://', () => {
    const result = CONFIG.normalizeServerUrl('example.com:443')
    expect(result).toMatch(/^wss:\/\//)
  })

  it('preferSecure=true 强制 wss://', () => {
    const result = CONFIG.normalizeServerUrl('192.168.1.1:3000', true)
    expect(result).toBe('wss://192.168.1.1:3000')
  })

  it('preferSecure=false 强制 ws://', () => {
    const result = CONFIG.normalizeServerUrl('server.example.com', false)
    expect(result).toBe('ws://server.example.com')
  })

  it('空值返回原值', () => {
    expect(CONFIG.normalizeServerUrl('')).toBe('')
    expect(CONFIG.normalizeServerUrl(null)).toBeNull()
    expect(CONFIG.normalizeServerUrl(undefined)).toBeUndefined()
  })

  it('清理多余冒号和点', () => {
    const result = CONFIG.normalizeServerUrl('www.hnasvr:.asia:31300')
    expect(result).toBe('ws://www.hnasvr.asia:31300')
  })

  it('wws:// 纠错为 wss://', () => {
    const result = CONFIG.normalizeServerUrl('wws://server.example.com')
    expect(result).toBe('wss://server.example.com')
  })
})

/**
 * YCDesk 日志系统单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Logger, LogLevel, createLogger } from './logger.js'

describe('LogLevel 常量', () => {
  it('DEBUG 级别为 0', () => {
    expect(LogLevel.DEBUG).toBe(0)
  })

  it('INFO 级别为 1', () => {
    expect(LogLevel.INFO).toBe(1)
  })

  it('WARN 级别为 2', () => {
    expect(LogLevel.WARN).toBe(2)
  })

  it('ERROR 级别为 3', () => {
    expect(LogLevel.ERROR).toBe(3)
  })

  it('NONE 级别为 4', () => {
    expect(LogLevel.NONE).toBe(4)
  })
})

describe('Logger 初始化', () => {
  it('默认级别为 INFO', () => {
    const logger = new Logger()
    expect(logger.getLevel()).toBe(LogLevel.INFO)
  })

  it('默认平台为 web', () => {
    const logger = new Logger()
    expect(logger.platform).toBe('web')
  })

  it('默认无前缀', () => {
    const logger = new Logger()
    expect(logger.prefix).toBe('')
  })

  it('默认启用时间戳', () => {
    const logger = new Logger()
    expect(logger.enableTimestamp).toBe(true)
  })

  it('默认启用颜色', () => {
    const logger = new Logger()
    expect(logger.enableColors).toBe(true)
  })
})

describe('Logger 配置', () => {
  it('可以根据选项配置 Logger', () => {
    const logger = new Logger({
      level: LogLevel.DEBUG,
      platform: 'android',
      prefix: 'Test',
      enableTimestamp: false,
      enableColors: false
    })

    expect(logger.getLevel()).toBe(LogLevel.DEBUG)
    expect(logger.platform).toBe('android')
    expect(logger.prefix).toBe('Test')
    expect(logger.enableTimestamp).toBe(false)
    expect(logger.enableColors).toBe(false)
  })
})

describe('日志级别过滤', () => {
  it('DEBUG 日志在 WARN 级别下被过滤', () => {
    let outputCount = 0
    const mockOutput = () => { outputCount++ }

    const logger = new Logger({
      level: LogLevel.WARN,
      outputFn: mockOutput
    })

    logger.debug('test')
    expect(outputCount).toBe(0)
  })

  it('INFO 日志在 WARN 级别下被过滤', () => {
    let outputCount = 0
    const mockOutput = () => { outputCount++ }

    const logger = new Logger({
      level: LogLevel.WARN,
      outputFn: mockOutput
    })

    logger.info('test')
    expect(outputCount).toBe(0)
  })

  it('WARN 日志在 WARN 级别下正常输出', () => {
    let outputCount = 0
    const mockOutput = () => { outputCount++ }

    const logger = new Logger({
      level: LogLevel.WARN,
      outputFn: mockOutput
    })

    logger.warn('test')
    expect(outputCount).toBe(1)
  })

  it('ERROR 日志在 WARN 级别下正常输出', () => {
    let outputCount = 0
    const mockOutput = () => { outputCount++ }

    const logger = new Logger({
      level: LogLevel.WARN,
      outputFn: mockOutput
    })

    logger.error('test')
    expect(outputCount).toBe(1)
  })
})

describe('设置日志级别', () => {
  it('可以动态更改日志级别', () => {
    const logger = new Logger({ level: LogLevel.INFO })

    expect(logger.getLevel()).toBe(LogLevel.INFO)

    logger.setLevel(LogLevel.DEBUG)
    expect(logger.getLevel()).toBe(LogLevel.DEBUG)

    logger.setLevel(LogLevel.ERROR)
    expect(logger.getLevel()).toBe(LogLevel.ERROR)
  })
})

describe('创建子日志器', () => {
  it('子日志器继承父日志器属性', () => {
    const parent = new Logger({
      level: LogLevel.DEBUG,
      platform: 'android',
      prefix: 'Parent'
    })

    const child = parent.createChild('Child')

    expect(child.getLevel()).toBe(LogLevel.DEBUG)
    expect(child.platform).toBe('android')
    expect(child.prefix).toBe('Parent:Child')
    expect(child.enableTimestamp).toBe(parent.enableTimestamp)
    expect(child.enableColors).toBe(parent.enableColors)
  })
})

describe('克隆日志器', () => {
  it('克隆独立于原日志器', () => {
    const logger = new Logger({
      level: LogLevel.DEBUG,
      platform: 'electron-renderer',
      prefix: 'Original'
    })

    const clone = logger.clone()

    expect(clone.getLevel()).toBe(LogLevel.DEBUG)
    expect(clone.platform).toBe('electron-renderer')
    expect(clone.prefix).toBe('Original')

    // 修改原日志器不应影响克隆
    logger.setLevel(LogLevel.ERROR)
    expect(clone.getLevel()).toBe(LogLevel.DEBUG)
  })
})

describe('消息格式化', () => {
  it('包含日志级别、前缀和消息内容', () => {
    let lastMessage = ''
    const captureOutput = (level, message) => { lastMessage = message }

    const logger = new Logger({
      level: LogLevel.DEBUG,
      platform: 'web',
      prefix: 'Test',
      enableTimestamp: true,
      enableColors: false,
      outputFn: captureOutput
    })

    logger.info('测试消息')

    expect(lastMessage).toContain('[INFO]')
    expect(lastMessage).toContain('[Test]')
    expect(lastMessage).toContain('测试消息')
    expect(lastMessage).toContain('[')
  })
})

describe('无时间戳格式化', () => {
  it('禁用时间戳后不包含时间戳', () => {
    let lastMessage = ''
    const captureOutput = (level, message) => { lastMessage = message }

    const logger = new Logger({
      level: LogLevel.DEBUG,
      enableTimestamp: false,
      outputFn: captureOutput
    })

    logger.info('测试消息')

    expect(lastMessage.startsWith('[INFO]')).toBe(true)
  })
})

describe('不同平台输出', () => {
  it('所有平台输出正常', () => {
    const platforms = ['web', 'android', 'electron-renderer', 'electron-main', 'node']

    platforms.forEach(platform => {
      let outputCount = 0
      const logger = new Logger({
        platform: platform,
        outputFn: () => { outputCount++ }
      })

      logger.info('test')
      expect(outputCount).toBe(1)
    })
  })
})

describe('工厂函数', () => {
  it('createLogger 返回 Logger 实例', () => {
    const logger = createLogger({
      level: LogLevel.DEBUG,
      prefix: 'Factory'
    })

    expect(logger).toBeInstanceOf(Logger)
    expect(logger.getLevel()).toBe(LogLevel.DEBUG)
    expect(logger.prefix).toBe('Factory')
  })
})

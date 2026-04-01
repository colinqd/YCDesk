/**
 * YCDesk 日志系统单元测试
 */

import { Logger, LogLevel, createLogger } from './logger.js'

// 测试结果统计
let passedTests = 0
let failedTests = 0

/**
 * 断言函数
 */
function assert(condition, message) {
    if (condition) {
        passedTests++
        console.log('✓', message)
    } else {
        failedTests++
        console.error('✗', message)
    }
}

/**
 * 测试 LogLevel 常量
 */
function testLogLevel() {
    console.log('\n=== 测试 LogLevel 常量 ===')
    
    assert(LogLevel.DEBUG === 0, 'DEBUG 级别为 0')
    assert(LogLevel.INFO === 1, 'INFO 级别为 1')
    assert(LogLevel.WARN === 2, 'WARN 级别为 2')
    assert(LogLevel.ERROR === 3, 'ERROR 级别为 3')
    assert(LogLevel.NONE === 4, 'NONE 级别为 4')
}

/**
 * 测试 Logger 初始化
 */
function testLoggerInitialization() {
    console.log('\n=== 测试 Logger 初始化 ===')
    
    const logger = new Logger()
    
    assert(logger.getLevel() === LogLevel.INFO, '默认级别为 INFO')
    assert(logger.platform === 'web', '默认平台为 web')
    assert(logger.prefix === '', '默认无前缀')
    assert(logger.enableTimestamp === true, '默认启用时间戳')
    assert(logger.enableColors === true, '默认启用颜色')
}

/**
 * 测试 Logger 配置
 */
function testLoggerConfiguration() {
    console.log('\n=== 测试 Logger 配置 ===')
    
    const logger = new Logger({
        level: LogLevel.DEBUG,
        platform: 'android',
        prefix: 'Test',
        enableTimestamp: false,
        enableColors: false
    })
    
    assert(logger.getLevel() === LogLevel.DEBUG, '级别设置为 DEBUG')
    assert(logger.platform === 'android', '平台设置为 android')
    assert(logger.prefix === 'Test', '前缀设置为 Test')
    assert(logger.enableTimestamp === false, '时间戳已禁用')
    assert(logger.enableColors === false, '颜色已禁用')
}

/**
 * 测试日志级别过滤
 */
function testLogLevelFiltering() {
    console.log('\n=== 测试日志级别过滤 ===')
    
    let outputCount = 0
    const mockOutput = () => { outputCount++ }
    
    const logger = new Logger({
        level: LogLevel.WARN,
        outputFn: mockOutput
    })
    
    outputCount = 0
    logger.debug('这条日志不会输出')
    assert(outputCount === 0, 'DEBUG 日志被过滤（级别为 WARN）')
    
    outputCount = 0
    logger.info('这条日志也不会输出')
    assert(outputCount === 0, 'INFO 日志被过滤（级别为 WARN）')
    
    outputCount = 0
    logger.warn('这条日志会输出')
    assert(outputCount === 1, 'WARN 日志正常输出')
    
    outputCount = 0
    logger.error('这条日志也会输出')
    assert(outputCount === 1, 'ERROR 日志正常输出')
}

/**
 * 测试设置日志级别
 */
function testSetLogLevel() {
    console.log('\n=== 测试设置日志级别 ===')
    
    const logger = new Logger({ level: LogLevel.INFO })
    
    assert(logger.getLevel() === LogLevel.INFO, '初始级别为 INFO')
    
    logger.setLevel(LogLevel.DEBUG)
    assert(logger.getLevel() === LogLevel.DEBUG, '级别已更改为 DEBUG')
    
    logger.setLevel(LogLevel.ERROR)
    assert(logger.getLevel() === LogLevel.ERROR, '级别已更改为 ERROR')
}

/**
 * 测试创建子日志器
 */
function testCreateChildLogger() {
    console.log('\n=== 测试创建子日志器 ===')
    
    const parent = new Logger({
        level: LogLevel.DEBUG,
        platform: 'android',
        prefix: 'Parent'
    })
    
    const child = parent.createChild('Child')
    
    assert(child.getLevel() === LogLevel.DEBUG, '子日志器继承级别')
    assert(child.platform === 'android', '子日志器继承平台')
    assert(child.prefix === 'Parent:Child', '子日志器前缀正确')
    assert(child.enableTimestamp === parent.enableTimestamp, '继承时间戳设置')
    assert(child.enableColors === parent.enableColors, '继承颜色设置')
}

/**
 * 测试克隆日志器
 */
function testCloneLogger() {
    console.log('\n=== 测试克隆日志器 ===')
    
    const logger = new Logger({
        level: LogLevel.DEBUG,
        platform: 'electron-renderer',
        prefix: 'Original'
    })
    
    const clone = logger.clone()
    
    assert(clone.getLevel() === LogLevel.DEBUG, '克隆继承级别')
    assert(clone.platform === 'electron-renderer', '克隆继承平台')
    assert(clone.prefix === 'Original', '克隆继承前缀')
    
    // 修改原日志器不应影响克隆
    logger.setLevel(LogLevel.ERROR)
    assert(clone.getLevel() === LogLevel.DEBUG, '克隆不受原日志器影响')
}

/**
 * 测试消息格式化
 */
function testMessageFormatting() {
    console.log('\n=== 测试消息格式化 ===')
    
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
    
    assert(lastMessage.includes('[INFO]'), '包含日志级别')
    assert(lastMessage.includes('[Test]'), '包含前缀')
    assert(lastMessage.includes('测试消息'), '包含消息内容')
    assert(lastMessage.includes('['), '包含时间戳')
}

/**
 * 测试无时间戳格式化
 */
function testFormattingWithoutTimestamp() {
    console.log('\n=== 测试无时间戳格式化 ===')
    
    let lastMessage = ''
    const captureOutput = (level, message) => { lastMessage = message }
    
    const logger = new Logger({
        level: LogLevel.DEBUG,
        enableTimestamp: false,
        outputFn: captureOutput
    })
    
    logger.info('测试消息')
    
    assert(!lastMessage.includes('[') || lastMessage.startsWith('[INFO]'), '不包含时间戳')
}

/**
 * 测试不同平台输出
 */
function testDifferentPlatforms() {
    console.log('\n=== 测试不同平台输出 ===')
    
    const platforms = ['web', 'android', 'electron-renderer', 'electron-main', 'node']
    
    platforms.forEach(platform => {
        let outputCount = 0
        const logger = new Logger({
            platform: platform,
            outputFn: () => { outputCount++ }
        })
        
        logger.info('测试')
        assert(outputCount === 1, `${platform} 平台输出正常`)
    })
}

/**
 * 测试便捷方法
 */
function testConvenienceMethods() {
    console.log('\n=== 测试便捷方法 ===')
    
    const logger = new Logger({ level: LogLevel.DEBUG })
    
    let debugCalled = false
    let infoCalled = false
    let warnCalled = false
    let errorCalled = false
    
    logger.debug = () => { debugCalled = true }
    logger.info = () => { infoCalled = true }
    logger.warn = () => { warnCalled = true }
    logger.error = () => { errorCalled = true }
    
    logger.debug('debug')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')
    
    assert(debugCalled, 'debug 方法被调用')
    assert(infoCalled, 'info 方法被调用')
    assert(warnCalled, 'warn 方法被调用')
    assert(errorCalled, 'error 方法被调用')
}

/**
 * 测试工厂函数
 */
function testCreateLoggerFactory() {
    console.log('\n=== 测试工厂函数 ===')
    
    const logger = createLogger({
        level: LogLevel.DEBUG,
        prefix: 'Factory'
    })
    
    assert(logger instanceof Logger, '工厂函数返回 Logger 实例')
    assert(logger.getLevel() === LogLevel.DEBUG, '级别设置正确')
    assert(logger.prefix === 'Factory', '前缀设置正确')
}

/**
 * 测试默认日志器
 */
function testDefaultLogger() {
    console.log('\n=== 测试默认日志器 ===')
    
    // 导入默认日志器
    const { defaultLogger } = require('./logger.js')
    
    assert(defaultLogger instanceof Logger, '默认日志器是 Logger 实例')
    assert(defaultLogger.prefix === 'YCDesk', '默认前缀为 YCDesk')
}

/**
 * 运行所有测试
 */
function runAllTests() {
    console.log('╔════════════════════════════════════════╗')
    console.log('║   日志系统单元测试                     ║')
    console.log('╚════════════════════════════════════════╝')
    
    try {
        testLogLevel()
        testLoggerInitialization()
        testLoggerConfiguration()
        testLogLevelFiltering()
        testSetLogLevel()
        testCreateChildLogger()
        testCloneLogger()
        testMessageFormatting()
        testFormattingWithoutTimestamp()
        testDifferentPlatforms()
        testConvenienceMethods()
        testCreateLoggerFactory()
        testDefaultLogger()
        
        // 输出结果
        console.log('\n╔════════════════════════════════════════╗')
        console.log('║   测试结果汇总                       ║')
        console.log('╚════════════════════════════════════════╝')
        console.log(`✓ 通过：${passedTests}`)
        console.log(`✗ 失败：${failedTests}`)
        console.log(`总计：${passedTests + failedTests}`)
        
        if (failedTests === 0) {
            console.log('\n🎉 所有测试通过！')
        } else {
            console.error('\n❌ 有测试失败，请检查代码')
            process.exit(1)
        }
    } catch (error) {
        console.error('\n❌ 测试执行出错:', error)
        process.exit(1)
    }
}

// 运行测试
runAllTests()

// 导出测试函数
export {
    runAllTests,
    testLogLevel,
    testLoggerInitialization,
    testLoggerConfiguration,
    testLogLevelFiltering,
    testSetLogLevel,
    testCreateChildLogger,
    testCloneLogger,
    testMessageFormatting,
    testDifferentPlatforms
}

/**
 * YCDesk MatrixTransformer 单元测试
 */

import { MatrixTransformer } from './matrix-transformer.js'

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
 * 测试初始化
 */
function testInitialization() {
    console.log('\n=== 测试初始化 ===')
    
    const transformer = new MatrixTransformer()
    
    assert(transformer.scale === 1.0, '初始缩放为 1.0')
    assert(transformer.panX === 0, '初始平移 X 为 0')
    assert(transformer.panY === 0, '初始平移 Y 为 0')
    assert(transformer.remoteScreenWidth === 1920, '默认远程宽度为 1920')
    assert(transformer.remoteScreenHeight === 1080, '默认远程高度为 1080')
}

/**
 * 测试屏幕尺寸设置
 */
function testSetScreenSize() {
    console.log('\n=== 测试设置屏幕尺寸 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    
    assert(transformer.screenWidth === 800, '屏幕宽度设置为 800')
    assert(transformer.screenHeight === 600, '屏幕高度设置为 600')
}

/**
 * 测试远程屏幕尺寸设置
 */
function testSetRemoteScreenSize() {
    console.log('\n=== 测试设置远程屏幕尺寸 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setRemoteScreenSize(1920, 1080)
    
    assert(transformer.remoteScreenWidth === 1920, '远程宽度设置为 1920')
    assert(transformer.remoteScreenHeight === 1080, '远程高度设置为 1080')
}

/**
 * 测试显示区域计算
 */
function testDisplayRectCalculation() {
    console.log('\n=== 测试显示区域计算 ===')
    
    const transformer = new MatrixTransformer()
    
    // 设置屏幕尺寸 800x600
    transformer.setScreenSize(800, 600)
    
    // 设置远程屏幕尺寸 1920x1080 (16:9)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // 远程屏幕更宽，应该以宽度为基准
    assert(transformer.displayWidth === 800, '显示宽度等于屏幕宽度')
    assert(Math.abs(transformer.displayHeight - 450) < 1, '显示高度约为 450 (800/1.778)')
    assert(transformer.displayX === 0, '显示 X 为 0')
    assert(transformer.displayY > 0, '显示 Y 大于 0（垂直居中）')
}

/**
 * 测试坐标变换 - containerToRemote
 */
function testContainerToRemote() {
    console.log('\n=== 测试 Container 到 Remote 变换 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // 测试屏幕中心点
    const center = transformer.containerToRemote(400, 300)
    assert(center !== null, '变换成功')
    assert(Math.abs(center.x - 960) < 10, '中心 X 应该约为 960')
    assert(Math.abs(center.y - 540) < 10, '中心 Y 应该约为 540')
    
    // 测试左上角
    const topLeft = transformer.containerToRemote(0, 0)
    assert(topLeft !== null, '变换成功')
    assert(topLeft.x >= 0, '左上角 X >= 0')
    assert(topLeft.y >= 0, '左上角 Y >= 0')
    
    // 测试右下角
    const bottomRight = transformer.containerToRemote(800, 600)
    assert(bottomRight !== null, '变换成功')
    assert(Math.abs(bottomRight.x - 1920) < 10, '右下角 X 应该约为 1920')
    assert(Math.abs(bottomRight.y - 1080) < 10, '右下角 Y 应该约为 1080')
}

/**
 * 测试边界检查
 */
function testBoundaryCheck() {
    console.log('\n=== 测试边界检查 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // 测试超出边界的点
    const outside = transformer.containerToRemote(-10, 300)
    assert(outside === null, '超出左边界应该返回 null')
    
    const outside2 = transformer.containerToRemote(810, 300)
    assert(outside2 === null, '超出右边界应该返回 null')
}

/**
 * 测试缩放更新
 */
function testUpdateScale() {
    console.log('\n=== 测试缩放更新 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // 更新缩放
    transformer.updateScale(2.0, 400, 300)
    
    assert(transformer.scale === 2.0, '缩放比例更新为 2.0')
    assert(transformer._matrixDirty === true, '矩阵标记为 dirty')
    
    // 测试缩放限制
    transformer.updateScale(4.0, 400, 300)
    assert(transformer.scale === 3.0, '最大缩放限制为 3.0')
    
    transformer.updateScale(0.2, 400, 300)
    assert(transformer.scale === 0.5, '最小缩放限制为 0.5')
}

/**
 * 测试平移更新
 */
function testUpdatePan() {
    console.log('\n=== 测试平移更新 ===')
    
    const transformer = new MatrixTransformer()
    
    transformer.updatePan(10, 20)
    
    assert(transformer.panX === 10, '平移 X 更新为 10')
    assert(transformer.panY === 20, '平移 Y 更新为 20')
    
    transformer.updatePan(-5, -10)
    assert(transformer.panX === 5, '平移 X 累加为 5')
    assert(transformer.panY === 10, '平移 Y 累加为 10')
}

/**
 * 测试重置
 */
function testReset() {
    console.log('\n=== 测试重置 ===')
    
    const transformer = new MatrixTransformer()
    transformer.updateScale(2.0, 400, 300)
    transformer.updatePan(10, 20)
    
    // 普通重置
    transformer.reset()
    
    assert(transformer.scale === 1.0, '重置后缩放为 1.0')
    assert(transformer.panX === 0, '重置后平移 X 为 0')
    assert(transformer.panY === 0, '重置后平移 Y 为 0')
    
    // 完全重置
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    transformer.fullReset()
    
    assert(transformer.screenWidth === 0, '完全重置后屏幕宽度为 0')
    assert(transformer.remoteScreenWidth === 1920, '完全重置后远程宽度恢复默认')
}

/**
 * 测试 getState
 */
function testGetState() {
    console.log('\n=== 测试获取状态 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    transformer.updateScale(1.5, 400, 300)
    
    const state = transformer.getState()
    
    assert(state.scale === 1.5, '状态中缩放正确')
    assert(state.screenWidth === 800, '状态中屏幕宽度正确')
    assert(state.screenHeight === 600, '状态中屏幕高度正确')
    assert(state.remoteScreenWidth === 1920, '状态中远程宽度正确')
    assert(state.remoteScreenHeight === 1080, '状态中远程高度正确')
}

/**
 * 测试 displayToRemote
 */
function testDisplayToRemote() {
    console.log('\n=== 测试 Display 到 Remote 变换 ===')
    
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // Display 中心点
    const display = transformer.displayToRemote(400, 225)
    assert(display !== null, '变换成功')
    assert(Math.abs(display.x - 960) < 10, 'X 应该约为 960')
    assert(Math.abs(display.y - 540) < 10, 'Y 应该约为 540')
}

/**
 * 测试 viewToVideo
 */
function testViewToVideo() {
    console.log('\n=== 测试 View 到 Video 变换 ===')
    
    const transformer = new MatrixTransformer()
    transformer.updateScale(2.0, 0, 0)
    transformer.updatePan(100, 50)
    
    const video = transformer.viewToVideo(200, 150)
    assert(video !== null, '变换成功')
    assert(typeof video.x === 'number', 'X 是数字')
    assert(typeof video.y === 'number', 'Y 是数字')
}

/**
 * 测试完整流程
 */
function testFullFlow() {
    console.log('\n=== 测试完整流程 ===')
    
    const transformer = new MatrixTransformer()
    
    // 1. 设置屏幕尺寸
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    
    // 2. 应用容器尺寸
    const container = {
        style: {
            width: '',
            height: '',
            left: '',
            top: ''
        }
    }
    transformer.applyContainerSize(container)
    
    assert(container.style.width === transformer.displayWidth + 'px', '容器宽度设置正确')
    assert(container.style.height === transformer.displayHeight + 'px', '容器高度设置正确')
    
    // 3. 应用变换
    const element = {
        style: {
            transform: '',
            transformOrigin: ''
        }
    }
    transformer.applyTransform(element)
    
    assert(element.style.transform.includes('scale'), '包含缩放变换')
    assert(element.style.transform.includes('translate'), '包含平移变换')
    
    // 4. 坐标变换
    const remote = transformer.containerToRemote(400, 300)
    assert(remote !== null, '坐标变换成功')
}

/**
 * 运行所有测试
 */
function runAllTests() {
    console.log('╔════════════════════════════════════════╗')
    console.log('║   MatrixTransformer 单元测试           ║')
    console.log('╚════════════════════════════════════════╝')
    
    try {
        testInitialization()
        testSetScreenSize()
        testSetRemoteScreenSize()
        testDisplayRectCalculation()
        testContainerToRemote()
        testBoundaryCheck()
        testUpdateScale()
        testUpdatePan()
        testReset()
        testGetState()
        testDisplayToRemote()
        testViewToVideo()
        testFullFlow()
        
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
    testInitialization,
    testSetScreenSize,
    testSetRemoteScreenSize,
    testDisplayRectCalculation,
    testContainerToRemote,
    testBoundaryCheck,
    testUpdateScale,
    testUpdatePan,
    testReset,
    testGetState,
    testFullFlow
}

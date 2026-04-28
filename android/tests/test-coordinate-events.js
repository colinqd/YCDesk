import MatrixTransformer from '../shared/components/matrix-transformer.js'

let passed = 0
let failed = 0
const results = []

function assert(condition, message) {
    if (condition) {
        passed++
        results.push({ pass: true, msg: message })
    } else {
        failed++
        results.push({ pass: false, msg: message })
    }
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected)
    assert(diff <= tolerance, `${message} (实际=${actual}, 期望=${expected}, 容差=${tolerance})`)
}

function section(name) {
    results.push({ section: name })
}

function testDisplayToRemoteNormalized() {
    section('displayToRemote 归一化坐标测试')
    
    const t = new MatrixTransformer()
    t.setScreenSize(800, 600)
    t.remoteScreenWidth = 1920
    t.remoteScreenHeight = 1080
    
    const center = t.displayToRemote(t.displayWidth / 2, t.displayHeight / 2)
    assertApprox(center.x, 0.5, 0.01, 'displayWidth中心点 → x=0.5')
    assertApprox(center.y, 0.5, 0.01, 'displayHeight中心点 → y=0.5')
    
    const topLeft = t.displayToRemote(0, 0)
    assertApprox(topLeft.x, 0, 0.01, '左上角 → x=0')
    assertApprox(topLeft.y, 0, 0.01, '左上角 → y=0')
    
    const bottomRight = t.displayToRemote(t.displayWidth, t.displayHeight)
    assertApprox(bottomRight.x, 1, 0.01, '右下角 → x=1')
    assertApprox(bottomRight.y, 1, 0.01, '右下角 → y=1')
    
    const quarter = t.displayToRemote(t.displayWidth / 4, t.displayHeight / 4)
    assertApprox(quarter.x, 0.25, 0.01, '1/4位置 → x=0.25')
    assertApprox(quarter.y, 0.25, 0.01, '1/4位置 → y=0.25')
}

function testContainerToRemoteWithOffset() {
    section('containerToRemote 偏移测试')
    
    const t = new MatrixTransformer()
    t.setScreenSize(1080, 2400)
    t.remoteScreenWidth = 1920
    t.remoteScreenHeight = 1080
    
    const remoteAspect = 1920 / 1080
    const screenAspect = 1080 / 2400
    
    assert(remoteAspect > screenAspect, '远程屏幕更宽，以宽度为基准')
    assertApprox(t.displayWidth, 1080, 1, 'displayWidth = screenWidth')
    assertApprox(t.displayHeight, 1080 / remoteAspect, 1, 'displayHeight = screenWidth / remoteAspect')
    assertApprox(t.displayX, 0, 1, 'displayX = 0')
    assert(t.displayY > 0, 'displayY > 0 (垂直居中)')
    
    const centerDisplay = t.containerToRemote(540, t.displayY + t.displayHeight / 2)
    if (centerDisplay) {
        assertApprox(centerDisplay.x, 0.5, 0.02, '容器中心 → x≈0.5')
        assertApprox(centerDisplay.y, 0.5, 0.02, '容器中心 → y≈0.5')
    } else {
        assert(false, '容器中心应该返回有效坐标')
    }
}

function testContainerToRemoteWithScale() {
    section('containerToRemote 缩放测试')
    
    const t = new MatrixTransformer()
    t.setScreenSize(800, 600)
    t.remoteScreenWidth = 1920
    t.remoteScreenHeight = 1080
    
    t.updateScale(2.0, 400, 300)
    
    const center = t.containerToRemote(400, 300)
    if (center) {
        assertApprox(center.x, 0.5, 0.05, '缩放2x后中心点 → x≈0.5')
        assertApprox(center.y, 0.5, 0.05, '缩放2x后中心点 → y≈0.5')
    }
}

function testContainerToRemoteBoundary() {
    section('containerToRemote 边界测试')
    
    const t = new MatrixTransformer()
    t.setScreenSize(800, 600)
    t.remoteScreenWidth = 1920
    t.remoteScreenHeight = 1080
    
    const inside = t.containerToRemote(400, 300)
    assert(inside !== null, '显示区域内坐标应返回有效值')
    
    const outside = t.containerToRemote(-10, -10)
    assert(outside === null, '显示区域外坐标应返回null')
}

function testGetBoundingClientRectSimulation() {
    section('getBoundingClientRect 坐标转换模拟测试')
    
    const mockRect = { left: 50, top: 100, width: 700, height: 393.75 }
    
    function simulateCoordinateTransform(clientX, clientY, rect) {
        const localX = clientX - rect.left
        const localY = clientY - rect.top
        const normalizedX = localX / rect.width
        const normalizedY = localY / rect.height
        return { x: normalizedX, y: normalizedY }
    }
    
    const center = simulateCoordinateTransform(400, 296.875, mockRect)
    assertApprox(center.x, 0.5, 0.01, '模拟: 容器中心 → x=0.5')
    assertApprox(center.y, 0.5, 0.01, '模拟: 容器中心 → y=0.5')
    
    const topLeft = simulateCoordinateTransform(50, 100, mockRect)
    assertApprox(topLeft.x, 0, 0.01, '模拟: 左上角 → x=0')
    assertApprox(topLeft.y, 0, 0.01, '模拟: 左上角 → y=0')
    
    const bottomRight = simulateCoordinateTransform(750, 493.75, mockRect)
    assertApprox(bottomRight.x, 1, 0.01, '模拟: 右下角 → x=1')
    assertApprox(bottomRight.y, 1, 0.01, '模拟: 右下角 → y=1')
    
    const outside = simulateCoordinateTransform(30, 80, mockRect)
    assert(outside.x < 0, '模拟: 容器外 → x<0')
    assert(outside.y < 0, '模拟: 容器外 → y<0')
}

function testGetBoundingClientRectWithScale() {
    section('getBoundingClientRect 缩放后坐标转换模拟测试')
    
    const mockRectScaled = { left: 150, top: 200, width: 500, height: 281.25 }
    
    function simulateCoordinateTransform(clientX, clientY, rect) {
        const localX = clientX - rect.left
        const localY = clientY - rect.top
        const normalizedX = localX / rect.width
        const normalizedY = localY / rect.height
        return { x: normalizedX, y: normalizedY }
    }
    
    const center = simulateCoordinateTransform(400, 340.625, mockRectScaled)
    assertApprox(center.x, 0.5, 0.01, '缩放后: 容器中心 → x=0.5')
    assertApprox(center.y, 0.5, 0.01, '缩放后: 容器中心 → y=0.5')
    
    const quarter = simulateCoordinateTransform(275, 270.3125, mockRectScaled)
    assertApprox(quarter.x, 0.25, 0.01, '缩放后: 1/4位置 → x=0.25')
    assertApprox(quarter.y, 0.25, 0.01, '缩放后: 1/4位置 → y=0.25')
}

function testWindowsSideCoordinateRestore() {
    section('Windows被控端坐标还原测试')
    
    function simulateWindowsRestore(normalizedX, normalizedY, screenWidth, screenHeight) {
        const pixelX = Math.round(Math.max(0, Math.min(1, normalizedX)) * screenWidth)
        const pixelY = Math.round(Math.max(0, Math.min(1, normalizedY)) * screenHeight)
        return { x: pixelX, y: pixelY }
    }
    
    const center = simulateWindowsRestore(0.5, 0.5, 1920, 1080)
    assert(center.x === 960, '0.5 * 1920 = 960')
    assert(center.y === 540, '0.5 * 1080 = 540')
    
    const topLeft = simulateWindowsRestore(0, 0, 1920, 1080)
    assert(topLeft.x === 0, '0 * 1920 = 0')
    assert(topLeft.y === 0, '0 * 1080 = 0')
    
    const bottomRight = simulateWindowsRestore(1, 1, 1920, 1080)
    assert(bottomRight.x === 1920, '1 * 1920 = 1920')
    assert(bottomRight.y === 1080, '1 * 1080 = 1080')
    
    const quarter = simulateWindowsRestore(0.25, 0.25, 1920, 1080)
    assert(quarter.x === 480, '0.25 * 1920 = 480')
    assert(quarter.y === 270, '0.25 * 1080 = 270')
}

function testEndToEndCoordinatePipeline() {
    section('端到端坐标管道测试')
    
    const mockRect = { left: 0, top: 0, width: 1080, height: 607.5 }
    
    function androidSide(clientX, clientY, rect) {
        const localX = clientX - rect.left
        const localY = clientY - rect.top
        return { x: localX / rect.width, y: localY / rect.height }
    }
    
    function windowsSide(normalizedX, normalizedY, screenWidth, screenHeight) {
        return {
            x: Math.round(Math.max(0, Math.min(1, normalizedX)) * screenWidth),
            y: Math.round(Math.max(0, Math.min(1, normalizedY)) * screenHeight)
        }
    }
    
    const testPoints = [
        { clientX: 540, clientY: 303.75, expectedX: 960, expectedY: 540, name: '中心点' },
        { clientX: 0, clientY: 0, expectedX: 0, expectedY: 0, name: '左上角' },
        { clientX: 1080, clientY: 607.5, expectedX: 1920, expectedY: 1080, name: '右下角' },
        { clientX: 270, clientY: 151.875, expectedX: 480, expectedY: 270, name: '1/4位置' },
        { clientX: 810, clientY: 455.625, expectedX: 1440, expectedY: 810, name: '3/4位置' }
    ]
    
    for (const p of testPoints) {
        const normalized = androidSide(p.clientX, p.clientY, mockRect)
        const restored = windowsSide(normalized.x, normalized.y, 1920, 1080)
        const xOk = Math.abs(restored.x - p.expectedX) <= 2
        const yOk = Math.abs(restored.y - p.expectedY) <= 2
        assert(xOk && yOk, `端到端: ${p.name} → (${restored.x},${restored.y}) 期望(${ p.expectedX},${p.expectedY})`)
    }
}

function testNormalizeCoordinate() {
    section('normalizeCoordinate 函数测试')
    
    function normalizeCoordinate(value, maxValue = 65535) {
        if (value === undefined || value === null) return 0
        if (value >= 0 && value <= 1) return value
        if (value >= 0 && value <= maxValue) {
            return value / maxValue
        }
        return Math.max(0, Math.min(1, value / maxValue))
    }
    
    assertApprox(normalizeCoordinate(0), 0, 0.001, '0 → 0')
    assertApprox(normalizeCoordinate(1), 1, 0.001, '1 → 1')
    assertApprox(normalizeCoordinate(0.5), 0.5, 0.001, '0.5 → 0.5')
    assertApprox(normalizeCoordinate(0.25), 0.25, 0.001, '0.25 → 0.25')
    assertApprox(normalizeCoordinate(null), 0, 0.001, 'null → 0')
    assertApprox(normalizeCoordinate(undefined), 0, 0.001, 'undefined → 0')
}

function testUpdateDisplayRect() {
    section('_updateDisplayRect 宽高比计算测试')
    
    const t1 = new MatrixTransformer()
    t1.remoteScreenWidth = 1920
    t1.remoteScreenHeight = 1080
    t1.setScreenSize(1080, 2400)
    
    const remoteAspect = 1920 / 1080
    assertApprox(t1.displayWidth, 1080, 1, '竖屏: displayWidth = screenWidth')
    assertApprox(t1.displayHeight, 1080 / remoteAspect, 1, '竖屏: displayHeight = screenWidth/remoteAspect')
    assertApprox(t1.displayX, 0, 1, '竖屏: displayX = 0')
    assert(t1.displayY > 0, '竖屏: displayY > 0 (上下黑边)')
    
    const t2 = new MatrixTransformer()
    t2.remoteScreenWidth = 1920
    t2.remoteScreenHeight = 1080
    t2.setScreenSize(2400, 1080)
    
    assertApprox(t2.displayHeight, 1080, 1, '横屏: displayHeight = screenHeight')
    assertApprox(t2.displayWidth, 1080 * remoteAspect, 1, '横屏: displayWidth = screenHeight*remoteAspect')
    assertApprox(t2.displayY, 0, 1, '横屏: displayY = 0')
    assert(t2.displayX > 0, '横屏: displayX > 0 (左右黑边)')
}

function testClampPan() {
    section('clampPan 平移边界测试')
    
    const t = new MatrixTransformer()
    t.setScreenSize(800, 600)
    t.remoteScreenWidth = 1920
    t.remoteScreenHeight = 1080
    
    t.updateScale(2.0, 400, 300)
    
    assert(t.panX !== undefined, '缩放后panX有值')
    assert(t.panY !== undefined, '缩放后panY有值')
    
    t.updatePan(10000, 10000)
    assert(t.panX < 10000, '超大平移被clamp')
    assert(t.panY < 10000, '超大平移被clamp')
}

testDisplayToRemoteNormalized()
testContainerToRemoteWithOffset()
testContainerToRemoteWithScale()
testContainerToRemoteBoundary()
testGetBoundingClientRectSimulation()
testGetBoundingClientRectWithScale()
testWindowsSideCoordinateRestore()
testEndToEndCoordinatePipeline()
testNormalizeCoordinate()
testUpdateDisplayRect()
testClampPan()

console.log('\n========================================')
console.log('  测试工程师1: 坐标转换与事件处理测试')
console.log('========================================')
for (const r of results) {
    if (r.section) {
        console.log(`\n--- ${r.section} ---`)
    } else {
        console.log(`${r.pass ? '✓' : '✗'} ${r.msg}`)
    }
}
console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`)
if (failed > 0) {
    console.log('\n❌ 存在失败的测试!')
} else {
    console.log('\n✅ 全部测试通过!')
}

/**
 * YCDesk 输入协议单元测试
 * 
 * 测试 input-protocol.js 的完整性和正确性
 */

import {
    createInputCommand,
    parseInputCommand,
    validateInputCommand,
    INPUT_TYPES,
    MOUSE_BUTTONS
} from './input-protocol.js'

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
 * 测试 INPUT_TYPES 常量
 */
function testInputTypes() {
    console.log('\n=== 测试 INPUT_TYPES ===')
    
    assert(INPUT_TYPES.MOUSE_MOVE === 'mousemove', '鼠标移动类型正确')
    assert(INPUT_TYPES.MOUSE_DOWN === 'mousedown', '鼠标按下类型正确')
    assert(INPUT_TYPES.MOUSE_UP === 'mouseup', '鼠标释放类型正确')
    assert(INPUT_TYPES.MOUSE_WHEEL === 'wheel', '滚轮类型正确')
    assert(INPUT_TYPES.MOUSE_CLICK === 'click', '点击类型正确')
    assert(INPUT_TYPES.KEY_DOWN === 'keydown', '键盘按下类型正确')
    assert(INPUT_TYPES.KEY_UP === 'keyup', '键盘释放类型正确')
}

/**
 * 测试 MOUSE_BUTTONS 常量
 */
function testMouseButtons() {
    console.log('\n=== 测试 MOUSE_BUTTONS ===')
    
    assert(MOUSE_BUTTONS.LEFT === 0, '左键值为 0')
    assert(MOUSE_BUTTONS.MIDDLE === 1, '中键值为 1')
    assert(MOUSE_BUTTONS.RIGHT === 2, '右键值为 2')
}

/**
 * 测试 createInputCommand - 鼠标移动
 */
function testCreateMouseMove() {
    console.log('\n=== 测试创建鼠标移动命令 ===')
    
    // 测试 1: 像素坐标转归一化
    const cmd1 = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: 960,
        y: 540,
        maxX: 1920,
        maxY: 1080
    })
    
    assert(cmd1.type === 'input', '命令类型正确')
    assert(cmd1.inputType === 'mousemove', '输入类型正确')
    assert(Math.abs(cmd1.x - 0.5) < 0.01, 'X 坐标归一化正确 (960/1920 = 0.5)')
    assert(Math.abs(cmd1.y - 0.5) < 0.01, 'Y 坐标归一化正确 (540/1080 = 0.5)')
    
    // 测试 2: 已经是归一化坐标
    const cmd2 = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: 0.5,
        y: 0.5
    })
    
    assert(cmd2.x === 0.5, '归一化坐标保持不变')
    assert(cmd2.y === 0.5, '归一化坐标保持不变')
    
    // 测试 3: 边界值
    const cmd3 = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: 0,
        y: 0,
        maxX: 1920,
        maxY: 1080
    })
    
    assert(cmd3.x === 0, '左上角 X=0')
    assert(cmd3.y === 0, '左上角 Y=0')
    
    const cmd4 = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: 1920,
        y: 1080,
        maxX: 1920,
        maxY: 1080
    })
    
    assert(cmd4.x === 1, '右下角 X=1')
    assert(cmd4.y === 1, '右下角 Y=1')
}

/**
 * 测试 createInputCommand - 鼠标点击
 */
function testCreateMouseClick() {
    console.log('\n=== 测试创建鼠标点击命令 ===')
    
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_CLICK, {
        x: 0.5,
        y: 0.5,
        button: MOUSE_BUTTONS.RIGHT
    })
    
    assert(cmd.inputType === 'click', '输入类型正确')
    assert(cmd.x === 0.5, 'X 坐标正确')
    assert(cmd.y === 0.5, 'Y 坐标正确')
    assert(cmd.button === 2, '右键按钮值正确')
}

/**
 * 测试 createInputCommand - 滚轮
 */
function testCreateMouseWheel() {
    console.log('\n=== 测试创建滚轮命令 ===')
    
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_WHEEL, {
        deltaY: 100,
        deltaX: 0
    })
    
    assert(cmd.inputType === 'wheel', '输入类型正确')
    assert(cmd.deltaY === 100, '垂直滚动量正确')
    assert(cmd.deltaX === 0, '水平滚动量为 0')
}

/**
 * 测试 createInputCommand - 键盘
 */
function testCreateKeyboard() {
    console.log('\n=== 测试创建键盘命令 ===')
    
    const cmd = createInputCommand(INPUT_TYPES.KEY_DOWN, {
        code: 'KeyA',
        key: 'a',
        ctrlKey: true,
        shiftKey: false,
        altKey: true,
        metaKey: false
    })
    
    assert(cmd.inputType === 'keydown', '输入类型正确')
    assert(cmd.code === 'KeyA', '键盘代码正确')
    assert(cmd.key === 'a', '按键字符正确')
    assert(cmd.ctrlKey === true, 'Ctrl 键正确')
    assert(cmd.shiftKey === false, 'Shift 键正确')
    assert(cmd.altKey === true, 'Alt 键正确')
    assert(cmd.metaKey === false, 'Meta 键正确')
}

/**
 * 测试 validateInputCommand
 */
function testValidateCommand() {
    console.log('\n=== 测试验证命令 ===')
    
    // 有效命令
    const validCmd = {
        type: 'input',
        inputType: 'mousemove',
        x: 0.5,
        y: 0.5
    }
    
    const validResult = validateInputCommand(validCmd)
    assert(validResult.valid === true, '有效命令验证通过')
    assert(validResult.errors.length === 0, '没有错误')
    
    // 无效命令 - 缺少 type
    const invalidCmd1 = {
        inputType: 'mousemove',
        x: 0.5,
        y: 0.5
    }
    
    const invalidResult1 = validateInputCommand(invalidCmd1)
    assert(invalidResult1.valid === false, '缺少 type 的命令验证失败')
    assert(invalidResult1.errors.length > 0, '有错误信息')
    
    // 无效命令 - 缺少 inputType
    const invalidCmd2 = {
        type: 'input',
        x: 0.5,
        y: 0.5
    }
    
    const invalidResult2 = validateInputCommand(invalidCmd2)
    assert(invalidResult2.valid === false, '缺少 inputType 的命令验证失败')
    
    // 无效命令 - 坐标超出范围
    const invalidCmd3 = {
        type: 'input',
        inputType: 'mousemove',
        x: 1.5,
        y: 0.5
    }
    
    const invalidResult3 = validateInputCommand(invalidCmd3)
    assert(invalidResult3.valid === false, '坐标超出范围的命令验证失败')
}

/**
 * 测试 parseInputCommand
 */
function testParseCommand() {
    console.log('\n=== 测试解析命令 ===')
    
    // 解析鼠标移动
    const moveCmd = {
        type: 'input',
        inputType: 'mousemove',
        x: 0.5,
        y: 0.5
    }
    
    const moveInput = parseInputCommand(moveCmd)
    assert(moveInput !== null, '解析成功')
    assert(moveInput.inputType === 'mousemove', '输入类型正确')
    assert(moveInput.x === 0.5, 'X 坐标正确')
    assert(moveInput.y === 0.5, 'Y 坐标正确')
    
    // 解析鼠标点击
    const clickCmd = {
        type: 'input',
        inputType: 'mousedown',
        x: 0.3,
        y: 0.7,
        button: 2
    }
    
    const clickInput = parseInputCommand(clickCmd)
    assert(clickInput !== null, '解析成功')
    assert(clickInput.inputType === 'mousedown', '输入类型正确')
    assert(clickInput.x === 0.3, 'X 坐标正确')
    assert(clickInput.y === 0.7, 'Y 坐标正确')
    assert(clickInput.button === 2, '按钮正确')
    
    // 解析键盘
    const keyCmd = {
        type: 'input',
        inputType: 'keydown',
        code: 'Space',
        key: ' '
    }
    
    const keyInput = parseInputCommand(keyCmd)
    assert(keyInput !== null, '解析成功')
    assert(keyInput.inputType === 'keydown', '输入类型正确')
    assert(keyInput.code === 'Space', '键盘代码正确')
    assert(keyInput.key === ' ', '按键字符正确')
    
    // 解析无效命令
    const invalidInput = parseInputCommand({ invalid: 'command' })
    assert(invalidInput === null, '解析无效命令返回 null')
}

/**
 * 测试完整流程
 */
function testFullFlow() {
    console.log('\n=== 测试完整流程 ===')
    
    // 1. 创建命令
    const originalCmd = createInputCommand(INPUT_TYPES.MOUSE_DOWN, {
        x: 100,
        y: 200,
        maxX: 1920,
        maxY: 1080,
        button: MOUSE_BUTTONS.LEFT
    })
    
    console.log('原始命令:', originalCmd)
    
    // 2. 验证命令
    const validation = validateInputCommand(originalCmd)
    assert(validation.valid === true, '命令验证通过')
    
    // 3. 解析命令
    const parsedInput = parseInputCommand(originalCmd)
    assert(parsedInput !== null, '命令解析成功')
    
    // 4. 验证解析结果
    assert(parsedInput.inputType === 'mousedown', '输入类型正确')
    assert(Math.abs(parsedInput.x - (100/1920)) < 0.01, 'X 坐标正确')
    assert(Math.abs(parsedInput.y - (200/1080)) < 0.01, 'Y 坐标正确')
    assert(parsedInput.button === 0, '按钮正确')
    
    // 5. 序列化/反序列化测试
    const serialized = JSON.stringify(originalCmd)
    const deserialized = JSON.parse(serialized)
    const reparsed = parseInputCommand(deserialized)
    
    assert(reparsed !== null, '反序列化后解析成功')
    assert(reparsed.inputType === 'mousedown', '反序列化后类型正确')
}

/**
 * 运行所有测试
 */
function runAllTests() {
    console.log('╔════════════════════════════════════════╗')
    console.log('║   YCDesk 输入协议单元测试             ║')
    console.log('╚════════════════════════════════════════╝')
    
    try {
        testInputTypes()
        testMouseButtons()
        testCreateMouseMove()
        testCreateMouseClick()
        testCreateMouseWheel()
        testCreateKeyboard()
        testValidateCommand()
        testParseCommand()
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

// 导出测试函数（可选）
export {
    runAllTests,
    testInputTypes,
    testMouseButtons,
    testCreateMouseMove,
    testCreateMouseClick,
    testCreateMouseWheel,
    testCreateKeyboard,
    testValidateCommand,
    testParseCommand,
    testFullFlow
}

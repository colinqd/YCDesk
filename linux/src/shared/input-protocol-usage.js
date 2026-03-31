/**
 * YCDesk 输入协议使用示例
 * 
 * 展示如何在 Android 端和 Windows 端使用统一的输入协议
 */

// ============================================
// 示例 1: Android 主控端发送输入
// ============================================

import { createInputCommand, INPUT_TYPES, MOUSE_BUTTONS } from '../input-protocol.js'

/**
 * Android 端 - 发送鼠标移动事件
 */
function sendMouseMove(x, y, screenWidth, screenHeight, dataChannel) {
    // 创建标准化的输入命令
    const command = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: x,                    // 像素坐标
        y: y,
        maxX: screenWidth,       // 用于归一化
        maxY: screenHeight
    })
    
    // 通过数据通道发送
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
        console.log('发送鼠标移动:', command)
    }
}

/**
 * Android 端 - 发送鼠标点击事件
 */
function sendMouseClick(x, y, button, screenWidth, screenHeight, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.MOUSE_CLICK, {
        x: x,
        y: y,
        maxX: screenWidth,
        maxY: screenHeight,
        button: button  // 0=左键，1=中键，2=右键
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

/**
 * Android 端 - 发送鼠标按下事件
 */
function sendMouseDown(x, y, button, screenWidth, screenHeight, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.MOUSE_DOWN, {
        x: x,
        y: y,
        maxX: screenWidth,
        maxY: screenHeight,
        button: button
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

/**
 * Android 端 - 发送鼠标释放事件
 */
function sendMouseUp(x, y, button, screenWidth, screenHeight, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.MOUSE_UP, {
        x: x,
        y: y,
        maxX: screenWidth,
        maxY: screenHeight,
        button: button
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

/**
 * Android 端 - 发送滚轮事件
 */
function sendMouseWheel(deltaY, deltaX, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.MOUSE_WHEEL, {
        deltaY: deltaY,
        deltaX: deltaX
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

/**
 * Android 端 - 发送键盘按下事件
 */
function sendKeyDown(code, key, modifiers, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.KEY_DOWN, {
        code: code,      // 如 'KeyA', 'Space'
        key: key,        // 如 'a', ' '
        ctrlKey: modifiers.ctrl || false,
        shiftKey: modifiers.shift || false,
        altKey: modifiers.alt || false,
        metaKey: modifiers.meta || false
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

/**
 * Android 端 - 发送键盘释放事件
 */
function sendKeyUp(code, key, modifiers, dataChannel) {
    const command = createInputCommand(INPUT_TYPES.KEY_UP, {
        code: code,
        key: key,
        ctrlKey: modifiers.ctrl || false,
        shiftKey: modifiers.shift || false,
        altKey: modifiers.alt || false,
        metaKey: modifiers.meta || false
    })
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(command))
    }
}

// ============================================
// 示例 2: Windows 被控端接收输入
// ============================================

import { parseInputCommand, validateInputCommand } from '../input-protocol.js'

/**
 * Windows 端 - 处理接收到的输入
 */
function handleReceivedInput(messageData) {
    try {
        const command = JSON.parse(messageData)
        
        // 验证命令有效性
        const validation = validateInputCommand(command)
        if (!validation.valid) {
            console.error('输入验证失败:', validation.errors)
            return
        }
        
        // 解析为标准化输入对象
        const input = parseInputCommand(command)
        if (!input) {
            console.error('无效的输入命令')
            return
        }
        
        // 根据输入类型执行相应操作
        switch (input.inputType) {
            case INPUT_TYPES.MOUSE_MOVE:
                executeMouseMove(input)
                break
            case INPUT_TYPES.MOUSE_DOWN:
                executeMouseDown(input)
                break
            case INPUT_TYPES.MOUSE_UP:
                executeMouseUp(input)
                break
            case INPUT_TYPES.MOUSE_WHEEL:
                executeMouseWheel(input)
                break
            case INPUT_TYPES.KEY_DOWN:
                executeKeyDown(input)
                break
            case INPUT_TYPES.KEY_UP:
                executeKeyUp(input)
                break
            default:
                console.warn('未知的输入类型:', input.inputType)
        }
    } catch (error) {
        console.error('解析输入命令失败:', error)
    }
}

/**
 * Windows 端 - 执行鼠标移动
 */
function executeMouseMove(input) {
    // 将归一化坐标转换为屏幕坐标
    const screenInfo = getScreenInfo()
    const pixelX = input.x * screenInfo.width
    const pixelY = input.y * screenInfo.height
    
    // 使用系统 API 移动鼠标
    moveMouseTo(Math.floor(pixelX), Math.floor(pixelY))
}

/**
 * Windows 端 - 执行鼠标按下
 */
function executeMouseDown(input) {
    const screenInfo = getScreenInfo()
    const pixelX = input.x * screenInfo.width
    const pixelY = input.y * screenInfo.height
    
    const button = input.button || MOUSE_BUTTONS.LEFT
    mouseDown(button, Math.floor(pixelX), Math.floor(pixelY))
}

/**
 * Windows 端 - 执行鼠标释放
 */
function executeMouseUp(input) {
    const screenInfo = getScreenInfo()
    const pixelX = input.x * screenInfo.width
    const pixelY = input.y * screenInfo.height
    
    const button = input.button || MOUSE_BUTTONS.LEFT
    mouseUp(button, Math.floor(pixelX), Math.floor(pixelY))
}

/**
 * Windows 端 - 执行滚轮
 */
function executeMouseWheel(input) {
    const deltaY = input.deltaY || 0
    const deltaX = input.deltaX || 0
    
    mouseWheel(deltaY, deltaX)
}

/**
 * Windows 端 - 执行键盘按下
 */
function executeKeyDown(input) {
    const code = input.code
    const key = input.key
    const modifiers = {
        ctrl: input.ctrlKey,
        shift: input.shiftKey,
        alt: input.altKey,
        meta: input.metaKey
    }
    
    keyDown(code, key, modifiers)
}

/**
 * Windows 端 - 执行键盘释放
 */
function executeKeyUp(input) {
    const code = input.code
    const key = input.key
    const modifiers = {
        ctrl: input.ctrlKey,
        shift: input.shiftKey,
        alt: input.altKey,
        meta: input.metaKey
    }
    
    keyUp(code, key, modifiers)
}

// ============================================
// 辅助函数（模拟）
// ============================================

function getScreenInfo() {
    return { width: 1920, height: 1080 }
}

function moveMouseTo(x, y) {
    // 实际实现会使用系统 API
    console.log('移动鼠标到:', x, y)
}

function mouseDown(button, x, y) {
    console.log('鼠标按下:', button, '位置:', x, y)
}

function mouseUp(button, x, y) {
    console.log('鼠标释放:', button, '位置:', x, y)
}

function mouseWheel(deltaY, deltaX) {
    console.log('滚轮:', deltaY, deltaX)
}

function keyDown(code, key, modifiers) {
    console.log('键盘按下:', code, key, modifiers)
}

function keyUp(code, key, modifiers) {
    console.log('键盘释放:', code, key, modifiers)
}

// ============================================
// 测试用例
// ============================================

/**
 * 测试输入协议的完整性
 */
function runTests() {
    console.log('=== 输入协议测试 ===\n')
    
    // 测试 1: 创建鼠标移动命令
    const moveCmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
        x: 960,
        y: 540,
        maxX: 1920,
        maxY: 1080
    })
    console.log('鼠标移动命令:', moveCmd)
    console.assert(moveCmd.x >= 0 && moveCmd.x <= 1, 'X 坐标应该在 0-1 之间')
    console.assert(moveCmd.y >= 0 && moveCmd.y <= 1, 'Y 坐标应该在 0-1 之间')
    
    // 测试 2: 创建鼠标点击命令
    const clickCmd = createInputCommand(INPUT_TYPES.MOUSE_CLICK, {
        x: 0.5,
        y: 0.5,
        button: MOUSE_BUTTONS.RIGHT
    })
    console.log('鼠标点击命令:', clickCmd)
    console.assert(clickCmd.button === 2, '右键应该是 2')
    
    // 测试 3: 创建键盘命令
    const keyCmd = createInputCommand(INPUT_TYPES.KEY_DOWN, {
        code: 'KeyA',
        key: 'a',
        ctrlKey: true,
        shiftKey: false
    })
    console.log('键盘命令:', keyCmd)
    console.assert(keyCmd.ctrlKey === true, 'Ctrl 应该被按下')
    
    // 测试 4: 验证命令
    const validation = validateInputCommand(moveCmd)
    console.log('验证结果:', validation)
    console.assert(validation.valid === true, '命令应该有效')
    
    // 测试 5: 解析命令
    const parsed = parseInputCommand(moveCmd)
    console.log('解析结果:', parsed)
    console.assert(parsed.inputType === INPUT_TYPES.MOUSE_MOVE, '输入类型应该匹配')
    
    console.log('\n=== 测试完成 ===')
}

// 运行测试
runTests()

// ============================================
// 导出给外部使用
// ============================================

export {
    sendMouseMove,
    sendMouseClick,
    sendMouseDown,
    sendMouseUp,
    sendMouseWheel,
    sendKeyDown,
    sendKeyUp,
    handleReceivedInput
}

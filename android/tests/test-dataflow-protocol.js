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

function testInputCommandFormat() {
    section('输入命令格式测试')
    
    function convertToInputCommand(command) {
        const inputCommand = {
            type: 'input',
            timestamp: Date.now()
        }
        
        switch (command.type) {
            case 'mousemove':
                inputCommand.inputType = 'mousemove'
                inputCommand.x = command.x
                inputCommand.y = command.y
                break
            case 'mousedown':
                inputCommand.inputType = 'mousedown'
                inputCommand.x = command.x
                inputCommand.y = command.y
                inputCommand.button = command.button
                break
            case 'mouseup':
                inputCommand.inputType = 'mouseup'
                inputCommand.x = command.x
                inputCommand.y = command.y
                inputCommand.button = command.button
                break
            case 'click':
                inputCommand.inputType = 'click'
                inputCommand.x = command.x
                inputCommand.y = command.y
                inputCommand.button = command.button
                break
            case 'dblclick':
                inputCommand.inputType = 'dblclick'
                inputCommand.x = command.x
                inputCommand.y = command.y
                inputCommand.button = command.button
                break
            case 'wheel':
                inputCommand.inputType = 'wheel'
                inputCommand.deltaY = command.deltaY || 0
                inputCommand.deltaX = command.deltaX || 0
                break
            case 'keydown':
            case 'keyup':
                inputCommand.inputType = command.type
                inputCommand.code = command.code
                inputCommand.key = command.key
                if (command.ctrlKey) inputCommand.ctrlKey = true
                if (command.shiftKey) inputCommand.shiftKey = true
                if (command.altKey) inputCommand.altKey = true
                if (command.metaKey) inputCommand.metaKey = true
                break
            default:
                return command
        }
        
        return inputCommand
    }
    
    const mouseMove = convertToInputCommand({ type: 'mousemove', x: 0.5, y: 0.5 })
    assert(mouseMove.type === 'input', 'mousemove: type=input')
    assert(mouseMove.inputType === 'mousemove', 'mousemove: inputType=mousemove')
    assert(mouseMove.x === 0.5, 'mousemove: x=0.5')
    assert(mouseMove.y === 0.5, 'mousemove: y=0.5')
    
    const mouseDown = convertToInputCommand({ type: 'mousedown', x: 0.25, y: 0.75, button: 0 })
    assert(mouseDown.inputType === 'mousedown', 'mousedown: inputType=mousedown')
    assert(mouseDown.button === 0, 'mousedown: button=0')
    
    const mouseDownRight = convertToInputCommand({ type: 'mousedown', x: 0.5, y: 0.5, button: 2 })
    assert(mouseDownRight.button === 2, 'mousedown: button=2 (右键)')
    
    const mouseUp = convertToInputCommand({ type: 'mouseup', x: 0.5, y: 0.5, button: 0 })
    assert(mouseUp.inputType === 'mouseup', 'mouseup: inputType=mouseup')
    
    const wheel = convertToInputCommand({ type: 'wheel', deltaY: 120 })
    assert(wheel.inputType === 'wheel', 'wheel: inputType=wheel')
    assert(wheel.deltaY === 120, 'wheel: deltaY=120')
    assert(wheel.deltaX === 0, 'wheel: deltaX=0 (默认)')
    
    const dblclick = convertToInputCommand({ type: 'dblclick', x: 0.5, y: 0.5, button: 0 })
    assert(dblclick.inputType === 'dblclick', 'dblclick: inputType=dblclick')
    
    const keydown = convertToInputCommand({ type: 'keydown', code: 'KeyA', key: 'a', ctrlKey: true })
    assert(keydown.inputType === 'keydown', 'keydown: inputType=keydown')
    assert(keydown.code === 'KeyA', 'keydown: code=KeyA')
    assert(keydown.key === 'a', 'keydown: key=a')
    assert(keydown.ctrlKey === true, 'keydown: ctrlKey=true')
    assert(keydown.shiftKey === undefined, 'keydown: shiftKey未设置时为undefined')
    
    const keyup = convertToInputCommand({ type: 'keyup', code: 'ShiftLeft', key: 'Shift' })
    assert(keyup.inputType === 'keyup', 'keyup: inputType=keyup')
}

function testNormalizeCoordinate() {
    section('normalizeCoordinate 归一化测试')
    
    function normalizeCoordinate(value, maxValue = 65535) {
        if (value === undefined || value === null) return 0
        if (value >= 0 && value <= 1) return value
        if (value >= 0 && value <= maxValue) {
            return value / maxValue
        }
        return Math.max(0, Math.min(1, value / maxValue))
    }
    
    function normalizeButton(button) {
        if (typeof button === 'number') return button
        if (typeof button === 'string') {
            const lower = button.toLowerCase()
            if (lower === 'right') return 2
            if (lower === 'middle') return 1
        }
        return 0
    }
    
    assertApprox(normalizeCoordinate(0.5), 0.5, 0.001, '0~1范围值直接返回')
    assertApprox(normalizeCoordinate(0), 0, 0.001, '0直接返回')
    assertApprox(normalizeCoordinate(1), 1, 0.001, '1直接返回')
    assertApprox(normalizeCoordinate(null), 0, 0.001, 'null返回0')
    assertApprox(normalizeCoordinate(undefined), 0, 0.001, 'undefined返回0')
    
    assert(normalizeButton(0) === 0, 'button 0 → 左键')
    assert(normalizeButton(1) === 1, 'button 1 → 中键')
    assert(normalizeButton(2) === 2, 'button 2 → 右键')
    assert(normalizeButton('left') === 0, 'button "left" → 0')
    assert(normalizeButton('right') === 2, 'button "right" → 2')
    assert(normalizeButton('middle') === 1, 'button "middle" → 1')
}

function testWindowsInputHandler() {
    section('Windows被控端输入处理模拟测试')
    
    function simulateWindowsHandleMouse(normalizedX, normalizedY, screenWidth, screenHeight) {
        const x = Math.round(Math.max(0, Math.min(1, normalizedX)) * screenWidth)
        const y = Math.round(Math.max(0, Math.min(1, normalizedY)) * screenHeight)
        return { x, y }
    }
    
    let testWheelAccumY = 0
    function simulateWindowsHandleWheel(deltaY) {
        testWheelAccumY += deltaY
        const scrollAmount = Math.trunc(testWheelAccumY / 40)
        if (scrollAmount !== 0) testWheelAccumY -= scrollAmount * 40
        return scrollAmount
    }
    
    function simulateWindowsGetButtonName(button) {
        const BUTTON_MAP = { 0: 'left', 1: 'middle', 2: 'right' }
        if (typeof button === 'number') {
            return BUTTON_MAP[button] || 'left'
        }
        if (typeof button === 'string') {
            const lower = button.toLowerCase()
            if (lower === 'right') return 'right'
            if (lower === 'middle') return 'middle'
        }
        return 'left'
    }
    
    const pos1 = simulateWindowsHandleMouse(0.5, 0.5, 1920, 1080)
    assert(pos1.x === 960 && pos1.y === 540, '0.5 → (960, 540)')
    
    const pos2 = simulateWindowsHandleMouse(0, 0, 1920, 1080)
    assert(pos2.x === 0 && pos2.y === 0, '0 → (0, 0)')
    
    const pos3 = simulateWindowsHandleMouse(1, 1, 1920, 1080)
    assert(pos3.x === 1920 && pos3.y === 1080, '1 → (1920, 1080)')
    
    const scroll1 = simulateWindowsHandleWheel(40)
    assert(scroll1 === 1, 'deltaY=40 → scrollAmount=1')
    
    const scroll2 = simulateWindowsHandleWheel(20)
    assert(scroll2 === 0, 'deltaY=20 → scrollAmount=0 (未达阈值)')
    
    const scroll3 = simulateWindowsHandleWheel(20)
    assert(scroll3 === 1, 'deltaY=20 → scrollAmount=1 (累积到40)')
    
    const scroll4 = simulateWindowsHandleWheel(120)
    assert(scroll4 === 3, 'deltaY=120 → scrollAmount=3')
    
    assert(simulateWindowsGetButtonName(0) === 'left', 'button 0 → left')
    assert(simulateWindowsGetButtonName(1) === 'middle', 'button 1 → middle')
    assert(simulateWindowsGetButtonName(2) === 'right', 'button 2 → right')
}

function testWheelAccumulator() {
    section('滚轮累积器测试')
    
    class WheelAccumulator {
        constructor(threshold = 40) {
            this.accumY = 0
            this.accumX = 0
            this.threshold = threshold
        }
        add(deltaY, deltaX = 0) {
            this.accumY += deltaY
            this.accumX += deltaX
            const scrollY = Math.trunc(this.accumY / this.threshold)
            const scrollX = Math.trunc(this.accumX / this.threshold)
            if (scrollY !== 0) this.accumY -= scrollY * this.threshold
            if (scrollX !== 0) this.accumX -= scrollX * this.threshold
            return { scrollY, scrollX }
        }
    }
    
    const acc = new WheelAccumulator(40)
    
    const r1 = acc.add(20)
    assert(r1.scrollY === 0, 'deltaY=20 → scrollY=0 (未达阈值)')
    
    const r2 = acc.add(20)
    assert(r2.scrollY === 1, 'deltaY=20 → scrollY=1 (累积40)')
    
    const r3 = acc.add(60)
    assert(r3.scrollY === 1, 'deltaY=60 → scrollY=1 (累积60)')
    
    const r4 = acc.add(120)
    assert(r4.scrollY === 3, 'deltaY=120 → scrollY=3')
    
    const acc2 = new WheelAccumulator(40)
    const r5 = acc2.add(5)
    assert(r5.scrollY === 0, 'deltaY=5 → scrollY=0 (触摸板小增量)')
    const r6 = acc2.add(5)
    assert(r6.scrollY === 0, 'deltaY=5 → scrollY=0 (累积10)')
    const r7 = acc2.add(30)
    assert(r7.scrollY === 1, 'deltaY=30 → scrollY=1 (累积40)')
}

function testSignalingMessageFormat() {
    section('信令消息格式测试')
    
    const offerMsg = { type: 'offer', offer: { type: 'offer', sdp: 'mock-sdp' } }
    assert(offerMsg.type === 'offer', 'offer消息: type=offer')
    assert(offerMsg.offer.type === 'offer', 'offer消息: offer.type=offer')
    
    const answerMsg = { type: 'answer', answer: { type: 'answer', sdp: 'mock-sdp' } }
    assert(answerMsg.type === 'answer', 'answer消息: type=answer')
    
    const iceMsg = { type: 'ice-candidate', candidate: { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 } }
    assert(iceMsg.type === 'ice-candidate', 'ice消息: type=ice-candidate')
    
    const resolutionReq = { type: 'resolution-request', width: 1080, height: 2400, devicePixelRatio: 2.75 }
    assert(resolutionReq.type === 'resolution-request', '分辨率请求: type=resolution-request')
    assert(resolutionReq.width === 1080, '分辨率请求: width=1080')
    
    const resolutionResp = { type: 'resolution-response', width: 1215, height: 1080 }
    assert(resolutionResp.type === 'resolution-response', '分辨率响应: type=resolution-response')
}

function testDataChannelRouting() {
    section('DataChannel消息路由测试')
    
    function simulateDirectMessageRouter(message, isDirectControllerMode, peerConnectionState, signalingState) {
        switch (message.type) {
            case 'offer':
                if (peerConnectionState === 'connected') {
                    return 'handleRenegotiationOffer'
                } else {
                    return 'handleDirectOffer'
                }
            case 'answer':
                if (isDirectControllerMode && signalingState === 'have-local-offer') {
                    return 'handleRenegotiationAnswer'
                } else {
                    return 'handleDirectAnswer'
                }
            case 'ice-candidate':
                return 'handleDirectIceCandidate'
            case 'offer-with-video':
                return 'handleRenegotiationOffer'
            case 'heartbeat':
                return 'heartbeat'
            default:
                return 'unknown'
        }
    }
    
    assert(simulateDirectMessageRouter(
        { type: 'offer' }, false, 'new', 'stable'
    ) === 'handleDirectOffer', '初始offer → handleDirectOffer')
    
    assert(simulateDirectMessageRouter(
        { type: 'offer' }, false, 'connected', 'stable'
    ) === 'handleRenegotiationOffer', '已连接后offer → handleRenegotiationOffer')
    
    assert(simulateDirectMessageRouter(
        { type: 'answer' }, true, 'connected', 'have-local-offer'
    ) === 'handleRenegotiationAnswer', '主控端收到answer → handleRenegotiationAnswer')
    
    assert(simulateDirectMessageRouter(
        { type: 'answer' }, false, 'new', 'stable'
    ) === 'handleDirectAnswer', '初始answer → handleDirectAnswer')
    
    assert(simulateDirectMessageRouter(
        { type: 'ice-candidate' }, false, 'new', 'stable'
    ) === 'handleDirectIceCandidate', 'ICE候选 → handleDirectIceCandidate')
    
    assert(simulateDirectMessageRouter(
        { type: 'offer-with-video' }, false, 'new', 'stable'
    ) === 'handleRenegotiationOffer', 'offer-with-video → handleRenegotiationOffer')
}

function testInputChannelPriority() {
    section('输入通道优先级测试')
    
    function simulateSendInput(message, inputChannel, dataChannel) {
        if (inputChannel && inputChannel.readyState === 'open') {
            if (inputChannel.bufferedAmount < 65536) {
                return 'inputChannel'
            }
        }
        if (dataChannel && dataChannel.readyState === 'open') {
            return 'dataChannel'
        }
        return 'none'
    }
    
    assert(simulateSendInput('msg',
        { readyState: 'open', bufferedAmount: 0 },
        { readyState: 'open' }
    ) === 'inputChannel', 'inputChannel可用且未满 → inputChannel')
    
    assert(simulateSendInput('msg',
        { readyState: 'open', bufferedAmount: 70000 },
        { readyState: 'open' }
    ) === 'dataChannel', 'inputChannel缓冲区满 → dataChannel')
    
    assert(simulateSendInput('msg',
        { readyState: 'closed', bufferedAmount: 0 },
        { readyState: 'open' }
    ) === 'dataChannel', 'inputChannel关闭 → dataChannel')
    
    assert(simulateSendInput('msg',
        null,
        { readyState: 'open' }
    ) === 'dataChannel', 'inputChannel不存在 → dataChannel')
    
    assert(simulateSendInput('msg',
        null,
        { readyState: 'closed' }
    ) === 'none', '两个通道都不可用 → none')
}

function testKeyboardKeyCodeMapping() {
    section('键盘KeyCode映射测试')
    
    function getKeyFromCode(code) {
        const KEY_MAP = {
            'Backspace': 'Backspace', 'Tab': 'Tab', 'Enter': 'Enter',
            'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
            'ControlLeft': 'Control', 'ControlRight': 'Control',
            'AltLeft': 'Alt', 'AltRight': 'Alt',
            'Space': ' ', 'Escape': 'Escape',
            'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
            'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
            'Delete': 'Delete', 'Home': 'Home', 'End': 'End',
            'PageUp': 'PageUp', 'PageDown': 'PageDown',
        }
        if (KEY_MAP[code]) return KEY_MAP[code]
        if (code.startsWith('Key')) return code.slice(3).toLowerCase()
        if (code.startsWith('Digit')) return code.slice(5)
        if (code.startsWith('Numpad')) return code.slice(6)
        return code
    }
    
    assert(getKeyFromCode('KeyA') === 'a', 'KeyA → a')
    assert(getKeyFromCode('KeyZ') === 'z', 'KeyZ → z')
    assert(getKeyFromCode('Digit1') === '1', 'Digit1 → 1')
    assert(getKeyFromCode('Digit0') === '0', 'Digit0 → 0')
    assert(getKeyFromCode('Space') === ' ', 'Space → " "')
    assert(getKeyFromCode('Enter') === 'Enter', 'Enter → Enter')
    assert(getKeyFromCode('ShiftLeft') === 'Shift', 'ShiftLeft → Shift')
    assert(getKeyFromCode('ControlLeft') === 'Control', 'ControlLeft → Control')
    assert(getKeyFromCode('ArrowUp') === 'ArrowUp', 'ArrowUp → ArrowUp')
    assert(getKeyFromCode('Delete') === 'Delete', 'Delete → Delete')
}

function testConnectionCleanup() {
    section('连接清理测试')
    
    const mockState = {
        currentDirectClientId: 'test-id',
        directPeerConnection: { close: function() { this.closed = true } },
        dataChannel: { close: function() { this.closed = true } },
        inputChannel: null,
        inputChannelReady: false,
        isDirectControllerMode: false,
        isWaitingRenegotiation: false
    }
    
    function simulateCleanup(s) {
        if (s.currentDirectClientId) {
            s.currentDirectClientId = null
        }
        if (s.directPeerConnection) {
            s.directPeerConnection.close()
            s.directPeerConnection = null
        }
        if (s.dataChannel) {
            s.dataChannel = null
        }
        if (s.inputChannel) {
            s.inputChannel = null
            s.inputChannelReady = false
        }
        s.isDirectControllerMode = false
        s.isWaitingRenegotiation = false
    }
    
    simulateCleanup(mockState)
    assert(mockState.currentDirectClientId === null, 'clientId已清理')
    assert(mockState.directPeerConnection === null, 'PeerConnection已清理')
    assert(mockState.dataChannel === null, 'dataChannel已清理')
    assert(mockState.isDirectControllerMode === false, 'controllerMode已重置')
    assert(mockState.isWaitingRenegotiation === false, 'renegotiation标志已重置')
}

testInputCommandFormat()
testNormalizeCoordinate()
testWindowsInputHandler()
testWheelAccumulator()
testSignalingMessageFormat()
testDataChannelRouting()
testInputChannelPriority()
testKeyboardKeyCodeMapping()
testConnectionCleanup()

console.log('\n========================================')
console.log('  测试工程师2: 连接数据流与输入协议测试')
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

/**
 * YCDesk 输入协议单元测试
 *
 * 测试 input-protocol.js 的完整性和正确性
 * 使用 Vitest describe/it/expect 模式
 */

import { describe, it, expect } from 'vitest'
import {
  createInputCommand,
  parseInputCommand,
  validateInputCommand,
  normalizeCoordinate,
  normalizeButton,
  getKeyFromCode,
  isModifierKey,
  isDeltaInputType,
  isBatchInputType,
  INPUT_TYPES,
  MOUSE_BUTTONS,
  THROTTLE_CONFIG,
  KEY_CODE_MAP
} from './input-protocol.js'

// ==================== 常量测试 ====================

describe('INPUT_TYPES 常量', () => {
  it('鼠标移动类型为 mousemove', () => {
    expect(INPUT_TYPES.MOUSE_MOVE).toBe('mousemove')
  })
  it('鼠标增量移动类型为 mousemove_delta', () => {
    expect(INPUT_TYPES.MOUSE_MOVE_DELTA).toBe('mousemove_delta')
  })
  it('鼠标按下类型为 mousedown', () => {
    expect(INPUT_TYPES.MOUSE_DOWN).toBe('mousedown')
  })
  it('鼠标释放类型为 mouseup', () => {
    expect(INPUT_TYPES.MOUSE_UP).toBe('mouseup')
  })
  it('滚轮类型为 wheel', () => {
    expect(INPUT_TYPES.MOUSE_WHEEL).toBe('wheel')
  })
  it('批量滚轮类型为 wheel_batch', () => {
    expect(INPUT_TYPES.MOUSE_WHEEL_BATCH).toBe('wheel_batch')
  })
  it('点击类型为 click', () => {
    expect(INPUT_TYPES.MOUSE_CLICK).toBe('click')
  })
  it('双击类型为 dblclick', () => {
    expect(INPUT_TYPES.MOUSE_DBLCLICK).toBe('dblclick')
  })
  it('键盘按下类型为 keydown', () => {
    expect(INPUT_TYPES.KEY_DOWN).toBe('keydown')
  })
  it('键盘释放类型为 keyup', () => {
    expect(INPUT_TYPES.KEY_UP).toBe('keyup')
  })
  it('解锁屏类型为 unlock_screen', () => {
    expect(INPUT_TYPES.UNLOCK_SCREEN).toBe('unlock_screen')
  })
  it('锁屏类型为 lock_screen', () => {
    expect(INPUT_TYPES.LOCK_SCREEN).toBe('lock_screen')
  })
  it('文本输入类型为 text_input', () => {
    expect(INPUT_TYPES.TEXT_INPUT).toBe('text_input')
  })
})

describe('MOUSE_BUTTONS 常量', () => {
  it('左键值为 0', () => {
    expect(MOUSE_BUTTONS.LEFT).toBe(0)
  })
  it('中键值为 1', () => {
    expect(MOUSE_BUTTONS.MIDDLE).toBe(1)
  })
  it('右键值为 2', () => {
    expect(MOUSE_BUTTONS.RIGHT).toBe(2)
  })
})

describe('THROTTLE_CONFIG 常量', () => {
  it('鼠标移动间隔为 8ms', () => {
    expect(THROTTLE_CONFIG.MOUSE_MOVE_INTERVAL_MS).toBe(8)
  })
  it('鼠标移动最小距离为 2px', () => {
    expect(THROTTLE_CONFIG.MOUSE_MOVE_MIN_DISTANCE_PX).toBe(2)
  })
  it('滚轮批量间隔为 16ms', () => {
    expect(THROTTLE_CONFIG.WHEEL_BATCH_INTERVAL_MS).toBe(16)
  })
  it('空闲超时为 100ms', () => {
    expect(THROTTLE_CONFIG.IDLE_TIMEOUT_MS).toBe(100)
  })
})

// ==================== normalizCoordinate ====================

describe('normalizeCoordinate', () => {
  it('0~1 之间的值保持不变', () => {
    expect(normalizeCoordinate(0.5)).toBe(0.5)
    expect(normalizeCoordinate(0)).toBe(0)
    expect(normalizeCoordinate(1)).toBe(1)
    expect(normalizeCoordinate(0.333)).toBe(0.333)
  })

  it('像素坐标按 maxValue 归一化', () => {
    expect(normalizeCoordinate(960, 1920)).toBe(0.5)
    expect(normalizeCoordinate(540, 1080)).toBe(0.5)
    expect(normalizeCoordinate(0, 1920)).toBe(0)
    expect(normalizeCoordinate(1920, 1920)).toBe(1)
  })

  it('maxValue 为 0 时返回原值', () => {
    expect(normalizeCoordinate(100, 0)).toBe(100)
  })

  it('无 maxValue 时使用默认值 65535', () => {
    const result = normalizeCoordinate(32767)
    expect(result).toBeCloseTo(0.5, 4)
  })

  it('负数值被钳制为 0', () => {
    const result = normalizeCoordinate(-1, 1920)
    expect(result).toBe(0)
  })
})

// ==================== normalizeButton ====================

describe('normalizeButton', () => {
  it('数字按钮值保持不变', () => {
    expect(normalizeButton(0)).toBe(0)
    expect(normalizeButton(1)).toBe(1)
    expect(normalizeButton(2)).toBe(2)
  })

  it('字符串 "left" 转为 0', () => {
    expect(normalizeButton('left')).toBe(0)
    expect(normalizeButton('LEFT')).toBe(0)
    expect(normalizeButton('Left')).toBe(0)
  })

  it('字符串 "middle" 转为 1', () => {
    expect(normalizeButton('middle')).toBe(1)
  })

  it('字符串 "right" 转为 2', () => {
    expect(normalizeButton('right')).toBe(2)
  })

  it('未知字符串默认返回 0', () => {
    expect(normalizeButton('unknown')).toBe(0)
  })

  it('undefined 返回 0', () => {
    expect(normalizeButton(undefined)).toBe(0)
  })

  it('null 返回 0', () => {
    expect(normalizeButton(null)).toBe(0)
  })
})

// ==================== createInputCommand ====================

describe('createInputCommand - 基础属性', () => {
  it('返回对象包含 type=input 和指定的 inputType', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 0.5, y: 0.5 })
    expect(cmd.type).toBe('input')
    expect(cmd.inputType).toBe('mousemove')
  })

  it('自动添加时间戳', () => {
    const before = Date.now()
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 0.5, y: 0.5 })
    const after = Date.now()
    expect(cmd.timestamp).toBeGreaterThanOrEqual(before)
    expect(cmd.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('createInputCommand - 鼠标移动', () => {
  it('像素坐标转归一化坐标', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, {
      x: 960, y: 540, maxX: 1920, maxY: 1080
    })
    expect(cmd.x).toBeCloseTo(0.5, 4)
    expect(cmd.y).toBeCloseTo(0.5, 4)
  })

  it('已归一化坐标保持不变', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 0.5, y: 0.5 })
    expect(cmd.x).toBe(0.5)
    expect(cmd.y).toBe(0.5)
  })

  it('左上角 (0,0) 归一化为 (0,0)', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 0, y: 0, maxX: 1920, maxY: 1080 })
    expect(cmd.x).toBe(0)
    expect(cmd.y).toBe(0)
  })

  it('右下角 (1920,1080) 归一化为 (1,1)', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 1920, y: 1080, maxX: 1920, maxY: 1080 })
    expect(cmd.x).toBe(1)
    expect(cmd.y).toBe(1)
  })
})

describe('createInputCommand - 鼠标点击', () => {
  it('包含坐标和按钮信息', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_CLICK, {
      x: 0.5, y: 0.5, button: MOUSE_BUTTONS.RIGHT
    })
    expect(cmd.inputType).toBe('click')
    expect(cmd.x).toBe(0.5)
    expect(cmd.y).toBe(0.5)
    expect(cmd.button).toBe(2)
  })
})

describe('createInputCommand - 增量移动', () => {
  it('包含 dx/dy 增量值', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE_DELTA, { dx: 10, dy: -5 })
    expect(cmd.inputType).toBe('mousemove_delta')
    expect(cmd.dx).toBe(10)
    expect(cmd.dy).toBe(-5)
  })
})

describe('createInputCommand - 滚轮', () => {
  it('包含 deltaY/deltaX', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_WHEEL, { deltaY: 100, deltaX: 0 })
    expect(cmd.inputType).toBe('wheel')
    expect(cmd.deltaY).toBe(100)
    expect(cmd.deltaX).toBe(0)
  })
})

describe('createInputCommand - 批量滚轮', () => {
  it('包含 accumulatedDeltaY/X', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_WHEEL_BATCH, { accumulatedDeltaY: 240, accumulatedDeltaX: 0 })
    expect(cmd.inputType).toBe('wheel_batch')
    expect(cmd.accumulatedDeltaY).toBe(240)
    expect(cmd.accumulatedDeltaX).toBe(0)
  })
})

describe('createInputCommand - 键盘', () => {
  it('包含键盘信息和修饰键', () => {
    const cmd = createInputCommand(INPUT_TYPES.KEY_DOWN, {
      code: 'KeyA', key: 'a',
      ctrlKey: true, shiftKey: false, altKey: true, metaKey: false
    })
    expect(cmd.inputType).toBe('keydown')
    expect(cmd.code).toBe('KeyA')
    expect(cmd.key).toBe('a')
    expect(cmd.ctrlKey).toBe(true)
    expect(cmd.shiftKey).toBe(false)
    expect(cmd.altKey).toBe(true)
    expect(cmd.metaKey).toBe(false)
  })

  it('可创建 KEY_UP 命令', () => {
    const cmd = createInputCommand(INPUT_TYPES.KEY_UP, { code: 'KeyB', key: 'b' })
    expect(cmd.inputType).toBe('keyup')
    expect(cmd.code).toBe('KeyB')
  })
})

describe('createInputCommand - 解锁/锁屏', () => {
  it('解锁命令包含密码', () => {
    const cmd = createInputCommand(INPUT_TYPES.UNLOCK_SCREEN, { password: 'mypassword' })
    expect(cmd.inputType).toBe('unlock_screen')
    expect(cmd.password).toBe('mypassword')
  })

  it('锁屏命令无需额外数据', () => {
    const cmd = createInputCommand(INPUT_TYPES.LOCK_SCREEN)
    expect(cmd.inputType).toBe('lock_screen')
    expect(cmd.password).toBeUndefined()
  })
})

describe('createInputCommand - 文本输入', () => {
  it('包含文本内容', () => {
    const cmd = createInputCommand(INPUT_TYPES.TEXT_INPUT, { text: 'hello' })
    expect(cmd.inputType).toBe('text_input')
    expect(cmd.text).toBe('hello')
  })
})

describe('createInputCommand - sequenceId', () => {
  it('可以附带 sequenceId', () => {
    const cmd = createInputCommand(INPUT_TYPES.MOUSE_MOVE, { x: 0.5, y: 0.5, sequenceId: 42 })
    expect(cmd.sequenceId).toBe(42)
  })
})

// ==================== validateInputCommand ====================

describe('validateInputCommand', () => {
  it('有效的鼠标移动命令通过验证', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousemove', x: 0.5, y: 0.5
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('null 命令验证失败', () => {
    const result = validateInputCommand(null)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('非对象命令验证失败', () => {
    const result = validateInputCommand('string')
    expect(result.valid).toBe(false)
  })

  it('缺少 type 的命令验证失败', () => {
    const result = validateInputCommand({ inputType: 'mousemove', x: 0.5 })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('命令类型必须是 "input"')
  })

  it('错误的 type 值验证失败', () => {
    const result = validateInputCommand({ type: 'command', inputType: 'mousemove' })
    expect(result.valid).toBe(false)
  })

  it('缺少 inputType 验证失败', () => {
    const result = validateInputCommand({ type: 'input' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少有效的 inputType')
  })

  it('无效的 inputType 值验证失败', () => {
    const result = validateInputCommand({ type: 'input', inputType: 'invalid_type' })
    expect(result.valid).toBe(false)
  })

  it('坐标值超出范围 (x>1) 不验证失败（仅检查类型）', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousemove', x: 1.5, y: 0.5
    })
    // 当前实现仅验证类型而非范围
    expect(result.valid).toBe(true)
  })

  it('坐标值超出范围 (x<0) 不验证失败（仅检查类型）', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousemove', x: -0.1, y: 0.5
    })
    // 当前实现仅验证类型而非范围
    expect(result.valid).toBe(true)
  })

  it('非数字 x 验证失败', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousemove', x: 'abc', y: 0.5
    })
    expect(result.valid).toBe(false)
  })

  it('button 超出范围 (3) 验证失败', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousedown', x: 0.5, y: 0.5, button: 3
    })
    expect(result.valid).toBe(false)
  })

  it('解锁命令无密码验证失败', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'unlock_screen'
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('解锁命令必须包含 password')
  })

  it('解锁命令含密码验证通过', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'unlock_screen', password: 'secret'
    })
    expect(result.valid).toBe(true)
  })

  it('锁屏命令始终验证通过', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'lock_screen'
    })
    expect(result.valid).toBe(true)
  })

  it('非数字 dx/dy 验证失败', () => {
    const result = validateInputCommand({
      type: 'input', inputType: 'mousemove_delta', dx: 'abc', dy: 10
    })
    expect(result.valid).toBe(false)
  })
})

// ==================== parseInputCommand ====================

describe('parseInputCommand', () => {
  it('解析有效的鼠标移动命令', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'mousemove', x: 0.5, y: 0.5
    })
    expect(input).not.toBeNull()
    expect(input.inputType).toBe('mousemove')
    expect(input.x).toBe(0.5)
    expect(input.y).toBe(0.5)
  })

  it('解析有效的鼠标点击命令', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'mousedown', x: 0.3, y: 0.7, button: 2
    })
    expect(input).not.toBeNull()
    expect(input.inputType).toBe('mousedown')
    expect(input.x).toBe(0.3)
    expect(input.y).toBe(0.7)
    expect(input.button).toBe(2)
  })

  it('解析有效的键盘命令', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'keydown', code: 'Space', key: ' '
    })
    expect(input).not.toBeNull()
    expect(input.inputType).toBe('keydown')
    expect(input.code).toBe('Space')
    expect(input.key).toBe(' ')
  })

  it('解析解锁命令含密码', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'unlock_screen', password: 'secret'
    })
    expect(input).not.toBeNull()
    expect(input.password).toBe('secret')
  })

  it('解析文本输入命令', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'text_input', text: '你好'
    })
    expect(input).not.toBeNull()
    expect(input.text).toBe('你好')
  })

  it('type 不为 input 时返回 null', () => {
    const result = parseInputCommand({ type: 'invalid' })
    expect(result).toBeNull()
  })

  it('解析空对象返回 null', () => {
    const result = parseInputCommand({})
    expect(result).toBeNull()
  })

  it('解析 null 返回 null', () => {
    const result = parseInputCommand(null)
    expect(result).toBeNull()
  })

  it('修饰键默认值为 false', () => {
    const input = parseInputCommand({
      type: 'input', inputType: 'keydown', code: 'KeyA'
    })
    expect(input.ctrlKey).toBe(false)
    expect(input.shiftKey).toBe(false)
    expect(input.altKey).toBe(false)
    expect(input.metaKey).toBe(false)
  })
})

// ==================== getKeyFromCode ====================

describe('getKeyFromCode', () => {
  it('已知 code 返回对应字符', () => {
    expect(getKeyFromCode('KeyA')).toBe('a')
    expect(getKeyFromCode('Space')).toBe(' ')
    expect(getKeyFromCode('Enter')).toBe('Enter')
    expect(getKeyFromCode('Digit1')).toBe('1')
  })

  it('未知 code 返回原值', () => {
    expect(getKeyFromCode('UnknownCode')).toBe('UnknownCode')
  })

  it('KEY_CODE_MAP 包含所有字母键', () => {
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i)
      expect(KEY_CODE_MAP['Key' + letter]).toBe(letter.toLowerCase())
    }
  })
})

// ==================== isModifierKey ====================

describe('isModifierKey', () => {
  it('ControlLeft/Right 是修饰键', () => {
    expect(isModifierKey('ControlLeft')).toBe(true)
    expect(isModifierKey('ControlRight')).toBe(true)
  })

  it('ShiftLeft/Right 是修饰键', () => {
    expect(isModifierKey('ShiftLeft')).toBe(true)
    expect(isModifierKey('ShiftRight')).toBe(true)
  })

  it('AltLeft/Right 是修饰键', () => {
    expect(isModifierKey('AltLeft')).toBe(true)
    expect(isModifierKey('AltRight')).toBe(true)
  })

  it('MetaLeft/Right 是修饰键', () => {
    expect(isModifierKey('MetaLeft')).toBe(true)
    expect(isModifierKey('MetaRight')).toBe(true)
  })

  it('CapsLock/NumLock/ScrollLock 是修饰键', () => {
    expect(isModifierKey('CapsLock')).toBe(true)
    expect(isModifierKey('NumLock')).toBe(true)
    expect(isModifierKey('ScrollLock')).toBe(true)
  })

  it('普通键不是修饰键', () => {
    expect(isModifierKey('KeyA')).toBe(false)
    expect(isModifierKey('Space')).toBe(false)
    expect(isModifierKey('Enter')).toBe(false)
  })
})

// ==================== isDeltaInputType / isBatchInputType ====================

describe('isDeltaInputType', () => {
  it('MOUSE_MOVE_DELTA 返回 true', () => {
    expect(isDeltaInputType(INPUT_TYPES.MOUSE_MOVE_DELTA)).toBe(true)
  })

  it('其他类型返回 false', () => {
    expect(isDeltaInputType(INPUT_TYPES.MOUSE_MOVE)).toBe(false)
    expect(isDeltaInputType(INPUT_TYPES.KEY_DOWN)).toBe(false)
  })
})

describe('isBatchInputType', () => {
  it('MOUSE_WHEEL_BATCH 返回 true', () => {
    expect(isBatchInputType(INPUT_TYPES.MOUSE_WHEEL_BATCH)).toBe(true)
  })

  it('其他类型返回 false', () => {
    expect(isBatchInputType(INPUT_TYPES.MOUSE_WHEEL)).toBe(false)
    expect(isBatchInputType(INPUT_TYPES.KEY_DOWN)).toBe(false)
  })
})

// ==================== 完整流程 ====================

describe('完整流程：创建 → 验证 → 解析 → 序列化', () => {
  it('鼠标按下命令完整流程', () => {
    // 1. 创建
    const original = createInputCommand(INPUT_TYPES.MOUSE_DOWN, {
      x: 100, y: 200, maxX: 1920, maxY: 1080, button: MOUSE_BUTTONS.LEFT
    })
    expect(original.type).toBe('input')
    expect(original.inputType).toBe('mousedown')

    // 2. 验证
    const validation = validateInputCommand(original)
    expect(validation.valid).toBe(true)

    // 3. 解析
    const parsed = parseInputCommand(original)
    expect(parsed).not.toBeNull()
    expect(parsed.inputType).toBe('mousedown')
    expect(parsed.x).toBeCloseTo(100 / 1920, 4)
    expect(parsed.y).toBeCloseTo(200 / 1080, 4)
    expect(parsed.button).toBe(0)

    // 4. 序列化/反序列化
    const serialized = JSON.parse(JSON.stringify(original))
    const reparsed = parseInputCommand(serialized)
    expect(reparsed).not.toBeNull()
    expect(reparsed.inputType).toBe('mousedown')
  })

  it('键盘命令完整流程', () => {
    const original = createInputCommand(INPUT_TYPES.KEY_DOWN, {
      code: 'KeyA', key: 'a', ctrlKey: true
    })
    expect(validateInputCommand(original).valid).toBe(true)

    const parsed = parseInputCommand(original)
    expect(parsed.code).toBe('KeyA')
    expect(parsed.ctrlKey).toBe(true)
  })
})

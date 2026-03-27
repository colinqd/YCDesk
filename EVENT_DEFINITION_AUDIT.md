# 事件定义一致性审查报告

## 一、标准事件定义 (input-protocol.js)

| 事件类型 | 说明 | 状态 |
|----------|------|------|
| `mousemove` | 鼠标移动 | ✓ 标准 |
| `mousedown` | 鼠标按下 | ✓ 标准 |
| `mouseup` | 鼠标释放 | ✓ 标准 |
| `wheel` | 鼠标滚轮 | ✓ 标准 |
| `keydown` | 键盘按下 | ✓ 标准 |
| `keyup` | 键盘释放 | ✓ 标准 |

---

## 二、Android端事件使用情况

### 2.1 InputDispatcher.dispatchTouchInput() 事件转换

| 输入类型 | 转换后 | 说明 | 问题 |
|----------|--------|------|------|
| `mousemove` | `mousemove` | ✓ 正确 | 无 |
| `mousedown` | `mousedown` | ✓ 正确 | 无 |
| `mouseup` | `mouseup` | ✓ 正确 | 无 |
| `wheel` | `wheel` | ✓ 正确 | 无 |
| `dblclick` | `click` | ⚠️ 转换 | 与convertToInputCommand不一致 |
| `doubleclick` | `click` | ⚠️ 转换 | 与convertToInputCommand不一致 |
| `dragstart` | `mousedown` | ✓ 正确 | 无 |
| `dragend` | `mouseup` | ✓ 正确 | 无 |

### 2.2 convertToInputCommand() 事件处理

| 输入类型 | 输出类型 | 说明 | 问题 |
|----------|----------|------|------|
| `mousemove` | `mousemove` | ✓ 正确 | 无 |
| `mousedown` | `mousedown` | ✓ 正确 | 无 |
| `mouseup` | `mouseup` | ✓ 正确 | 无 |
| `wheel` | `wheel` | ✓ 正确 | 无 |
| `click` | `click` | ⚠️ 额外 | 协议未定义 |
| `mouse-click` | `click` | ⚠️ 别名 | 协议未定义 |
| `dblclick` | `dblclick` | ⚠️ 额外 | 与InputDispatcher不一致 |
| `doubleclick` | `dblclick` | ⚠️ 别名 | 与InputDispatcher不一致 |
| `keydown` | `keydown` | ✓ 正确 | 无 |
| `keyup` | `keyup` | ✓ 正确 | 无 |
| `keyboard` | `command.eventType` | ⚠️ 旧格式 | 应该废弃 |

---

## 三、Windows端事件处理

| 事件类型 | 处理函数 | 说明 | 问题 |
|----------|----------|------|------|
| `mousemove` | handleMouseMove() | ✓ 正确 | 无 |
| `mousedown` | handleMouseDown() | ✓ 正确 | 无 |
| `mouseup` | handleMouseUp() | ✓ 正确 | 无 |
| `wheel` | handleMouseWheel() | ✓ 正确 | 无 |
| `keydown` | handleKeyDown() | ✓ 正确 | 无 |
| `keyup` | handleKeyUp() | ✓ 正确 | 无 |
| `click` | handleClick() | ⚠️ 额外 | 协议未定义 |
| `dblclick` | handleDoubleClick() | ⚠️ 额外 | 协议未定义 |

---

## 四、发现的问题

### 🔴 问题1: 双击事件处理不一致

**位置**: 
- `android/js/InputDispatcher.js:305-307`
- `android/app.js:1801-1807`

**问题描述**:
- `InputDispatcher` 将 `dblclick` 转换为 `click`
- `convertToInputCommand` 保持 `dblclick` 不变
- Windows端有独立的 `handleDoubleClick` 处理 `dblclick`

**影响**: 双击功能可能无法正常工作

**修复方案**: 统一双击事件处理逻辑

---

### 🔴 问题2: 单击事件未在协议中定义

**位置**: 
- `android/app.js:1793-1799`
- `src/main/input-handler.js:76-78`

**问题描述**:
- `click` 事件在协议中未定义
- 但两端都在使用

**影响**: 功能正常，但协议不完整

**修复方案**: 将 `click` 和 `dblclick` 添加到协议中

---

### 🟡 问题3: 键盘事件旧格式

**位置**: `android/app.js:1827-1835`

**问题描述**:
- 存在 `keyboard` 旧格式处理
- 应该统一使用 `keydown` 和 `keyup`

**影响**: 代码冗余，可能造成混淆

**修复方案**: 移除旧格式处理

---

### 🟡 问题4: 事件别名过多

**位置**: `android/app.js:convertToInputCommand()`

**问题描述**:
- `mouse-click` → `click`
- `mouse-wheel` → `wheel`
- `doubleclick` → `dblclick`

**影响**: 增加维护复杂度

**修复方案**: 统一使用标准事件名

---

## 五、修复建议

### 5.1 更新输入协议

在 `input-protocol.js` 中添加：

```javascript
const INPUT_TYPES = {
  MOUSE_MOVE: 'mousemove',
  MOUSE_DOWN: 'mousedown',
  MOUSE_UP: 'mouseup',
  MOUSE_WHEEL: 'wheel',
  MOUSE_CLICK: 'click',        // 新增
  MOUSE_DBLCLICK: 'dblclick',  // 新增
  KEY_DOWN: 'keydown',
  KEY_UP: 'keyup'
}
```

### 5.2 统一Android端事件转换

在 `InputDispatcher.dispatchTouchInput()` 中：

```javascript
case 'dblclick':
case 'doubleclick':
    commandType = 'dblclick';  // 改为 dblclick，不再转换为 click
    break;
```

### 5.3 移除旧格式处理

在 `convertToInputCommand()` 中移除：

```javascript
case 'keyboard':
    // 移除此分支，统一使用 keydown/keyup
```

### 5.4 简化事件别名

建议移除以下别名：
- `mouse-click` → 直接使用 `click`
- `mouse-wheel` → 直接使用 `wheel`
- `doubleclick` → 直接使用 `dblclick`

---

## 六、事件流程图

```
Android端触摸事件
    ↓
GestureHandler.handleTouchStart()
    ↓
InputDispatcher.dispatchTouchInput(type='mousedown')
    ↓
sendControlCommand({type: 'mousedown', x, y})
    ↓
convertToInputCommand({type: 'mousedown', x, y})
    ↓
{type: 'input', inputType: 'mousedown', x, y}
    ↓
WebRTC DataChannel
    ↓
Windows端 handleRemoteInput()
    ↓
handleMouseDown()
```

---

## 七、修复优先级

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | 双击事件不一致 | 功能异常 |
| P1 | 协议不完整 | 维护困难 |
| P2 | 旧格式处理 | 代码冗余 |
| P3 | 事件别名过多 | 维护复杂 |

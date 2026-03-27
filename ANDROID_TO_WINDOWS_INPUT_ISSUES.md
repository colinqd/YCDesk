# Android主控端 → Windows被控端 输入问题分析报告

## 概述
本文档详细分析了YCDesk项目中Android主控端无法正确发送键盘和鼠标输入到Windows被控端的所有问题点及解决方案。

---

## 一、完整数据流分析

### 期望的数据流
```
Android用户输入
    ↓
GestureHandler/InputDispatcher
    ↓
sendControlCommand()
    ↓
convertToInputCommand()  ← 问题1：类型转换
    ↓
dataChannel.send()
    ↓ (WebRTC数据通道)
Windows接收
    ↓
setupDataChannel().onmessage
    ↓
handleReceivedInput()
    ↓
InputExecutor.executeInput() / Windows input-handler.js
    ↓
实际执行输入
```

---

## 二、问题1：输入命令类型不一致 ⚠️ 高优先级

### 问题位置
- `android/app.js:1981-2005` - 直接调用 `sendControlCommand` 使用旧类型
- `android/app.js:1745-1801` - `convertToInputCommand` 函数内部

### 发现的问题

| 位置 | 旧类型（错误） | 新类型（正确） | 文件行号 |
|------|--------------|--------------|---------|
| 直接调用 | `'mouse-move'` | `'mousemove'` | android/app.js:1982, 1998 |
| 直接调用 | `'mouse-down'` | `'mousedown'` | android/app.js:1987, 2003 |
| 直接调用 | `'mouse-up'` | `'mouseup'` | 需要确认 |
| convertToInputCommand | `'mouse-click'` | `'click'` | android/app.js:1772 |
| convertToInputCommand | `'mouse-wheel'` | `'wheel'` | android/app.js:1779 |
| convertToInputCommand | `'keyboard'` | 需拆分为 `'keydown'/'keyup'` | android/app.js:1785 |

### 解决方案
需要修改两处：

#### 2.1 修改直接调用 `sendControlCommand` 的地方
```javascript
// 修改前
sendControlCommand({
  type: 'mouse-move',  // ❌ 错误
  x: x,
  y: y
})

// 修改后
sendControlCommand({
  type: 'mousemove',  // ✅ 正确
  x: x,
  y: y
})
```

#### 2.2 修改 `convertToInputCommand` 函数
需要更新所有 case 语句以使用正确的类型。

---

## 三、问题2：命令结构不匹配 ⚠️ 高优先级

### 问题分析
`convertToInputCommand` 函数返回的结构与 `input-protocol.js` 定义的不匹配。

### input-protocol.js 期望的结构
```javascript
{
  type: 'input',
  inputType: 'mousemove',  // 注意这里是 inputType，不是 type
  x: 0.5,
  y: 0.5,
  timestamp: 1234567890
}
```

### convertToInputCommand 当前的结构
看起来结构大致正确，但需要确认所有字段都正确设置。

---

## 四、问题3：坐标归一化不一致 ⚠️ 高优先级

### 问题位置
- `android/app.js:1803-1810` - `normalizeCoordinate` 函数
- `src/shared/input-protocol.js:63-71` - `normalizeCoordinate` 函数

### 函数对比

| 特性 | Android 版本 | 共享版本 | 是否一致 |
|------|------------|---------|---------|
| 默认 maxValue | 65535 | 65535 | ✅ |
| 0-1 值处理 | 直接返回 | 直接返回 | ✅ |
| 范围检查 | 有 (0-1) | 有 (0-1) | ✅ |

**好消息：** 坐标归一化函数逻辑基本一致！

---

## 五、问题4：键盘输入缺失处理 ⚠️ 高优先级

### 问题位置
- `android/app.js:1785-1793` - `'keyboard'` case

### 发现的问题
`convertToInputCommand` 中有 `'keyboard'` 类型的处理，但：
1. 这个类型在 `INPUT_TYPES` 中不存在
2. 需要拆分为 `'keydown'` 和 `'keyup'`
3. 修饰键（ctrlKey、shiftKey等）处理可能不完整

### 解决方案
修改 `convertToInputCommand` 函数，移除 `'keyboard'` case，直接处理 `'keydown'` 和 `'keyup'`。

---

## 六、问题5：鼠标坐标计算问题 ⚠️ 中优先级

### 问题位置
- `android/app.js:1975-1978` - 坐标计算逻辑

### 当前代码
```javascript
const scaledX = (touch.clientX - rect.left) / currentScale
const scaledY = (touch.clientY - rect.top) / currentScale
const x = Math.round(scaledX / rect.width * 65535)
const y = Math.round(scaledY / rect.height * 65535)
```

### 潜在问题
1. `currentScale` 的来源和值需要确认
2. `rect` 是哪个元素的 bounding rect？
3. 是否正确考虑了视频的显示区域（letterbox/pillarbox）？

### 建议
使用 `MatrixTransformer` 类来处理坐标变换，而不是手动计算。

---

## 七、问题6：Windows端接收处理 ⚠️ 中优先级

### 需要检查的文件
- `src/main/input-handler.js` - Windows端输入执行
- Windows端远程窗口的数据通道接收

### 检查清单
- [ ] `handleReceivedInput` 函数是否正确调用
- [ ] `inputType` 是否被正确识别
- [ ] 修饰键状态是否正确维护
- [ ] 坐标是否从归一化值正确转换为屏幕像素

---

## 八、修复优先级和顺序

### 优先级 P0 - 立即修复（阻断功能）
1. ✅ 统一输入协议类型（已部分完成）
2. 🔄 修复 `android/app.js` 中剩余的类型不一致
3. 🔄 修复 `convertToInputCommand` 函数

### 优先级 P1 - 尽快修复
4. 🔄 完善键盘输入处理
5. 🔄 验证坐标计算逻辑

### 优先级 P2 - 中期优化
6. 🔄 使用 MatrixTransformer 统一坐标处理
7. 🔄 添加详细的调试日志

---

## 九、调试建议

### 添加详细日志
在关键位置添加日志输出：

```javascript
// sendControlCommand 中
log('发送控制命令:', JSON.stringify(command))
log('转换后:', JSON.stringify(inputCommand))

// Windows端接收时
log('收到数据通道消息:', JSON.stringify(data))

// input-handler.js 中
log('处理输入:', inputData.inputType, inputData)
```

### 测试用命令
可以发送测试命令验证通道：
```javascript
// 测试鼠标移动
sendControlCommand({
  type: 'mousemove',
  x: 0.5,
  y: 0.5
})

// 测试键盘按下
sendControlCommand({
  type: 'keydown',
  code: 'KeyA',
  key: 'a'
})
```

---

## 十、完整的修复清单

| 文件 | 需要修改的内容 | 优先级 |
|------|--------------|-------|
| `android/app.js:1981-2005` | 将 `'mouse-move'` 改为 `'mousemove'`，`'mouse-down'` 改为 `'mousedown'` | P0 |
| `android/app.js:1745-1801` | 更新 `convertToInputCommand` 的所有 case | P0 |
| `android/app.js:1785-1793` | 移除 `'keyboard'` case，直接处理 `'keydown'/'keyup'` | P0 |
| `android/app.js` | 添加 `MatrixTransformer` 的正确使用 | P1 |
| `src/main/input-handler.js` | 验证所有输入类型都被处理 | P1 |
| 所有相关文件 | 添加调试日志 | P2 |

---

## 总结

主要问题集中在 **输入命令类型不一致**，这是导致Android端输入无法在Windows端生效的根本原因。修复类型问题后，其他问题（如坐标准确性）可以进一步优化。

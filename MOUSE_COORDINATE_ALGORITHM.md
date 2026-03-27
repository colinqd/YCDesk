# 鼠标坐标换算算法详细说明

## 坐标系统总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Android端坐标系统                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 视口坐标 (clientX, clientY)                                  │
│     └─ 来自触摸事件的原始坐标，相对于浏览器窗口                     │
│                                                                 │
│  2. 容器坐标 (containerX, containerY)                            │
│     └─ 相对于 videoContainer 元素的坐标                          │
│                                                                 │
│  3. 显示坐标 (displayX, displayY)                                │
│     └─ 视频在容器中的实际显示区域坐标                              │
│                                                                 │
│  4. 视频坐标 (videoX, videoY)                                    │
│     └─ 视频内容坐标（考虑缩放和平移）                              │
│                                                                 │
│  5. 远程坐标 (remoteX, remoteY)                                  │
│     └─ Windows被控端的屏幕坐标                                   │
│                                                                 │
│  6. 归一化坐标 (normalizedX, normalizedY)                        │
│     └─ 0-1范围的坐标，用于网络传输                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Windows端坐标系统                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 归一化坐标 (normalizedX, normalizedY)                        │
│     └─ 从Android端接收的0-1范围坐标                              │
│                                                                 │
│  2. 屏幕像素坐标 (pixelX, pixelY)                                │
│     └─ Windows屏幕的实际像素坐标                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 一、Android端坐标换算

### 1.1 视口坐标 (clientX, clientY)

**来源**: 触摸事件的 `touch.clientX` 和 `touch.clientY`

**对应页面层**: `#remoteScreen` 层

**作用**: 
- 浏览器提供的原始触摸坐标
- 相对于浏览器视口的左上角 (0, 0)

**获取方式**:
```javascript
// 在 GestureHandler.handleTouchStart() 中
const touch = event.touches[0];
const clientX = touch.clientX;  // 视口X坐标
const clientY = touch.clientY;  // 视口Y坐标
```

**示例**:
```
触摸屏幕中心 → clientX = 540, clientY = 960 (假设屏幕1080x1920)
```

---

### 1.2 容器坐标 (containerX, containerY)

**来源**: 视口坐标减去容器偏移

**对应页面层**: `#videoContainer` 层

**作用**:
- 将坐标转换到视频容器坐标系
- 消除容器在页面中的位置影响

**换算公式**:
```javascript
containerX = clientX - videoContainerRect.left
containerY = clientY - videoContainerRect.top
```

**参数说明**:
- `clientX, clientY`: 视口坐标
- `videoContainerRect.left, top`: videoContainer元素相对于视口的偏移

**代码位置**: `InputDispatcher.dispatchFloatingMouseInput()`
```javascript
const containerX = screenX - this.videoContainerRect.left;
const containerY = screenY - this.videoContainerRect.top;
```

**示例**:
```
clientX = 540, clientY = 960
videoContainerRect.left = 0, videoContainerRect.top = 100

containerX = 540 - 0 = 540
containerY = 960 - 100 = 860
```

---

### 1.3 显示坐标 (displayX, displayY)

**来源**: 容器坐标减去显示区域偏移

**对应页面层**: 视频实际显示区域（在 `#videoWrapper` 内）

**作用**:
- 考虑视频的宽高比适配
- 视频可能不是填满整个容器（有黑边）

**换算公式**:
```javascript
displayX = containerX - displayX_offset
displayY = containerY - displayY_offset
```

**参数说明**:
- `displayX_offset`: 视频显示区域相对于容器的X偏移
- `displayY_offset`: 视频显示区域相对于容器的Y偏移

**显示区域计算** (MatrixTransformer._updateDisplayRect()):
```javascript
// 计算宽高比
const containerAspect = containerWidth / containerHeight;
const videoAspect = videoWidth / videoHeight;

if (videoAspect > containerAspect) {
    // 视频更宽，上下有黑边
    displayWidth = containerWidth;
    displayHeight = containerWidth / videoAspect;
    displayX_offset = 0;
    displayY_offset = (containerHeight - displayHeight) / 2;
} else {
    // 视频更高，左右有黑边
    displayHeight = containerHeight;
    displayWidth = containerHeight * videoAspect;
    displayX_offset = (containerWidth - displayWidth) / 2;
    displayY_offset = 0;
}
```

**代码位置**: `MatrixTransformer.containerToDisplay()`
```javascript
containerToDisplay(containerX, containerY) {
    return {
        x: containerX - this.displayX,
        y: containerY - this.displayY
    };
}
```

**示例**:
```
容器: 1080x1920 (竖屏)
视频: 1920x1080 (横屏)

containerAspect = 1080/1920 = 0.5625
videoAspect = 1920/1080 = 1.778

videoAspect > containerAspect → 上下有黑边

displayWidth = 1080
displayHeight = 1080 / 1.778 = 607.5
displayX_offset = 0
displayY_offset = (1920 - 607.5) / 2 = 656.25

如果 containerY = 960:
displayY = 960 - 656.25 = 303.75
```

---

### 1.4 视频坐标 (videoX, videoY)

**来源**: 显示坐标经过缩放和平移变换

**对应页面层**: `#videoWrapper` 内的视频内容

**作用**:
- 考虑用户的手势缩放 (scale)
- 考虑用户的手势平移 (panX, panY)

**换算公式**:
```javascript
videoX = (displayX - panX) / scale
videoY = (displayY - panY) / scale
```

**参数说明**:
- `scale`: 当前缩放比例 (0.5 ~ 3.0)
- `panX, panY`: 平移偏移量

**代码位置**: `MatrixTransformer.containerToRemote()`
```javascript
containerToRemote(containerX, containerY) {
    const display = this.containerToDisplay(containerX, containerY);
    
    // 应用逆变换（缩放和平移）
    const scaledX = (display.x - this.panX) / this.scale;
    const scaledY = (display.y - this.panY) / this.scale;
    
    return this.displayToRemote(scaledX, scaledY);
}
```

**示例**:
```
displayX = 540, displayY = 303.75
scale = 1.5 (放大1.5倍)
panX = 100, panY = 50

videoX = (540 - 100) / 1.5 = 293.33
videoY = (303.75 - 50) / 1.5 = 169.17
```

---

### 1.5 远程坐标 (remoteX, remoteY)

**来源**: 视频坐标映射到远程屏幕

**对应页面层**: Windows被控端的屏幕

**作用**:
- 将视频坐标转换为Windows屏幕的实际像素坐标
- 考虑视频分辨率和远程屏幕分辨率的差异

**换算公式**:
```javascript
// 方法1: 通过视频分辨率转换
remoteX = (videoX / videoWidth) * remoteScreenWidth
remoteY = (videoY / videoHeight) * remoteScreenHeight

// 方法2: 直接从显示坐标转换（简化版）
remoteX = (displayX / displayWidth) * remoteScreenWidth
remoteY = (displayY / displayHeight) * remoteScreenHeight
```

**参数说明**:
- `videoWidth, videoHeight`: 视频的实际分辨率
- `remoteScreenWidth, remoteScreenHeight`: Windows屏幕分辨率

**代码位置**: `MatrixTransformer.displayToRemote()`
```javascript
displayToRemote(displayX, displayY) {
    if (this.displayWidth === 0 || this.displayHeight === 0 ||
        this.videoWidth === 0 || this.videoHeight === 0) {
        return { x: 0, y: 0 };
    }
    
    // 先转换为视频坐标
    const videoX = (displayX / this.displayWidth) * this.videoWidth;
    const videoY = (displayY / this.displayHeight) * this.videoHeight;
    
    // 再转换为远程坐标
    const remoteX = (videoX / this.videoWidth) * this.remoteScreenWidth;
    const remoteY = (videoY / this.videoHeight) * this.remoteScreenHeight;
    
    return { x: remoteX, y: remoteY };
}
```

**示例**:
```
videoX = 293.33, videoY = 169.17
videoWidth = 1920, videoHeight = 1080
remoteScreenWidth = 1920, remoteScreenHeight = 1080

remoteX = (293.33 / 1920) * 1920 = 293.33
remoteY = (169.17 / 1080) * 1080 = 169.17

注意: 如果视频分辨率和远程屏幕分辨率相同，坐标值不变
```

---

### 1.6 归一化坐标 (normalizedX, normalizedY)

**来源**: 远程坐标归一化到0-1范围

**对应页面层**: 网络传输层

**作用**:
- 将坐标标准化为0-1范围
- 便于网络传输，与具体分辨率解耦

**换算公式**:
```javascript
normalizedX = remoteX / remoteScreenWidth
normalizedY = remoteY / remoteScreenHeight

// 安全边界限制
normalizedX = Math.max(0, Math.min(1, normalizedX))
normalizedY = Math.max(0, Math.min(1, normalizedY))
```

**参数说明**:
- `remoteX, remoteY`: 远程屏幕坐标
- `remoteScreenWidth, remoteScreenHeight`: 远程屏幕分辨率

**代码位置**: `InputDispatcher.dispatchTouchInput()`
```javascript
normalizedX = remote.x / this.transformer.remoteScreenWidth;
normalizedY = remote.y / this.transformer.remoteScreenHeight;

// 边界限制
normalizedX = Math.max(0, Math.min(1, normalizedX));
normalizedY = Math.max(0, Math.min(1, normalizedY));
```

**示例**:
```
remoteX = 293.33, remoteY = 169.17
remoteScreenWidth = 1920, remoteScreenHeight = 1080

normalizedX = 293.33 / 1920 = 0.1528
normalizedY = 169.17 / 1080 = 0.1566
```

---

## 二、Windows端坐标换算

### 2.1 归一化坐标接收

**来源**: 从Android端通过网络接收

**对应页面层**: 数据通道 (WebRTC DataChannel)

**作用**:
- 接收Android端发送的标准化坐标
- 范围: 0-1

**接收格式**:
```javascript
{
    type: 'mousemove',
    x: 0.1528,    // 归一化X坐标
    y: 0.1566,    // 归一化Y坐标
    button: 0
}
```

---

### 2.2 屏幕像素坐标 (pixelX, pixelY)

**来源**: 归一化坐标乘以屏幕分辨率

**对应页面层**: Windows桌面

**作用**:
- 转换为Windows屏幕的实际像素坐标
- 用于执行鼠标操作

**换算公式**:
```javascript
pixelX = Math.round(normalizedX * screenWidth)
pixelY = Math.round(normalizedY * screenHeight)

// 边界限制
pixelX = Math.max(0, Math.min(screenWidth, pixelX))
pixelY = Math.max(0, Math.min(screenHeight, pixelY))
```

**参数说明**:
- `normalizedX, normalizedY`: 归一化坐标 (0-1)
- `screenWidth, screenHeight`: Windows主显示器分辨率

**代码位置**: `input-handler.js normalizeAndClamp()`
```javascript
function normalizeAndClamp(x, y, screenWidth, screenHeight) {
    const normalizedX = normalizeCoord(x)
    const normalizedY = normalizeCoord(y)
    
    const pixelX = Math.round(normalizedX * screenWidth)
    const pixelY = Math.round(normalizedY * screenHeight)
    
    return {
        x: Math.max(0, Math.min(screenWidth, pixelX)),
        y: Math.max(0, Math.min(screenHeight, pixelY))
    }
}

function normalizeCoord(value) {
    // 防止双重归一化
    if (value >= 0 && value <= 1) {
        return value
    }
    // 兼容旧的65535范围
    if (value > 1) {
        return value / 65535
    }
    return 0
}
```

**示例**:
```
normalizedX = 0.1528, normalizedY = 0.1566
screenWidth = 1920, screenHeight = 1080

pixelX = Math.round(0.1528 * 1920) = 293
pixelY = Math.round(0.1566 * 1080) = 169
```

---

## 三、完整坐标转换流程

### 3.1 Android端完整流程

```
触摸事件发生
    ↓
1. 获取视口坐标 (clientX, clientY)
   touch.clientX, touch.clientY
    ↓
2. 转换为容器坐标 (containerX, containerY)
   containerX = clientX - videoContainerRect.left
   containerY = clientY - videoContainerRect.top
    ↓
3. 转换为显示坐标 (displayX, displayY)
   displayX = containerX - displayX_offset
   displayY = containerY - displayY_offset
    ↓
4. 应用缩放和平移变换 (videoX, videoY)
   videoX = (displayX - panX) / scale
   videoY = (displayY - panY) / scale
    ↓
5. 转换为远程坐标 (remoteX, remoteY)
   remoteX = (videoX / videoWidth) * remoteScreenWidth
   remoteY = (videoY / videoHeight) * remoteScreenHeight
    ↓
6. 归一化 (normalizedX, normalizedY)
   normalizedX = remoteX / remoteScreenWidth
   normalizedY = remoteY / remoteScreenHeight
   范围限制: [0, 1]
    ↓
7. 发送到Windows端
   dataChannel.send(JSON.stringify({
       type: 'mousemove',
       x: normalizedX,
       y: normalizedY
   }))
```

### 3.2 Windows端完整流程

```
接收Android端数据
    ↓
1. 解析归一化坐标 (normalizedX, normalizedY)
   const { x, y } = inputData
    ↓
2. 防止双重归一化
   if (x >= 0 && x <= 1) return x
    ↓
3. 转换为屏幕像素坐标 (pixelX, pixelY)
   pixelX = Math.round(normalizedX * screenWidth)
   pixelY = Math.round(normalizedY * screenHeight)
    ↓
4. 边界限制
   pixelX = Math.max(0, Math.min(screenWidth, pixelX))
   pixelY = Math.max(0, Math.min(screenHeight, pixelY))
    ↓
5. 执行鼠标操作
   mouse.move(new Point(pixelX, pixelY))
```

---

## 四、关键参数对照表

### 4.1 Android端参数

| 参数名 | 类型 | 来源 | 页面层 | 作用 |
|--------|------|------|--------|------|
| clientX, clientY | 视口坐标 | touch事件 | #remoteScreen | 触摸的原始位置 |
| videoContainerRect | DOMRect | getBoundingClientRect() | #videoContainer | 容器的位置和尺寸 |
| containerX, containerY | 容器坐标 | 计算 | #videoContainer | 相对于容器的坐标 |
| displayX, displayY | 显示坐标 | 计算 | #videoWrapper | 视频显示区域坐标 |
| displayWidth, displayHeight | 显示尺寸 | 计算 | #videoWrapper | 视频实际显示尺寸 |
| videoWidth, videoHeight | 视频分辨率 | video元素 | #remoteVideo | 视频流分辨率 |
| scale | 缩放比例 | 手势操作 | #videoWrapper | 用户缩放 (0.5~3.0) |
| panX, panY | 平移偏移 | 手势操作 | #videoWrapper | 用户平移 |
| remoteScreenWidth, remoteScreenHeight | 远程分辨率 | Windows端 | 网络层 | Windows屏幕分辨率 |
| normalizedX, normalizedY | 归一化坐标 | 计算 | 网络层 | 传输用的标准坐标 |

### 4.2 Windows端参数

| 参数名 | 类型 | 来源 | 页面层 | 作用 |
|--------|------|------|--------|------|
| normalizedX, normalizedY | 归一化坐标 | 网络接收 | DataChannel | 接收的标准坐标 |
| screenWidth, screenHeight | 屏幕分辨率 | Electron API | Windows桌面 | 主显示器分辨率 |
| pixelX, pixelY | 像素坐标 | 计算 | Windows桌面 | 实际屏幕坐标 |

---

## 五、特殊处理逻辑

### 5.1 有效区域检测

**目的**: 忽略黑边区域的触摸

**代码位置**: `InputDispatcher.dispatchTouchInput()`
```javascript
let isValidArea = false;
if (this.transformer.displayWidth > 0 && this.transformer.displayHeight > 0) {
    const displayX = viewX - this.transformer.displayX;
    const displayY = viewY - this.transformer.displayY;
    isValidArea = displayX >= 0 && displayX <= this.transformer.displayWidth &&
                  displayY >= 0 && displayY <= this.transformer.displayHeight;
}

if (!isValidArea) {
    log('InputDispatcher: 触摸在有效视频区域外，忽略');
    return;
}
```

### 5.2 降级处理

当某些尺寸参数未初始化时，使用降级方案：

**优先级**:
1. 使用 displayWidth/displayHeight (最精确)
2. 使用 videoContainerRect (次精确)
3. 使用 remoteScreenRect (再次)
4. 使用安全坐标 (0.5, 0.5) (最后手段)

**代码**:
```javascript
if (this.transformer.displayWidth > 0 && this.transformer.displayHeight > 0) {
    // 方案1: 使用精确的显示区域
    const remote = this.transformer.containerToRemote(viewX, viewY);
    // ...
} else if (this.videoContainerRect && this.videoContainerRect.width > 0) {
    // 方案2: 使用容器尺寸
    normalizedX = viewX / this.videoContainerRect.width;
    // ...
} else if (this.remoteScreenRect && this.remoteScreenRect.width > 0) {
    // 方案3: 使用remoteScreen尺寸
    normalizedX = viewX / this.remoteScreenRect.width;
    // ...
} else {
    // 方案4: 安全坐标
    normalizedX = 0.5;
    normalizedY = 0.5;
}
```

### 5.3 防止双重归一化

**问题**: 如果坐标已经是归一化的，不应该再次归一化

**解决方案**:
```javascript
function normalizeCoord(value) {
    // 如果已经是0-1范围，直接返回
    if (value >= 0 && value <= 1) {
        return value;
    }
    // 如果是65535范围，进行转换
    if (value > 1) {
        return value / 65535;
    }
    return 0;
}
```

---

## 六、实际示例

### 示例1: 简单触摸（无缩放）

```
Android设备: 1080x1920 (竖屏)
视频: 1920x1080 (横屏)
Windows屏幕: 1920x1080

触摸屏幕中心: clientX=540, clientY=960

步骤1: 容器坐标
videoContainerRect.left=0, videoContainerRect.top=100
containerX = 540 - 0 = 540
containerY = 960 - 100 = 860

步骤2: 显示坐标
videoAspect=1.778 > containerAspect=0.5625
displayWidth=1080, displayHeight=607.5
displayX_offset=0, displayY_offset=656.25
displayX = 540 - 0 = 540
displayY = 860 - 656.25 = 203.75

步骤3: 视频坐标 (scale=1.0, pan=0)
videoX = (540 - 0) / 1.0 = 540
videoY = (203.75 - 0) / 1.0 = 203.75

步骤4: 远程坐标
remoteX = (540 / 1080) * 1920 = 960
remoteY = (203.75 / 607.5) * 1080 = 362.22

步骤5: 归一化
normalizedX = 960 / 1920 = 0.5
normalizedY = 362.22 / 1080 = 0.335

步骤6: Windows端
pixelX = 0.5 * 1920 = 960
pixelY = 0.335 * 1080 = 362

结果: Android屏幕中心(540, 960) → Windows屏幕(960, 362)
```

### 示例2: 缩放后的触摸

```
scale=1.5, panX=100, panY=50

displayX=540, displayY=203.75

步骤3: 视频坐标
videoX = (540 - 100) / 1.5 = 293.33
videoY = (203.75 - 50) / 1.5 = 102.5

步骤4: 远程坐标
remoteX = (293.33 / 1080) * 1920 = 521.48
remoteY = (102.5 / 607.5) * 1080 = 182.22

步骤5: 归一化
normalizedX = 521.48 / 1920 = 0.2716
normalizedY = 182.22 / 1080 = 0.1687

步骤6: Windows端
pixelX = 0.2716 * 1920 = 521
pixelY = 0.1687 * 1080 = 182

结果: 缩放后触摸 → Windows屏幕(521, 182)
```

---

## 七、调试建议

### 7.1 关键日志点

在以下位置添加日志，追踪坐标转换：

```javascript
// GestureHandler.handleTouchStart()
log('触摸原始坐标: clientX=' + touch.clientX + ', clientY=' + touch.clientY);

// InputDispatcher.dispatchTouchInput()
log('容器坐标: viewX=' + viewX + ', viewY=' + viewY);
log('显示参数: displayX=' + displayX + ', displayY=' + displayY);
log('远程坐标: remoteX=' + remoteX + ', remoteY=' + remoteY);
log('归一化坐标: normalizedX=' + normalizedX + ', normalizedY=' + normalizedY);

// Windows端 input-handler.js
console.log('接收坐标: x=' + x + ', y=' + y);
console.log('屏幕坐标: pixelX=' + pixelX + ', pixelY=' + pixelY);
```

### 7.2 常见问题排查

1. **坐标偏移**: 检查 videoContainerRect 是否正确获取
2. **黑边问题**: 检查 displayX_offset 和 displayY_offset 计算
3. **缩放问题**: 检查 scale 和 pan 值是否正确
4. **边界溢出**: 检查归一化后的边界限制

---

## 八、总结

### 核心公式

```
Android端:
normalizedX = ((containerX - displayX_offset - panX) / scale / displayWidth) 
              * remoteScreenWidth / remoteScreenWidth
            = ((containerX - displayX_offset - panX) / scale) / displayWidth

Windows端:
pixelX = normalizedX * screenWidth
```

### 关键要点

1. **坐标系统**: 6个坐标系统层层转换
2. **归一化**: 网络传输使用0-1范围
3. **边界处理**: 每一步都要进行边界检查
4. **降级方案**: 参数缺失时有备用方案
5. **防双重归一化**: 检查坐标是否已归一化

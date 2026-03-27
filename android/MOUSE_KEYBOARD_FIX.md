# Android 端鼠标和键盘修复方案

## 问题分析

经过全面代码审查，发现以下关键问题：

### 1. 数据通道与交互初始化时序问题
- **问题**：`setupRemoteScreenInteraction()` 可能在数据通道建立之前被调用
- **影响**：`matrixTransformer` 和 `inputDispatcher` 未初始化，导致鼠标事件无法处理

### 2. 输入事件处理逻辑问题
- **问题**：`handleFloatingMouseEvent()` 检查数据通道是否打开，但没有检查核心对象是否初始化
- **影响**：即使数据通道打开，核心对象未初始化时也会失败

### 3. 键盘事件处理问题
- **问题**：键盘事件在数据通道未打开时也会尝试发送
- **影响**：键盘按键无反应

### 4. 服务启动与数据通道同步问题
- **问题**：悬浮鼠标服务可能在数据通道建立前就启动
- **影响**：鼠标事件无法传输到远程

## 解决方案

### 1. 修复 `setupRemoteScreenInteraction` 调用时机

```javascript
// 修改 setupDataChannel 函数
function setupDataChannel() {
  dataChannel.onopen = () => {
    log('数据通道已打开')
    showToast('连接成功！正在加载远程屏幕...')
    
    setTimeout(() => {
      showRemoteScreen()
      if (isMouseMode) {
        showFloatingMouse()
      }
    }, 500)
  }
  // ... 其他代码
}

// 修改 showRemoteScreen 函数
function showRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'none'
  document.getElementById('remoteScreen').classList.add('active')
  startStatsMonitoring()
  
  setTimeout(() => {
    setupRemoteScreenInteraction();
  }, 100);
}
```

### 2. 修复 `handleFloatingMouseEvent` 函数

```javascript
function handleFloatingMouseEvent(event) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    log('数据通道未打开，无法发送鼠标事件')
    return
  }
  
  log('handleFloatingMouseEvent: 收到事件 - type=' + event.type + ', x=' + event.x + ', y=' + event.y + ', button=' + event.button);
  
  if (matrixTransformer && inputDispatcher) {
      log('handleFloatingMouseEvent: 使用 InputDispatcher');
      inputDispatcher.dispatchFloatingMouseInput(
          event.x,
          event.y,
          event.type,
          event.button,
          event.delta || 0
      );
  } else {
      log('handleFloatingMouseEvent: InputDispatcher 未初始化，使用旧逻辑');
      
      const videoContainer = document.getElementById('videoContainer')
      if (!videoContainer) {
        log('handleFloatingMouseEvent: 找不到 videoContainer')
        return
      }
      
      const containerRect = videoContainer.getBoundingClientRect()
      
      const screenX = event.x
      const screenY = event.y
      
      const pixelX = screenX - containerRect.left
      const pixelY = screenY - containerRect.top
      
      const x = Math.round(pixelX / containerRect.width * 65535)
      const y = Math.round(pixelY / containerRect.height * 65535)
      
      log('handleFloatingMouseEvent: 旧逻辑坐标 - x=' + x + ', y=' + y)
      
      const inputCommand = {
        type: 'input',
        timestamp: Date.now()
      }
      
      switch (event.type) {
        case 'mousemove':
          inputCommand.inputType = 'mousemove'
          inputCommand.x = x
          inputCommand.y = y
          break
          
        case 'mousedown':
          inputCommand.inputType = 'mousedown'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'mouseup':
          inputCommand.inputType = 'mouseup'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'wheel':
          inputCommand.inputType = 'wheel'
          inputCommand.deltaY = event.delta
          break
          
        case 'dblclick':
          inputCommand.inputType = 'dblclick'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'dragstart':
          inputCommand.inputType = 'mousedown'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        case 'dragend':
          inputCommand.inputType = 'mouseup'
          inputCommand.x = x
          inputCommand.y = y
          inputCommand.button = event.button
          break
          
        default:
          return
      }
      
      dataChannel.send(JSON.stringify(inputCommand))
      log('handleFloatingMouseEvent: 已发送命令 - ' + JSON.stringify(inputCommand))
  }
}
```

### 3. 修复 `sendKey` 函数

```javascript
function sendKey(keyCode) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    console.error('数据通道未打开，无法发送按键')
    showToast('数据通道未打开')
    return
  }
  
  const event = {
    type: 'keyboard',
    eventType: 'keydown',
    code: keyCode,
    key: getKeyFromCode(keyCode),
    ctrlKey: activeModifiers.Control,
    shiftKey: activeModifiers.Shift,
    altKey: activeModifiers.Alt,
    metaKey: activeModifiers.Meta
  }
  
  console.log('发送键盘事件:', JSON.stringify(event))
  sendControlCommand(event)
  
  setTimeout(() => {
    sendControlCommand({
      ...event,
      eventType: 'keyup'
    })
  }, 50)
  
  if (activeModifiers.Shift) {
    toggleModifier('Shift')
  }
}
```

### 4. 修复 `InputDispatcher` 中的坐标计算

```javascript
class InputDispatcher {
    constructor(transformer) {
        this.transformer = transformer;
        
        this.lastInputTime = 0;
        this.inputThrottleMs = 8;
        
        this.currentMode = 'touch';
        this.isMouseDown = false;
        this.lastTapTime = 0;
        
        this.videoContainerRect = null;
    }
    
    updateVideoContainerRect() {
        const videoContainer = document.getElementById('videoContainer');
        if (videoContainer) {
            this.videoContainerRect = videoContainer.getBoundingClientRect();
            log('InputDispatcher: 更新视频容器位置 - left=' + this.videoContainerRect.left + 
                ', top=' + this.videoContainerRect.top + 
                ', width=' + this.videoContainerRect.width + 
                ', height=' + this.videoContainerRect.height);
        }
    }
    
    dispatchFloatingMouseInput(screenX, screenY, type, button = 0, delta = 0) {
        log('InputDispatcher: dispatchFloatingMouseInput 被调用 - screenX=' + screenX + ', screenY=' + screenY + ', type=' + type);
        
        this.updateVideoContainerRect();
        
        if (!this.videoContainerRect) {
            log('InputDispatcher: 错误 - 视频容器位置未初始化');
            return;
        }
        
        const containerX = screenX - this.videoContainerRect.left;
        const containerY = screenY - this.videoContainerRect.top;
        
        log('InputDispatcher: 悬浮鼠标输入 - screenX=' + screenX + ', screenY=' + screenY + 
            ', containerX=' + containerX + ', containerY=' + containerY + 
            ', containerWidth=' + this.videoContainerRect.width + 
            ', containerHeight=' + this.videoContainerRect.height +
            ', type=' + type);
        
        if (containerX < 0 || containerX > this.videoContainerRect.width ||
            containerY < 0 || containerY > this.videoContainerRect.height) {
            log('InputDispatcher: 鼠标位置超出容器范围，但仍然发送');
        }
        
        this.dispatchTouchInput(containerX, containerY, type, button, delta);
    }
    
    dispatchTouchInput(viewX, viewY, type, button = 0, delta = 0) {
        const now = Date.now();
        if (now - this.lastInputTime < this.inputThrottleMs && type === 'mousemove') {
            return;
        }
        this.lastInputTime = now;
        
        let commandType;
        switch (type) {
            case 'mousemove':
                commandType = 'mouse-move';
                break;
            case 'mousedown':
                commandType = 'mouse-down';
                break;
            case 'mouseup':
                commandType = 'mouse-up';
                break;
            case 'wheel':
                commandType = 'mouse-wheel';
                break;
            case 'dblclick':
            case 'doubleclick':
                commandType = 'mouse-click';
                break;
            case 'dragstart':
                commandType = 'mouse-down';
                break;
            case 'dragend':
                commandType = 'mouse-up';
                break;
            default:
                commandType = type;
        }
        
        const remote = this.transformer.viewToRemote(viewX, viewY);
        const normalizedX = Math.round(remote.x / this.transformer.remoteScreenWidth * 65535);
        const normalizedY = Math.round(remote.y / this.transformer.remoteScreenHeight * 65535);
        
        log('InputDispatcher: 发送输入 - type=' + commandType + ', x=' + normalizedX + ', y=' + normalizedY + ', button=' + button);
        
        const command = {
            type: commandType,
            x: normalizedX,
            y: normalizedY,
            button: button
        };
        
        if (type === 'wheel') {
            command.deltaY = delta;
        }
        
        sendControlCommand(command);
    }
}
```

### 5. 修复 `setupRemoteScreenInteraction` 函数

```javascript
function setupRemoteScreenInteraction() {
    log('初始化远程屏幕交互...')
    
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) {
        log('错误：找不到 videoContainer 元素');
        return;
    }
    
    const rect = videoContainer.getBoundingClientRect();
    log('容器尺寸: ' + rect.width + 'x' + rect.height);
    
    matrixTransformer = new MatrixTransformer();
    matrixTransformer.setContainerSize(rect.width, rect.height);
    
    inputDispatcher = new InputDispatcher(matrixTransformer);
    
    gestureHandler = new GestureHandler(
        matrixTransformer,
        inputDispatcher,
        null
    );
    
    const videoWrapper = document.getElementById('videoWrapper');
    if (videoWrapper) {
        videoWrapper.addEventListener('touchstart', (e) => {
            log('GestureHandler: touchstart');
            gestureHandler.handleTouchStart(e);
        }, { passive: false });
        
        videoWrapper.addEventListener('touchmove', (e) => {
            gestureHandler.handleTouchMove(e);
        }, { passive: false });
        
        videoWrapper.addEventListener('touchend', (e) => {
            log('GestureHandler: touchend');
            gestureHandler.handleTouchEnd(e);
        }, { passive: false });
        
        videoWrapper.addEventListener('touchcancel', (e) => {
            gestureHandler.handleTouchEnd(e);
        }, { passive: false });
    }
    
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.onloadedmetadata = () => {
            log('视频元数据加载: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
            matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
        };
    }
    
    log('远程屏幕交互已初始化');
}
```

### 6. 修复 `updateScreenSize` 函数

```javascript
function updateScreenSize(width, height) {
  log('更新屏幕尺寸: ' + width + 'x' + height);
  if (matrixTransformer) {
      matrixTransformer.setRemoteScreenSize(width, height);
  }
}
```

## 验证步骤

1. **重新构建项目**
   ```bash
   cd d:\MyProg\YCDesk\android
   npm run build
   npx cap sync android
   ```

2. **在 Android Studio 中编译并安装**

3. **测试流程**
   - 启动应用，连接到远程设备
   - 检查日志中是否有 "远程屏幕交互已初始化"
   - 测试悬浮鼠标移动和点击
   - 测试悬浮键盘按键
   - 检查日志中是否有 "InputDispatcher: 发送输入" 日志

## 预期修复效果

- ✅ 鼠标移动和点击正常工作
- ✅ 键盘按键正常工作
- ✅ 数据通道建立后自动初始化交互
- ✅ 提供详细的调试日志
- ✅ 兼容现有的旧逻辑

## 注意事项

1. **权限问题**：确保应用有悬浮窗权限
2. **数据通道**：确保 WebRTC 连接正常建立
3. **网络连接**：确保网络稳定性
4. **设备兼容性**：不同设备的屏幕尺寸和坐标系统可能有差异

## 技术要点

- **时序控制**：确保数据通道建立后再初始化交互
- **错误处理**：添加详细的错误日志和错误处理
- **坐标转换**：确保从屏幕坐标到视频坐标的正确转换
- **事件节流**：避免过多的鼠标移动事件导致性能问题
- **状态管理**：确保核心对象的正确初始化和状态管理

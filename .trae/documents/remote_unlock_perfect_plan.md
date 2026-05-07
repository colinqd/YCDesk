# 🔐 YCDesk 远程解锁功能完善计划

---

## 📋 历史经验回顾

根据之前的开发经验，我们曾遇到以下问题和解决方案：

| 问题 | 解决方案 |
|------|---------|
| 无 UAC 权限申请问题 | 通过 PowerShell Start-Process + Verb RunAs 解决 |
| 远程解锁无效 | 研究了 Credential Provider + 共享内存 IPC 方案 |
| 锁屏时无法捕获屏幕 | 需要 Windows 服务 + SYSTEM 权限 |

---

## 🔍 当前实现分析

### ❌ 现有方案（仅 robotjs 模拟输入）
```
远程解锁 → robotjs 模拟键盘输入 → 尝试解锁
```

**问题**：
1. robotjs 在锁定屏幕/安全桌面权限不足
2. 无法可靠地定位密码输入框
3. 没有屏幕锁定/解锁状态检测
4. 没有备用方案

---

## ✨ 完善方案（3层解锁策略）

### 🎯 方案架构

```
┌─────────────────────────────────────────────────────────────┐
│                        远程解锁                              │
├─────────────────────────────────────────────────────────────┤
│  方案1: Credential Provider + 共享内存 (最可靠)              │
│  方案2: Windows 服务 + 模拟输入 (备用)                       │
│  方案3: 现有 robotjs 方案 (保底)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 实施计划

### 阶段1: 恢复 Credential Provider 方案

#### 1.1 创建 Credential Provider
| 文件 | 说明 |
|------|-----|
| `windows/credential_provider/src/YCDeskProvider.cpp` | Credential Provider 主逻辑 |
| `windows/credential_provider/src/IPCManager.cpp` | 共享内存 IPC 管理 |

**功能**：
- 读取共享内存中的密码
- `GetSerialization` 中自动构造凭据
- `pbAutoLogon = TRUE`

#### 1.2 主进程 - 共享内存写入
| 文件 | 说明 |
|------|-----|
| `windows/src/main/shared-memory-helper.cpp` | C++ 共享内存辅助 |
| `windows/src/main/shared-memory-manager.js` | Node.js 管理模块 |

**功能**：
- 创建 `Global\YCDeskUnlockCredentials` 共享内存
- 密码写入
- 安全访问控制（SDDL）

#### 1.3 IPC 处理集成
| 文件 | 修改 |
|------|-----|
| `windows/src/main/ipc-handlers.js` | 添加 `credential-provider:*` IPC |
| `windows/src/main/input-handler.js` | 更新 `handleUnlockScreen` 支持方案1 |

---

### 阶段2: Windows 服务方案

#### 2.1 服务程序
| 文件 | 说明 |
|------|-----|
| `windows/service/src/main.cpp` | 服务主程序 |
| `windows/service/src/ScreenUnlocker.cpp` | 屏幕解锁逻辑 |
| `windows/service/src/PipeServer.cpp` | 命名管道通信 |

**功能**：
- SYSTEM 权限运行
- WTS session 状态监听（`WTS_SESSION_LOCK`/`WTS_SESSION_UNLOCK`）
- 命名管道接收 Electron 进程指令
- 模拟输入（服务有权限）
- 锁屏时的屏幕捕获（DXGI）

#### 2.2 服务管理
| 文件 | 修改 |
|------|-----|
| `windows/src/main/service-manager.js` | 服务安装/启动/停止管理 |
| `windows/src/main/elevation-manager.js` | 修复服务相关的 UAC 提权 |

---

### 阶段3: UI/UX 改进

#### 3.1 UI 升级
| 文件 | 说明 |
|------|-----|
| `windows/index.html` | 添加 Credential Provider 和服务模式的 UI |
| `windows/src/renderer/js/app.js` | 集成新功能的事件处理 |
| `windows/src/renderer/js/service-mode-manager.js` | 服务模式管理 UI |

**功能**：
- Credential Provider 安装/卸载按钮
- 服务模式开关
- 解锁状态指示器
- 解锁日志显示

#### 3.2 解锁流程优化
| 文件 | 修改 |
|------|-----|
| `windows/remote.html` | 改进解锁 UI，显示解锁方案 |
| `windows/remote.html` 中的 `UnlockUI` | 支持多方案尝试 |

---

### 阶段4: 集成和测试

#### 4.1 完整集成
| 文件 | 修改 |
|------|-----|
| `windows/src/main/main.js` | 初始化所有服务 |
| `windows/src/main/ipc-handlers.js` | 整合所有 IPC 处理 |

#### 4.2 测试方案
| 测试项 | 验证内容 |
|--------|---------|
| 方案1 Credential Provider | 锁定屏幕后自动解锁 |
| 方案2 Windows 服务 | 服务成功安装/启动/停止 |
| 方案3 robotjs | 保底方案正常工作 |
| UI 交互 | 状态显示正确 |

---

## 📁 修改文件清单

### 新增文件
```
windows/
├── credential_provider/
│   ├── src/
│   │   ├── YCDeskProvider.cpp
│   │   ├── YCDeskProvider.h
│   │   ├── IPCManager.cpp
│   │   ├── IPCManager.h
│   │   └── dllmain.cpp
│   ├── build/
│   └── CMakeLists.txt
├── service/
│   ├── src/
│   │   ├── main.cpp
│   │   ├── ScreenUnlocker.cpp
│   │   ├── ScreenUnlocker.h
│   │   ├── PipeServer.cpp
│   │   ├── PipeServer.h
│   │   └── ServiceManager.cpp
│   ├── build/
│   └── CMakeLists.txt
└── src/
    └── main/
        ├── shared-memory-manager.js
        ├── shared-memory-helper.cpp
        └── service-manager.js
```

### 修改文件
```
windows/
├── src/
│   ├── main/
│   │   ├── auto-unlock-service.js
│   │   ├── credentials-manager.js
│   │   ├── input-handler.js
│   │   ├── ipc-handlers.js
│   │   ├── main.js
│   │   └── window-manager.js
│   └── renderer/
│       └── js/
│           ├── app.js
│           └── service-mode-manager.js
├── index.html
├── remote.html
└── package.json
```

---

## ⚠️ 风险和注意事项

| 风险 | 应对方案 |
|------|---------|
| UAC 权限问题 | 使用可靠的 `Start-Process -Verb RunAs -Wait` 方案 |
| Credential Provider 注册失败 | 添加详细日志和错误处理 |
| 服务安装失败 | 提供详细的错误信息 |
| 兼容性问题 | 多方案降级策略 |

---

## 🎯 成功标准

1. ✅ Credential Provider 方案工作（最优先）
2. ✅ Windows 服务方案工作（备用）
3. ✅ robotjs 方案保留（保底）
4. ✅ UI 完整显示状态
5. ✅ 完整的日志系统便于调试

---

## 📌 下一步

等待用户确认后开始按阶段实施！

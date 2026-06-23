# YCDesk 代码评审报告

**版本**: v0.2.0 | **评审日期**: 2026-06-18 | **评审范围**: Windows + Linux + Android + Server 全栈代码

---

## 一、评审总览

| 维度 | 评分 | 说明 |
|------|:---:|------|
| 架构设计 | ⭐⭐⭐⭐ | 良好的模块分离，Electron多进程架构合理，新增子系统结构清晰 |
| 代码质量 | ⭐⭐⭐ | 巨型文件已部分拆分，但仍有改善空间 |
| 安全性 | ⭐⭐⭐⭐ | v3.1.3高危问题已修复，安全基础扎实 |
| 可维护性 | ⭐⭐⭐ | shared/副本同步机制仍需改进，Linux维护滞后 |
| 错误处理 | ⭐⭐⭐⭐ | 全局异常捕获已完善，IPC处理仍有遗漏 |
| 测试覆盖 | ⭐⭐⭐ | 测试文件大幅增加，但关键路径仍有缺口 |
| 性能 | ⭐⭐⭐⭐ | WebRTC视频管线设计合理，Watchdog新增 |
| 文档 | ⭐⭐⭐ | 中文注释，ARCHITECTURE.md已完善 |

**总评: 3.5 / 5.0** — 相较v3.1.3提升显著，v3.1.3的P0/P1问题已基本修复，新增子系统（Windows服务、UAC提权、Credential Provider、自动解锁）功能完整，但shared/副本同步和测试覆盖仍需加强。

---

## 二、架构维度审查

### 2.1 项目结构总览

```
YCDesk/
├── shared/                    # 规范共享模块源 (ESM)
│   ├── core/                  # 应用核心
│   ├── renderer/              # 渲染器模块
│   ├── utils/                 # 工具类
│   ├── platform/              # 平台适配器
│   ├── managers/              # 管理器模块
│   ├── gestures/              # 手势识别
│   ├── video/                 # 视频处理
│   └── components/            # UI组件
├── windows/                   # Windows Electron 桌面端
│   ├── src/main/              # 主进程 (~30个文件)
│   │   ├── ipc/               # IPC处理器子模块
│   │   ├── auth-manager.js    # 认证管理
│   │   ├── input-handler.js   # 输入处理 (888行)
│   │   ├── elevation-manager.js  # UAC提权
│   │   ├── auto-unlock-service.js # 自动解锁
│   │   └── ...
│   ├── service/               # Windows 服务守护
│   ├── credential_provider/   # C++ Credential Provider
│   ├── shared/                # 同步副本
│   └── preload.js
├── linux/                     # Linux 桌面端
│   ├── src/main/              # 主进程 (轻量)
│   └── shared/                # 手动维护副本 ⚠️
├── android/                   # Android Capacitor 端
│   ├── modules/               # 功能模块 (10+)
│   ├── managers/              # 管理模块
│   └── shared/                # 同步副本
├── android-server/            # 原生 Android 服务端
├── server/                    # 纯Node.js信令服务器
├── server-gui/                # Electron版信令服务器GUI
└── scripts/                   # 构建工具
```

### 2.2 shared/ 多副本同步机制

**状态**: 四份副本（windows/shared/、linux/shared/、android/shared/、server-gui/shared/）与 canonical `shared/` 存在不同程度的漂移。

| 副本 | 同步方式 | 状态 | 风险 |
|------|----------|:---:|------|
| windows/shared/ | sync-shared.js 自动同步 | ✅ 良好 | 低 |
| android/shared/ | sync-shared.js 自动同步 + ESM包装 | ✅ 良好 | 低 |
| linux/shared/ | 手动维护 | ⚠️ 漂移 | 高 |
| server-gui/shared/ | 手动维护 | ⚠️ 漂移 | 高 |

**关键发现**:
- [sync-shared.js](file:///d:/MyProg/YCDesk/windows/sync-shared.js) 对 Windows 和 Android 的同步逻辑清晰，但正则替换 export 语法不够严谨
- [linux/shared/](file:///d:/MyProg/YCDesk/linux/shared) 未配置自动同步，存在与 canonical 源不一致的文件
- [server-gui/shared/](file:///d:/MyProg/YCDesk/server-gui/shared) 也没有自动同步机制
- ARCHITECTURE.md 中明确标注了已知问题：security fixes not in linux/shared/、linux/shared/ has files not in canonical

**建议**: 统一为所有平台配置自动同步脚本，或采用 monorepo 包管理方案（如 npm workspaces）消除副本。

### 2.3 Windows 主进程架构

**文件统计**:

| 文件 | 行数 | 评级 | 职责 |
|------|:---:|:---:|------|
| [main.js](file:///d:/MyProg/YCDesk/windows/src/main/main.js) | 326 | 🟢 | 应用生命周期、Watchdog、IPC初始化 |
| [input-handler.js](file:///d:/MyProg/YCDesk/windows/src/main/input-handler.js) | 888 | 🟡 | 远程输入处理（鼠标/键盘/文本/锁屏） |
| [ipc-handlers.js](file:///d:/MyProg/YCDesk/windows/src/main/ipc-handlers.js) | 172 | 🟢 | IPC处理器注册（已拆分到 ipc/ 子目录） |
| [window-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/window-manager.js) | 295 | 🟢 | 窗口管理、托盘 |
| [auth-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/auth-manager.js) | 202 | 🟢 | 认证与加密 |
| [elevation-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/elevation-manager.js) | ~200 | 🟢 | UAC提权 |
| [auto-unlock-service.js](file:///d:/MyProg/YCDesk/windows/src/main/auto-unlock-service.js) | ~266 | 🟢 | 自动解锁 |
| [service-integration.js](file:///d:/MyProg/YCDesk/windows/src/main/service-integration.js) | ~159 | 🟢 | 服务集成 |

**模块依赖关系**:
```
main.js
├── window-manager.js (窗口创建)
├── ipc-handlers.js (IPC注册)
│   ├── ipc/ipc-auth.js
│   ├── ipc/ipc-input.js
│   ├── ipc/ipc-window.js
│   ├── ipc/ipc-screen.js
│   ├── ipc/ipc-device.js
│   └── ipc/ipc-auto-start.js
├── input-handler.js (远程输入处理)
├── auth-manager.js (认证)
├── auto-unlock-service.js (自动解锁)
├── service-integration.js (服务集成)
├── elevation-manager.js (提权管理)
└── credentials-manager.js (凭证存储)
```

**改进点**:
- main.js 已从 1453 行缩减到 326 行，重构效果显著（v3.1.3 时为 1453 行）
- ipc-handlers.js 从 1722 行缩减到 172 行，已拆分到 ipc/ 子目录
- input-handler.js 仍为 888 行，建议按功能拆分为 keyboard/mouse/lock-screen/text-input 子模块

### 2.4 Linux 主进程架构

**对比**: Linux 主进程（[main.js](file:///d:/MyProg/YCDesk/linux/src/main/main.js) 129 行）远轻于 Windows 版，缺少以下功能：
- Watchdog 线程监控
- 服务模式集成
- 自动解锁
- Credential Provider
- UAC 提权

**代码重复**: 大量 IPC 处理器和 UI 逻辑在 Windows 和 Linux 间重复，`platform/` adapter 覆盖不完整。

### 2.5 Android 端架构

**模块化程度**: 高。Android 端有清晰的模块划分：
- `modules/`（10+ 模块）：input.js (573行)、webrtc.js (996行)、signaling.js (498行)、keyboard.js (622行)、screen.js (211行) 等
- `managers/`：history-manager.js 等
- webrtc.js 达到 996 行，建议拆分

### 2.6 服务端架构

**代码重复度**: server/ 与 server-gui/ 核心功能重复约 75%。

| 文件 | 位置 | 行数 |
|------|------|:---:|
| server-module.js | [server/dist-portable/](file:///d:/MyProg/YCDesk/server/dist-portable/server-module.js) | 287 |
| server-module.js | [server-gui/server/](file:///d:/MyProg/YCDesk/server-gui/server/server-module.js) | 287 |
| server-module.js | [server-gui/src/](file:///d:/MyProg/YCDesk/server-gui/src/server-module.js) | 287 |

同一文件存在 3 份副本，且 server/server.js 直接引用 server-gui 目录下的文件，形成交叉依赖。

**建议**: 提取 server-module 为独立 npm 包，两端共享引用。

---

## 三、流程维度审查

### 3.1 远程桌面连接全链路

**状态机评估**: [connection-state-machine.js](file:///d:/MyProg/YCDesk/shared/connection-state-machine.js) 定义了 13 个状态和完整的转换规则，设计良好。

**状态转换图**:
```
IDLE → CONNECTING → AUTHENTICATING → NEGOTIATING → CREATING_CHANNEL
→ RESOLUTION_NEGOTIATING → WAITING_VIDEO → DISPLAYING_FIRST_FRAME
→ LOADING_AUXILIARY → CONNECTED → RECONNECTING/DISCONNECTING/ERROR
```

**发现的问题**:
- 状态机转换规则完整，但 `resolution-negotiating` 和 `loading-auxiliary` 状态的超时保护未在代码中显式体现
- 重连退避策略存在于 signaling-client.js 中，但最大重试次数和退避因子的一致性需核实
- DataChannel 关闭时的资源释放未全面覆盖

### 3.2 Windows 服务管理流程

**完整性**: 安装/卸载/启停/状态查询五项操作均已实现。

**SCM 错误码处理**: 1056（已运行）、1060（未安装）、1062（启动中）等关键错误码已在 [service-daemon.js](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js) 中处理。

**发现的问题**:
- 临时文件清理逻辑不完整：uninstall.js 中未清理 daemon/ 目录
- exit code 双通道传递机制在 elevate-cli.js 与 elevation-manager.js 之间存在不一致
- 服务状态切换时 UI 同步依赖 [waitForServiceStatus](file:///d:/MyProg/YCDesk/windows/src/renderer/js/settings.js#L791) 的 5×1s 重试，在快速切换场景下可能显示过期状态

### 3.3 自动解锁流程

**协作时序**: Credential Provider DLL → 共享内存 → IPC Server → 主进程 → 自动解锁服务，链条完整。

**关键组件**:
- [auto-unlock-service.js](file:///d:/MyProg/YCDesk/windows/src/main/auto-unlock-service.js)：监听锁屏/解锁事件，尝试自动解锁，失败时回退到 robotjs 模拟输入
- [shared-memory-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/shared-memory-manager.js)：管理共享内存中的密码写入与清除
- [unlock-ipc-server.js](file:///d:/MyProg/YCDesk/windows/src/main/unlock-ipc-server.js)：处理来自 Credential Provider 的 IPC 请求
- [YCDeskCredentialProvider.cpp](file:///d:/MyProg/YCDesk/windows/credential_provider/YCDeskCredentialProvider.cpp)：C++ Credential Provider 实现

**发现的问题**:
- 共享内存通信缺乏超时保护机制
- 会话切换边界（如快速用户切换）的测试覆盖不足
- robotjs 回退方案的可靠性未充分验证

### 3.4 开机自启动与自动连接

**双模式切换**: 服务模式（Windows Service）与登录项模式（注册表 Run）的切换逻辑已实现。

**发现的问题**:
- 服务模式切换到登录项模式时，如果服务未完全停止可能导致切换失败
- `loadServiceModeStatus` 函数的 UI 更新存在延迟
- 自动连接失败后缺乏自动重试机制

---

## 四、逻辑维度审查

### 4.1 资源生命周期管理

**发现的资源泄漏风险**:

| # | 问题 | 位置 | 严重度 |
|---|------|------|:---:|
| L1 | keepAlive 定时器未在服务停止时清除 | [service-daemon.js](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js) `_keepAliveTimer` | 🟡 中 |
| L2 | 重连定时器缺少配对清除逻辑 | [signaling-client.js](file:///d:/MyProg/YCDesk/shared/signaling-client.js) | 🟡 中 |
| L3 | pipe-server 连接句柄关闭逻辑不完整 | [pipe-server.js](file:///d:/MyProg/YCDesk/windows/service/pipe-server.js) | 🟡 中 |
| L4 | 渲染进程事件监听器缺少 beforeunload 清理 | [app.js](file:///d:/MyProg/YCDesk/windows/src/renderer/js/app.js) | 🟡 中 |
| L5 | direct-connection-manager 中定时器/监听器未配对 | [direct-connection-manager.js](file:///d:/MyProg/YCDesk/shared/direct-connection-manager.js) | 🟡 中 |

**正面评价**: main.js 的 `before-quit` 和 `will-quit` 事件中已实现资源清理（Watchdog 终止、直连服务器关闭、输入处理器重置），整体退出流程设计良好。

### 4.2 异步错误处理

**try/catch 覆盖率**:
- IPC 处理器中约 30% 的异步函数缺少 try/catch 包装
- [elevate-cli.js](file:///d:/MyProg/YCDesk/windows/service/elevate-cli.js) 子进程错误传播不完整
- 全局异常处理已完善（[main.js](file:///d:/MyProg/YCDesk/windows/src/main/main.js#L49-L58)）：
  - `uncaughtException` → 记录日志后退出
  - `unhandledRejection` → 记录日志
  - `render-process-gone` → 崩溃/OOM 时自动重载
  - `child-process-gone` → 记录日志

### 4.3 并发与竞态条件

| # | 风险点 | 位置 | 严重度 |
|---|--------|------|:---:|
| R1 | `isRunning` 守卫 — TOCTOU 竞态 | [service-daemon.js](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js#L68-L92) | 🔴 高 |
| R2 | 并发提权请求 — 多个 `_runElevated` 可能冲突 | [elevation-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/elevation-manager.js#L160-L183) | 🔴 高 |
| R3 | 设备列表文件并发写入 — 无锁保护 | [device-list-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/device-list-manager.js#L38-L48) | 🟡 中 |
| R4 | `failedAttempts`/`lockoutUntil` 竞态更新 | [auth-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/auth-manager.js#L38-L82) | 🟡 中 |
| R5 | stop 方法中的资源并发释放 | [service-daemon.js](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js#L172-L196) | 🟡 中 |

### 4.4 输入处理逻辑

**坐标变换**: 坐标从远程端归一化值（0~1）转换为屏幕坐标，[mouse-normalizer.js](file:///d:/MyProg/YCDesk/windows/src/main/mouse-normalizer.js) 中有 `normalizeAndClamp` 进行边界限制。

**发现的问题**:
- `normalizeCoordinate` 函数对输入坐标有基本校验，但未验证 `screenWidth`/`screenHeight` 的合法性
- SendInput 调用未显式检查执行权限
- `handleUnlockScreen` 调用 `powershell.exe` 等敏感系统命令，参数隔离不完整

---

## 五、功能维度审查

### 5.1 服务管理功能完整性

| 操作 | 实现 | 错误处理 | UI同步 |
|------|:---:|:---:|:---:|
| 安装 | ✅ | ✅ | ✅ |
| 卸载 | ✅ | ✅ | ⚠️ 缺少临时文件清理 |
| 启动 | ✅ | ✅ | ✅ waitForServiceStatus |
| 停止 | ✅ | ✅ | ✅ waitForServiceStatus |
| 状态查询 | ✅ | ✅ | ✅ loadServiceModeStatus |

### 5.2 安全功能

**正面评价**:
- AES-256-GCM 加密实现正确，PBKDF2 迭代次数 100,000 ✅
- 密码验证速率限制已实现：5次失败/30秒锁定 ✅
- `crypto.timingSafeEqual` 使用时序安全比较 ✅
- `contextIsolation: true` + `sandbox: true` 安全隔离 ✅
- preload.js 使用白名单模式暴露 API ✅
- IPC 输入校验（[ipc-validator.js](file:///d:/MyProg/YCDesk/windows/src/main/ipc-validator.js)）已实现 ✅

**遗留问题**:
- 密码明文驻留在内存中（`connectionPassword` 变量），clearPassword() 设为 null 但未覆盖内存
- 开发模式下证书验证被绕过（`isDevelopment` 守卫正确）
- 自签名证书缺少 SAN（Subject Alternative Name）字段，Android 11+ 可能不兼容

### 5.3 跨平台行为一致性

| 功能 | Windows | Linux | Android |
|------|:---:|:---:|:---:|
| 自动启动 | ✅ 服务/注册表 | ✅ autostart | ❌ |
| 托盘图标 | ✅ | ✅ | N/A |
| 输入模拟 | ✅ SendInput | ✅ robotjs | ✅ 原生API |
| 屏幕捕获 | ✅ Windows API | ✅ robotjs | ✅ 原生API |
| 服务管理 | ✅ SCM | ✅ systemd | ✅ 后台服务 |
| 直连模式 | ✅ | ✅ | ❌ |
| UAC提权 | ✅ | N/A | N/A |
| 自动解锁 | ✅ | ❌ | ❌ |

**未抽象的平台特化代码**:
- ipc-auto-start.js（Windows 用注册表，Linux 用 autostart 文件）
- input-handler.js（Windows 用 SendInput，Linux 用 robotjs）
- elevation-manager.js（仅 Windows）

### 5.4 配置持久化与版本同步

**版本同步**: [sync-version.js](file:///d:/MyProg/YCDesk/scripts/sync-version.js) 同步 9 个 package.json + 2 个 build.gradle，但缺少错误处理和回滚机制。

**配置管理**: shared/config.js 集中定义配置项，各平台有 config-schema.js 做校验，但缺少原子写入和备份恢复机制。

---

## 六、测试与构建审查

### 6.1 测试覆盖

**现状**: 约 50+ 个测试文件，涵盖共享模块和部分主进程模块。

| 关键路径 | 测试覆盖 |
|----------|:---:|
| auth-manager.js | ✅ (auth-manager-flow.test.js) |
| connection-state-machine.js | ✅ (connection-state-machine.test.js) |
| input-protocol.js | ✅ (input-protocol.test.js) |
| service-daemon.js | ❌ 缺失 |
| elevation-manager.js | ❌ 缺失 |
| auto-unlock-service.js | ❌ 缺失 |
| Credential Provider | ❌ 缺失 |
| shared-memory-manager.js | ❌ 缺失 |

**测试缺口**: 服务管理、UAC提权、自动解锁、Credential Provider 四个关键子系统完全没有测试覆盖。

### 6.2 构建与 CI

**CI 流程** ([ci.yml](file:///d:/MyProg/YCDesk/.github/workflows/ci.yml)):

```
Push/PR → Lint (ESLint) → Test (Linux) → Test (Windows)
                              ↓                ↓
                        Build Linux      Build Windows
```

**评估**: CI 配置完整，Lint → Test → Build 流程清晰，构建产物上传至 Artifacts。但 Android 端的测试和构建未纳入 CI。

---

## 七、分级问题清单

### P0 — 阻断级（2项）

| ID | 问题 | 位置 | 风险 | 修复方向 |
|----|------|------|------|---------|
| P0-01 | `isRunning` 守卫存在 TOCTOU 竞态，可能导致服务状态不一致 | [service-daemon.js#L68-L92](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js#L68-L92) | 服务崩溃或重复启动 | 添加互斥锁或状态机守卫 |
| P0-02 | 并发提权请求缺乏控制，多个 `_runElevated` 可能同时执行 | [elevation-manager.js#L160-L183](file:///d:/MyProg/YCDesk/windows/src/main/elevation-manager.js#L160-L183) | UAC提权冲突导致服务安装失败 | 引入请求队列或互斥锁 |

### P1 — 高优（5项）

| ID | 问题 | 位置 | 风险 | 修复方向 |
|----|------|------|------|---------|
| P1-01 | linux/shared/ 手动维护，与 canonical 源存在漂移 | [linux/shared/](file:///d:/MyProg/YCDesk/linux/shared) | 安全修复未同步到 Linux | 配置自动同步脚本 |
| P1-02 | server-module.js 存在 3 份副本，交叉依赖 | [server/](file:///d:/MyProg/YCDesk/server) & [server-gui/](file:///d:/MyProg/YCDesk/server-gui) | 修复遗漏、版本不一致 | 提取为独立 npm 包 |
| P1-03 | 关键子系统（service-daemon, elevation-manager, auto-unlock）无测试覆盖 | 多个文件 | 回归风险高 | 编写单元测试和集成测试 |
| P1-04 | 设备列表文件并发写入无锁保护 | [device-list-manager.js#L38-L48](file:///d:/MyProg/YCDesk/windows/src/main/device-list-manager.js#L38-L48) | 数据损坏 | 使用文件锁或原子写入 |
| P1-05 | 服务卸载缺少临时文件/daemon目录清理 | [uninstall.js](file:///d:/MyProg/YCDesk/windows/service/uninstall.js) | 磁盘残留 | 添加清理逻辑 |

### P2 — 中优（6项）

| ID | 问题 | 位置 | 风险 | 修复方向 |
|----|------|------|------|---------|
| P2-01 | input-handler.js 888行，建议拆分为子模块 | [input-handler.js](file:///d:/MyProg/YCDesk/windows/src/main/input-handler.js) | 可维护性下降 | 按功能拆分为 keyboard/mouse/lock-screen 等 |
| P2-02 | 多个文件存在定时器/监听器泄漏风险 | [service-daemon.js](file:///d:/MyProg/YCDesk/windows/service/service-daemon.js), [signaling-client.js](file:///d:/MyProg/YCDesk/shared/signaling-client.js), [pipe-server.js](file:///d:/MyProg/YCDesk/windows/service/pipe-server.js) | 内存泄漏 | 确保所有 setInterval/on 有对应的 clearInterval/off |
| P2-03 | 约30% IPC处理器缺少 try/catch | [ipc/](file:///d:/MyProg/YCDesk/windows/src/main/ipc) 子目录各文件 | 未捕获异常导致进程崩溃 | 为所有 IPC handler 添加 try/catch |
| P2-04 | sync-version.js 缺少错误处理和回滚 | [sync-version.js](file:///d:/MyProg/YCDesk/scripts/sync-version.js) | 版本不一致 | 添加事务性更新和回滚 |
| P2-05 | 自动解锁共享内存通信缺乏超时保护 | [shared-memory-manager.js](file:///d:/MyProg/YCDesk/windows/src/main/shared-memory-manager.js) | 死锁或hang | 添加超时机制 |
| P2-06 | 自签名证书缺少 SAN 字段 | [generate-cert.js](file:///d:/MyProg/YCDesk/server/generate-cert.js) | Android 11+ 兼容性 | 添加 subjectAltName |

### P3 — 低优（4项）

| ID | 问题 | 位置 | 风险 | 修复方向 |
|----|------|------|------|---------|
| P3-01 | Android CI 缺失 | [ci.yml](file:///d:/MyProg/YCDesk/.github/workflows/ci.yml) | Android 构建未自动化 | 添加 Android 测试和构建 Job |
| P3-02 | `failedAttempts`/`lockoutUntil` 存在理论竞态 | [auth-manager.js#L38-L82](file:///d:/MyProg/YCDesk/windows/src/main/auth-manager.js#L38-L82) | 极低概率验证绕过 | 添加原子操作 |
| P3-03 | 跨平台 platform/ adapter 覆盖不完整 | [shared/platform/](file:///d:/MyProg/YCDesk/shared/platform) | 平台代码重复 | 扩展 adapter 接口 |
| P3-04 | 配置文件缺少原子写入和备份恢复 | [shared/config.js](file:///d:/MyProg/YCDesk/shared/config.js) | 配置损坏 | 实现原子写入 |

---

## 八、v3.1.3 遗留问题跟踪

| ID | v3.1.3 问题 | 当前状态 | 证据 |
|----|-----------|:---:|------|
| A1 | `disable-gpu-sandbox` 禁用GPU沙箱 | ✅ 已修复 | [main.js#L28-L31](file:///d:/MyProg/YCDesk/windows/src/main/main.js#L28-L31) — 仅非打包+环境变量时启用 |
| A2 | `Math.random()` 生成instanceId不安全 | ✅ 已修复 | main.js 不再使用 Math.random() 生成 ID |
| A3 | `substr()` 已弃用 | ✅ 已修复 | 代码中不再使用 substr() |
| A4 | `os.tmpdir()` 存放userData | ✅ 已修复 | [main.js#L16](file:///d:/MyProg/YCDesk/windows/src/main/main.js#L16) — 使用 `app.setPath('userData', ...)` 指向 `~/.ycdesk` |
| S1 | GPU沙箱被禁用 | ✅ 已修复 | 同 A1 |
| S2 | 开发环境证书验证被绕过 | ⚠️ 仍存在 | [main.js#L33-L37](file:///d:/MyProg/YCDesk/windows/src/main/main.js#L33-L37) — 但 `isDevelopment` 守卫正确 |
| S3 | 密码明文存储在内存 | ⚠️ 仍存在 | [auth-manager.js#L12](file:///d:/MyProg/YCDesk/windows/src/main/auth-manager.js#L12) — `connectionPassword` 变量，clearPassword() 设 null 但未覆盖内存 |
| S4 | verifyPassword 无速率限制 | ✅ 已修复 | [auth-manager.js#L38-L82](file:///d:/MyProg/YCDesk/windows/src/main/auth-manager.js#L38-L82) — 5次失败/30秒锁定 |
| S5 | `console.log` 泄露调试信息 | ✅ 已修复 | 结构化日志模块已替换 console.log |
| S6 | 部分IPC处理器缺少输入验证 | ✅ 已修复 | ipc-validator.js 已实现 |

**总结**: v3.1.3 的 10 个问题中，8 个已修复，1 个（S2）有正确守卫，1 个（S3）受限于 JS 内存模型。

---

## 九、优化路线图

### 短期（1-2周） — P0/P1 修复

- [ ] 修复 service-daemon.js 的 `isRunning` TOCTOU 竞态（P0-01）
- [ ] 为 elevation-manager.js 添加并发提权请求队列（P0-02）
- [ ] 为 service-daemon、elevation-manager、auto-unlock-service 编写测试（P1-03）
- [ ] 为 linux/shared/ 配置自动同步脚本（P1-01）
- [ ] 提取 server-module 为独立共享模块（P1-02）
- [ ] 为 device-list-manager.js 添加文件写入锁（P1-04）
- [ ] 添加服务卸载时的临时文件清理（P1-05）

### 中期（2-4周） — P2 改进

- [ ] 拆分 input-handler.js 为子模块（P2-01）
- [ ] 审计并修复定时器/监听器泄漏（P2-02）
- [ ] 为所有 IPC 处理器添加 try/catch（P2-03）
- [ ] 增强 sync-version.js 的错误处理（P2-04）
- [ ] 为共享内存通信添加超时保护（P2-05）
- [ ] 更新自签名证书添加 SAN 字段（P2-06）

### 长期（1-3月） — P3 优化

- [ ] 将 Android 测试和构建纳入 CI（P3-01）
- [ ] 扩展 platform/ adapter 接口覆盖范围（P3-03）
- [ ] 实现配置文件原子写入和备份恢复（P3-04）
- [ ] 考虑 shared/ 副本统一为 monorepo 包管理
- [ ] 评估 TypeScript 迁移可行性

---

## 十、评审结论

**YCDesk v0.2.0** 相较 v3.1.3 有显著提升：

1. **安全基础扎实**: v3.1.3 的 P0 问题（GPU沙箱、userData 路径、速率限制、IPC 验证）已全部修复
2. **新增子系统完整**: Windows 服务管理、UAC 提权、Credential Provider、自动解锁功能完整
3. **代码健康度提升**: ipc-handlers.js 从 1722 行减至 172 行，main.js 从 1453 行减至 326 行
4. **全局异常处理完善**: uncaughtException、unhandledRejection、render-process-gone、child-process-gone 全覆盖
5. **Watchdog 监控**: 新增连接健康监控和自动恢复机制

**主要改进方向**:

| 优先级 | 领域 | 投入 |
|:---:|------|:---:|
| 🔴 P0 | 修复并发竞态（service-daemon、elevation-manager） | 2-3天 |
| 🟡 P1 | 补全关键路径测试、统一 shared/ 同步 | 1周 |
| 🟡 P1 | 提取 server-module 消除重复 | 1-2天 |
| 🟢 P2 | 拆分 input-handler.js、修复资源泄漏 | 1周 |
| 🔵 P3 | CI 扩展、platform adapter 完善 | 2-3周 |

**总评估**: YCDesk v0.2.0 已达到生产级原型水平，建议优先完成 P0/P1 级别的改进后发布 v0.3.0。
# YCDesk Credential Provider - Windows 远程解锁

这是 YCDesk 的 Windows Credential Provider 实现，用于支持远程解锁功能。

## ⚠️ 重要提示：安装前必读

**你无法直接安装 Credential Provider，因为 DLL 还没有编译！**

请先阅读 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) 了解完整的安装步骤。

---

## 文件结构

```
windows/credential_provider/
├── YCDeskCredentialProvider.h    # 头文件，定义 Credential Provider 类
├── YCDeskCredentialProvider.cpp  # 主要实现
├── dllmain.cpp                   # DLL 入口点和 COM 注册
├── CMakeLists.txt                # CMake 构建配置
├── build.ps1                     # 构建脚本（已更新）
├── install.ps1                   # 安装脚本（需管理员权限）
├── uninstall.ps1                 # 卸载脚本（需管理员权限）
├── INSTALLATION_GUIDE.md         # 🔴 完整安装指南（必读）
├── UnlockIpcServer.h             # IPC 服务器头文件（C++）
├── UnlockIpcServer.cpp           # IPC 服务器实现（C++）
└── README.md                     # 本文档
```

另外在 `windows/src/main/` 目录下有 Electron 集成文件：
- `unlock-ipc-server.js` - Node.js 版 IPC 服务器
- `auto-unlock-service.js` - 自动解锁服务（已修改）
- `credentials-manager.js` - 凭据管理器（已修改）

---

## 快速开始

### 方式一：查看完整安装指南（推荐）

📖 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) - 包含所有问题解决方案

### 方式二：快速开始（如果你有 Visual Studio）

#### 1. 编译 Credential Provider

**使用 Visual Studio 开发者命令提示符（重要！）：**

```cmd
# 打开 "Developer Command Prompt for VS 2022"
cd d:\MyProg\YCDesk\windows\credential_provider
mkdir build
cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
```

或者使用 PowerShell 脚本（如果你有完整的 PowerShell 环境）：

```powershell
cd d:\MyProg\YCDesk\windows\credential_provider
.\build.ps1 -Clean
```

#### 2. 安装 Credential Provider

在 YCDesk 设置页面点击"安装"按钮（推荐），或者：

```powershell
# 右键点击 install.ps1，选择"以管理员身份运行"
# 或者
Start-Process powershell -Verb runAs -ArgumentList "-File install.ps1"
```

#### 3. 重启电脑（必须！）

#### 4. 测试

- 在 YCDesk 设置页面刷新 Credential Provider 状态
- 锁定屏幕 (Win+L)
- 在登录界面应该看到 YCDesk 选项

---

## 工作原理

1. **Electron 主进程** (`windows/src/main/`)
   - 运行 Node.js 版 IPC 服务器 (`unlock-ipc-server.js`)
   - 监听 `\\.\pipe\YCDeskUnlock` 命名管道
   - 当收到远程解锁请求时，调用 `unlockIpcServer.setCredentials(username, password)`

2. **Credential Provider DLL**
   - 被 LogonUI.exe 加载，运行在 Winlogon 安全桌面上
   - 检查是否有待处理的解锁请求
   - 如果有，使用 Kerberos 协议打包凭据并自动登录

3. **IPC 通信**
   - Credential Provider 作为客户端连接到 IPC 服务器
   - 发送 `REQUEST_UNLOCK` 命令
   - 服务器响应用户名和密码（双 null 分隔的 UTF-16LE）

---

## 回退机制

代码包含完整的回退机制：

1. 首先尝试 Credential Provider 方式（最可靠）
2. 如果 Credential Provider 不可用，回退到 robotjs 方式

---

## 卸载

```powershell
# 右键点击 uninstall.ps1，选择"以管理员身份运行"
# 或者
Start-Process powershell -Verb runAs -ArgumentList "-File uninstall.ps1"
```

或者在 YCDesk 设置页面点击"卸载"按钮。

---

## 调试

1. **日志文件**
   - Credential Provider 会写入日志到 `C:\Program Files\YCDesk\ycdesk_cred_provider.log`
   - Electron 主进程日志可以在开发者工具中查看

2. **注册表项**
   ```
   HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{8FD7B8E2-3B5E-4A8B-A93C-5F7D1E2B4C6A}
   ```

---

## 常见问题

详见 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) 中的"常见问题"部分。

---

## 注意事项

- Credential Provider 需要 Windows 重启才能生效
- 必须用管理员权限安装
- CLSID 是 `{8FD7B8E2-3B5E-4A8B-A93C-5F7D1E2B4C6A}`
- 如果遇到问题，先检查日志文件
- 参考了 RemoteDesk 项目的实现（在 D:\MyProg\RemoteDesk）

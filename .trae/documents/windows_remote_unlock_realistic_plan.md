
# 🔐 YCDesk Windows 远程解锁 - 现实可行方案

---

## 📋 问题重新分析

### ❌ 为什么之前的方案都不行

| 方案 | 问题 |
|------|------|
| robotjs 模拟输入 | 无法在 Winlogon 安全桌面工作 |
| SYSTEM 服务 + 模拟输入 | Windows 桌面隔离机制，权限再高也无法跨桌面发送输入 |
| 会话注入 + 桌面切换 | 需要 TCB 特权，易被 AV 查杀，VBS/Credential Guard 下基本不可用 |

### ✅ 唯一可行的技术路径

Windows 桌面是严格隔离的容器，要操作锁屏界面，**代码必须运行在目标桌面上**。

---

## 🎯 多方案策略（优先级排序）

### 方案 A：Credential Provider（最正统，微软官方支持）
### 方案 B：Windows 自动登录 + 任务计划程序（最简单可靠）
### 方案 C：保留 robotjs（仅用于未锁定时的辅助）

---

## 📝 详细实施方案

---

## 第一阶段：方案 B - Windows 自动登录（快速实现，2-3天）

### 为什么选这个先做？
- 实现简单，不需要复杂的 C++ 开发
- 系统原生支持，最稳定可靠
- 适合单用户、自动化测试场景

### 1.1 实现内容

| 文件 | 说明 |
|------|-----|
| `windows/src/main/windows-auto-login-manager.js` | 自动登录配置管理 |
| `windows/resources/config-auto-login.ps1` | PowerShell 脚本配置注册表 |
| `windows/resources/disable-auto-login.ps1` | 禁用自动登录脚本 |

### 1.2 核心功能

```javascript
// windows/src/main/windows-auto-login-manager.js

class WindowsAutoLoginManager {
  // 1. 检查当前自动登录状态
  async checkAutoLoginStatus() { ... }
  
  // 2. 启用自动登录（写入注册表）
  async enableAutoLogin(username, password) {
    // 注册表路径：HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    // 键值：AutoAdminLogon = 1
    //       DefaultUserName = username
    //       DefaultPassword = password
  }
  
  // 3. 禁用自动登录
  async disableAutoLogin() { ... }
  
  // 4. 检测锁屏状态，配合任务计划程序
  async setupUnlockTask() {
    // 使用 schtasks 命令创建任务，在特定事件触发时解除锁定
    // 或者：检测到锁定时，重启机器并自动登录（粗暴但有效）
  }
}
```

### 1.3 PowerShell 脚本

```powershell
# config-auto-login.ps1
param(
  [string]$Username,
  [string]$Password
)

$winlogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

Set-ItemProperty -Path $winlogonPath -Name "AutoAdminLogon" -Value "1" -Type String
Set-ItemProperty -Path $winlogonPath -Name "DefaultUserName" -Value $Username -Type String
Set-ItemProperty -Path $winlogonPath -Name "DefaultPassword" -Value $Password -Type String
```

---

## 第二阶段：方案 A - Credential Provider（1-2周）

### 2.1 Credential Provider 架构

```
YCDesk Credential Provider (DLL)
    ↓
运行在 Winlogon.exe 进程中（安全桌面）
    ↓
通过命名管道 / 共享内存与 Electron 进程通信
    ↓
GetSerialization 中设置 pbAutoLogon = TRUE 并提交凭据
```

### 2.2 C++ Credential Provider 实现

| 文件 | 说明 |
|------|-----|
| `windows/credential_provider/src/YCDeskProvider.cpp` | Credential Provider COM 实现 |
| `windows/credential_provider/src/YCDeskProvider.h` | 头文件 |
| `windows/credential_provider/src/NamedPipeClient.cpp` | 命名管道客户端（接收 Electron 指令） |
| `windows/credential_provider/src/NamedPipeClient.h` | 头文件 |
| `windows/credential_provider/src/dllmain.cpp` | DLL 入口 |
| `windows/credential_provider/CMakeLists.txt` | CMake 构建配置 |
| `windows/credential_provider/YCDeskProvider.def` | DEF 文件 |

### 2.3 YCDeskProvider.cpp 核心逻辑

```cpp
class YCDeskProvider : public ICredentialProvider,
                        public ICredentialProviderSetUserArray {
public:
  // ... 标准 COM 实现 ...
  
  HRESULT STDMETHODCALLTYPE GetCredentialCount(
    DWORD* pdwCount,
    DWORD* pdwDefault,
    BOOL* pbAutoLogonWithDefault) {
    
    // 关键：检查是否有远程解锁请求
    if (HasUnlockRequestFromPipe()) {
      *pbAutoLogonWithDefault = TRUE;
      *pdwDefault = 0;
    }
    
    return S_OK;
  }
  
  HRESULT STDMETHODCALLTYPE GetCredentialAt(
    DWORD dwIndex,
    ICredentialProviderCredential** ppcpc) {
    
    // 创建我们的 Credential
    return YCDeskCredential_CreateInstance(ppcpc);
  }
};

class YCDeskCredential : public ICredentialProviderCredential,
                         public ICredentialProviderCredential2 {
public:
  // ...
  
  HRESULT STDMETHODCALLTYPE GetSerialization(
    CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
    PWSTR* ppwszOptionalStatusText,
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) {
    
    // 从命名管道读取凭据
    std::wstring username, password;
    ReadCredentialsFromPipe(&username, &password);
    
    // 构造 Kerberos 或 NTLM 凭据并序列化
    // ...
    
    // 设置为自动登录
    *pcpgsr = CPGSR_RETURN_CREDENTIAL_FINISHED;
    
    return S_OK;
  }
};
```

### 2.4 Node.js 命名管道服务端

| 文件 | 说明 |
|------|-----|
| `windows/src/main/named-pipe-server.js` | 命名管道服务端 |

```javascript
// windows/src/main/named-pipe-server.js
const net = require('net');

const PIPE_NAME = '\\\\.\\pipe\\YCDeskUnlockPipe';

class NamedPipeServer {
  constructor() {
    this.server = null;
    this.pendingCredentials = null;
  }
  
  start() {
    this.server = net.createServer((client) => {
      client.on('data', (data) => {
        // 处理 Credential Provider 的请求
        this.handleRequest(client, data);
      });
    });
    
    this.server.listen(PIPE_NAME);
  }
  
  setUnlockCredentials(username, password) {
    this.pendingCredentials = { username, password };
  }
  
  handleRequest(client, data) {
    // 魔数验证
    // 返回凭据给 Credential Provider
  }
}
```

### 2.5 Credential Provider 安装/卸载

| 文件 | 说明 |
|------|-----|
| `windows/resources/install-cred-provider.ps1` | 安装脚本（注册 DLL） |
| `windows/resources/uninstall-cred-provider.ps1` | 卸载脚本 |

```powershell
# install-cred-provider.ps1
# 1. 将 DLL 复制到系统目录
# 2. regsvr32 注册 COM 组件
# 3. 配置组策略/注册表，设置为默认 Credential Provider
```

---

## 第三阶段：UI 集成（2-3天）

### 3.1 设置页面

| 文件 | 修改 |
|------|-----|
| `windows/index.html` | 添加解锁方案选择 UI |
| `windows/src/renderer/js/app.js` | 集成解锁方案管理 |

### 3.2 UI 设计

```
解锁设置
├── 方案选择
│   ├── [x] Credential Provider（推荐）
│   ├── [ ] Windows 自动登录
│   └── [ ] 仅模拟输入（不推荐）
├── 凭据管理
│   ├── 保存解锁密码
│   └── 清除密码
└── 状态显示
    ├── Credential Provider 安装状态
    ├── 自动登录状态
    └── 解锁日志
```

---

## 第四阶段：集成和测试（2-3天）

### 4.1 完整集成

| 文件 | 修改 |
|------|-----|
| `windows/src/main/main.js` | 初始化解锁方案 |
| `windows/src/main/ipc-handlers.js` | 集成所有 IPC |
| `windows/src/main/auto-unlock-service.js` | 更新为多方案支持 |

### 4.2 测试场景

| 场景 | 验证内容 |
|------|---------|
| 方案 B（自动登录） | 设置后重启机器，自动登录 |
| 方案 A（Credential Provider） | 锁定屏幕，远程解锁成功 |
| 方案回退 | Credential Provider 失败时，提示用户使用方案 B |
| UI 状态 | 各方案状态正确显示 |

---

## 📁 文件清单

### 新增文件

```
windows/
├── credential_provider/
│   ├── src/
│   │   ├── YCDeskProvider.cpp
│   │   ├── YCDeskProvider.h
│   │   ├── NamedPipeClient.cpp
│   │   ├── NamedPipeClient.h
│   │   ├── dllmain.cpp
│   │   └── YCDeskProvider.def
│   ├── build/
│   ├── CMakeLists.txt
│   └── README.md
├── resources/
│   ├── config-auto-login.ps1
│   ├── disable-auto-login.ps1
│   ├── install-cred-provider.ps1
│   └── uninstall-cred-provider.ps1
└── src/
    └── main/
        ├── windows-auto-login-manager.js
        ├── named-pipe-server.js
        └── credential-provider-manager.js
```

### 修改文件

```
windows/
├── src/
│   ├── main/
│   │   ├── auto-unlock-service.js
│   │   ├── ipc-handlers.js
│   │   └── main.js
│   └── renderer/
│       └── js/
│           └── app.js
├── index.html
├── remote.html
└── package.json
```

---

## ⚠️ 风险和应对

| 风险 | 应对方案 |
|------|---------|
| Credential Provider 开发复杂 | 先做方案 B 快速验证，再逐步完善方案 A |
| UAC 权限要求 | 使用 Start-Process -Verb RunAs -Wait |
| 用户不希望明文存密码 | Credential Provider 方案不需要持久存，仅临时传递 |
| AV/EDR 查杀 | 代码签名，白名单申请 |

---

## 🎯 分阶段交付目标

### 阶段 1（2-3天）：方案 B 可用
- [ ] Windows 自动登录功能
- [ ] UI 配置界面
- [ ] 基础测试通过

### 阶段 2（1-2周）：方案 A 可用
- [ ] Credential Provider DLL 开发
- [ ] 命名管道通信
- [ ] 安装/卸载脚本
- [ ] 完整测试

### 阶段 3（2-3天）：最终完善
- [ ] 多方案切换 UI
- [ ] 日志系统
- [ ] 错误处理优化
- [ ] 文档完善

---

## 📌 下一步

等待用户确认后，立即开始阶段 1（方案 B - Windows 自动登录）的开发！

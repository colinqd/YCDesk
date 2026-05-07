# YCDesk Credential Provider 完整安装指南

## 问题诊断

你遇到的安装失败是因为 **Credential Provider 的 DLL 文件还没有编译**。

---

## 方法一：使用 RemoteDesk 已编译的 DLL（推荐，最快）

如果你已经有 RemoteDesk 项目，可以直接复制其已编译的 DLL：

### 步骤

1. 检查 RemoteDesk 的 build 目录：
   ```
   D:\MyProg\RemoteDesk\build-tests\apps\credential_provider\Release\
   ```

2. 如果找到 `RemoteDeskCredentialProvider.dll`，将其复制到：
   ```
   d:\MyProg\YCDesk\windows\credential_provider\build\Release\
   ```

3. 重命名为 `YCDeskCredentialProvider.dll`

4. 然后继续"安装 Credential Provider"部分

---

## 方法二：完整编译 Credential Provider

### 前置要求

你需要安装以下工具：

#### 1. Visual Studio 2019 或 2022
- 下载地址：https://visualstudio.microsoft.com/
- 安装时选择：**"使用 C++ 的桌面开发"** 工作负载
- 确保安装了：**VC++ 2019 或 2022 v143 C++ x64/x86 生成工具**

#### 2. CMake（已安装）
- 你已经有了，版本 4.3.1

### 编译步骤

#### 方式 A：使用 Visual Studio 开发者命令提示符（推荐）

1. 打开 **"Developer Command Prompt for VS 2022"**（或 2019）
   - 在开始菜单搜索 "Developer Command Prompt"

2. 进入目录：
   ```cmd
   cd d:\MyProg\YCDesk\windows\credential_provider
   ```

3. 创建 build 目录：
   ```cmd
   if not exist build mkdir build
   cd build
   ```

4. 配置 CMake：
   ```cmd
   cmake -G "Visual Studio 17 2022" -A x64 ..
   # 或者，如果你用的是 VS 2019
   cmake -G "Visual Studio 16 2019" -A x64 ..
   ```

5. 编译：
   ```cmd
   cmake --build . --config Release
   ```

6. 编译成功后，DLL 文件应该在：
   ```
   build\Release\YCDeskCredentialProvider.dll
   ```

#### 方式 B：使用 PowerShell 脚本

1. 在 PowerShell 中执行：
   ```powershell
   cd d:\MyProg\YCDesk\windows\credential_provider
   .\build.ps1 -Clean
   ```

2. 如果脚本找不到 PowerShell，可以直接运行 CMake 命令（见方式 A）

---

## 安装 Credential Provider

有两种安装方式：

### 方式一：在 YCDesk 设置页面安装

1. 编译完成后，确保 DLL 在：
   ```
   d:\MyProg\YCDesk\windows\credential_provider\build\Release\YCDeskCredentialProvider.dll
   ```

2. 打开 YCDesk → 进入设置页面

3. 点击 "刷新状态" 检查

4. 点击 "安装" 按钮 → 会弹出 UAC 提示 → 选择 "是"

5. 重启电脑

### 方式二：使用安装脚本

1. 编译完成后，以管理员身份打开 PowerShell

2. 执行：
   ```powershell
   cd d:\MyProg\YCDesk\windows\credential_provider
   .\install.ps1
   ```

3. 重启电脑

---

## 验证安装

1. 重启电脑后，打开 YCDesk → 设置页面

2. 点击 "刷新状态"

3. 应该显示为 "✅ 已安装"

4. 测试远程解锁：
   - 保存解锁密码
   - 锁定屏幕（Win+L）
   - 从其他设备远程解锁

---

## 常见问题

### Q: 编译时找不到 Visual Studio？

A: 确保你安装了 Visual Studio 2019 或 2022 的 **"使用 C++ 的桌面开发"** 工作负载。

### Q: UAC 提示被拒绝？

A: 确保你以管理员身份运行，或者在 UAC 提示时选择"是"。

### Q: 安装后还是显示未安装？

A: 确保你已经重启电脑！Credential Provider 必须重启才能生效。

### Q: 想卸载 Credential Provider？

A: 有两种方式：
- 在 YCDesk 设置页面点击 "卸载" 按钮
- 以管理员身份运行 `.\uninstall.ps1` 脚本

---

## 快速测试（无需等待完整安装）

如果你想先测试远程解锁功能，可以先使用现有的 robotjs 方式：

1. 在 YCDesk 设置页面设置解锁密码
2. 锁定屏幕
3. 从其他设备远程解锁

这种方式虽然不像 Credential Provider 那样高效，但可以先测试功能是否正常。

# 自签名证书使用完整指南

## ✅ 方案 A + B 已实现

### 方案 A：用户手动安装证书
### 方案 B：Android APK 内置信任证书

---

## 📋 使用步骤

---

## 第一步：生成自签名证书

### 在服务器目录执行：

```bash
cd server

# Windows
generate-cert.bat

# Linux/Mac
./generate-cert.sh
```

会生成两个文件：
- `server.crt` - 证书文件
- `server.key` - 私钥文件

---

## 第二步：配置 Android 端（方案 B）

### 将证书打包进 APK：

1. **复制证书文件**
   ```bash
   # 将 server.crt 复制到 Android 资源目录
   cp server/server.crt android/android/app/src/main/res/raw/ycdesk_self_signed.crt
   ```

2. **重新编译 Android APK**
   ```bash
   cd android
   npm run cap:build
   ```

3. **安装新 APK**
   - 编译后的 APK 会自动信任你的自签名证书
   - 无需用户手动操作！

---

## 第三步：Windows 端证书安装（方案 A）

### 方法一：双击安装（推荐）

1. 找到 `server/server.crt` 文件
2. **双击** 该文件
3. 点击"**安装证书**"
4. 选择"**本地计算机**" → 下一步
5. 选择"**将所有证书放入下列存储**"
6. 点击"**浏览**"
7. 选择"**受信任的根证书颁发机构**" → 确定
8. 下一步 → 完成
9. 重启 YCDesk Windows 客户端

### 方法二：命令行安装（高级用户）

```powershell
# 以管理员身份运行 PowerShell
Import-Certificate -FilePath "server\server.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

---

## 第四步：Linux 端证书安装（方案 A）

### Ubuntu/Debian：

```bash
sudo cp server/server.crt /usr/local/share/ca-certificates/ycdesk-server.crt
sudo update-ca-certificates
```

### CentOS/RHEL：

```bash
sudo cp server/server.crt /etc/pki/ca-trust/source/anchors/ycdesk-server.crt
sudo update-ca-trust
```

### 重启 YCDesk Linux 客户端

---

## 第五步：启动服务器

### 使用 HTTPS/WSS 模式：

```bash
cd server
node server.js --cert server.crt --key server.key --port 3000
```

---

## 第六步：客户端连接

| 平台 | 连接地址 | 说明 |
|------|----------|------|
| **Windows** | `wss://localhost:3000` | 或你的服务器 IP |
| **Linux** | `wss://localhost:3000` | 或你的服务器 IP |
| **Android** | `wss://服务器IP:3000` | APK 已内置证书信任 |

---

## 📱 Android 端特殊说明

### 如果不想重新编译 APK（仅方案 A）：

1. 将 `server.crt` 复制到 Android 设备
2. 打开"**设置**" → "**安全**" → "**加密与凭据**"
3. 点击"**从存储设备安装**"
4. 选择 `server.crt` 文件
5. 输入证书名称（如 "YCDesk Server"）
6. 选择"**VPN 和应用**"
7. 点击"**确定**"
8. 重启 YCDesk Android 应用

---

## 🔍 验证证书是否生效

### 检查连接日志：

成功的连接日志应该是：
```
[Renderer] 正在连接信令服务器: wss://localhost:3000
自动修正服务器地址: ...
✓ 已连接到信令服务器，Socket ID: ...
```

而不是 SSL 错误：
```
ERROR:ssl_client_socket_impl.cc(975)] handshake failed
```

---

## ⚠️ 重要提示

### 安全性说明：

1. **自签名证书仅用于开发/测试/小规模内部使用**
2. **生产环境请使用 Let's Encrypt 或正规 CA 证书**
3. **不要将自签名证书分发给不信任的用户**

### 两种方案对比：

| 特性 | 方案 A（手动安装） | 方案 B（APK 内置） |
|------|------------------|-------------------|
| 用户操作 | 需要手动安装 | 无需操作 |
| 重新编译 | 不需要 | 需要 |
| 更换证书 | 用户重新安装 | 重新编译 APK |
| 适用场景 | 小范围测试 | 固定部署 |

---

## 🔄 更换证书

### 如果需要生成新证书：

1. 重新运行 `generate-cert.bat` 或 `generate-cert.sh`
2. **方案 A**：通知所有用户重新安装新证书
3. **方案 B**：将新证书复制到 `android/android/app/src/main/res/raw/ycdesk_self_signed.crt`，重新编译 APK

---

## 📞 故障排除

### 问题：还是提示 SSL 错误？

1. **确认证书已正确安装**
2. **重启客户端应用**
3. **检查服务器是否以正确参数启动**：
   ```bash
   node server.js --cert server.crt --key server.key
   ```
4. **确认连接地址使用 `wss://` 而不是 `ws://` 或 `https://`**

### 问题：Android 无法连接？

1. 确认使用重新编译后的 APK
2. 或者手动安装证书到 Android 系统
3. 检查手机和服务器是否在同一网络

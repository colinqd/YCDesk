# SSL 证书问题修复指南

## 问题描述
Windows/Linux 端使用自签名证书连接 HTTPS/WSS 信令服务器时出现 SSL 握手错误：
```
ERROR:ssl_client_socket_impl.cc(975)] handshake failed; returned -1, SSL error code 1, net_error -107
```

## 已修复内容

### 1. Windows 端
- **修改文件：** `windows/src/main/main.js`
  - 添加 `ignore-certificate-errors` 和 `allow-insecure-localhost` 开关（仅开发环境）
  - 添加 `certificate-error` 事件处理
- **修改文件：** `windows/src/renderer/js/signaling-mode.js`
  - 添加 `rejectUnauthorized: false` 到 Socket.IO 配置

### 2. Linux 端
- **修改文件：** `linux/src/main/main.js`
  - 同样的证书信任配置
- **修改文件：** `linux/src/renderer/js/signaling-mode.js`
  - 添加 `rejectUnauthorized: false`

## 使用方法

### 开发环境（自签名证书）

1. **生成证书**
   ```bash
   cd server
   generate-cert.bat           # Windows
   ./generate-cert.sh           # Linux/Mac
   ```

2. **启动服务器（HTTPS/WSS 模式）**
   ```bash
   node server.js --cert server.crt --key server.key --port 3000
   ```

3. **启动客户端（开发模式）**
   ```bash
   cd windows
   npm run dev              # Windows 开发模式
   # 或
   cd linux
   npm run dev              # Linux 开发模式
   ```

### 生产环境（正规证书）

1. **使用 Let's Encrypt 或其他 CA 证书**
2. **启动服务器**
   ```bash
   node server.js --cert /path/to/fullchain.pem --key /path/to/privkey.pem --port 3000
   ```
3. **启动客户端（生产模式）**
   - 生产模式会验证证书，不会忽略错误
   - 确保证书由受信任的 CA 签发

## 安全提示

⚠️ **重要：**
- `ignore-certificate-errors` 和 `rejectUnauthorized: false` 仅用于开发环境
- 生产环境必须使用受信任的 CA 证书
- 不要在生产环境中禁用证书验证

## 测试验证

1. 确保服务器以开发模式启动（`NODE_ENV=development`）
2. 在客户端输入 `wss://localhost:3000` 连接
3. 应该能看到连接成功日志，不再有 SSL 错误

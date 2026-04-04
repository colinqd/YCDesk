# YCDesk Android 信令服务器

这是一个可以在 Android 设备上运行的信令服务器。

## 部署方式

### 方式一：使用 Termux（推荐）

1. 安装 Termux 应用
2. 在 Termux 中执行：
```bash
pkg install nodejs
pkg install git
cd ~
git clone <repository-url>
cd YCDesk/server
npm install
node server.js --port 3000
```

### 方式二：编译为独立 APK

使用 Node.js for Mobile Apps 或类似方案将服务器打包为 APK。

## 配置

### 使用自签名证书

```bash
# 生成证书
./generate-cert.sh  # Linux/Mac
generate-cert.bat   # Windows

# 启动服务器（HTTPS/WSS）
node server.js --cert server.crt --key server.key --port 3000
```

### 使用 HTTP（开发环境）

```bash
node server.js --no-https --port 3000
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port <number>` | 服务器端口 | 3000 |
| `--cert <path>` | SSL 证书文件路径 | - |
| `--key <path>` | SSL 私钥文件路径 | - |
| `--no-https` | 强制使用 HTTP | false |

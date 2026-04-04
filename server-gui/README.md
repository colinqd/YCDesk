# YCDesk Server GUI

YCDesk 信令服务器 - 图形界面版本

## 功能特性

- ✅ HTTP/WS 模式（无需证书，简单快速）
- ✅ HTTPS/WSS 模式（安全加密）
- ✅ 实时运行日志显示
- ✅ 一键启动/停止
- ✅ 跨平台支持（Windows/Linux）

## 快速开始

### 安装依赖

```bash
cd server-gui
npm install
```

### 开发模式运行

```bash
npm run dev
```

### 打包可执行文件

```bash
# Windows
npm run build:win

# Linux
npm run build:linux

# 全部平台
npm run build
```

## 使用说明

### HTTP/WS 模式（推荐）

1. 选择"HTTP / WS"模式
2. 输入端口（默认 3000）
3. 点击"启动服务器"

### HTTPS/WSS 模式

1. 选择"HTTPS / WSS"模式
2. 点击"浏览"选择证书文件（.crt/.pem）
3. 点击"浏览"选择私钥文件（.key/.pem）
4. 输入端口（默认 3000）
5. 点击"启动服务器"

## 生成自签名证书

如果没有证书，可以使用项目根目录的工具生成：

```bash
cd ../server

# Windows
generate-cert.bat

# Linux/Mac
./generate-cert.sh
```

证书会生成在 `server/` 目录下：
- `server.crt` - 证书文件
- `server.key` - 私钥文件

## 目录结构

```
server-gui/
├── src/
│   ├── main.js      # Electron 主进程
│   ├── preload.js   # 预加载脚本
│   ├── renderer.js  # 渲染进程
│   └── index.html   # 界面文件
├── package.json
└── README.md
```

## 技术栈

- **Electron** - 桌面应用框架
- **Node.js** - 后端运行时
- **Socket.IO** - 信令通信

## 许可证

MIT

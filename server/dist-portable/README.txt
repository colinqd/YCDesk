# YCDesk 信令服务器 v0.1.0 - 便携版使用说明

## 系统要求
- Windows 7 及以上
- Node.js v18+ (推荐 v20 或 v22)
  下载: https://nodejs.org/

## 使用方法

### 前台模式
双击 `start.bat` 启动服务器，命令行窗口保持打开显示日志。

### 后台模式
双击 `start-background.bat` 启动服务器，服务器在后台运行。

## 配置

编辑 `server.config.json` 修改端口等配置。

默认配置:
- 端口: 3000
- 日志级别: info

## 停止服务器
- 前台模式: 按 Ctrl+C
- 后台模式: 双击 `stop.bat` 或在任务管理器中结束 node.exe

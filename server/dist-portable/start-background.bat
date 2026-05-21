@echo off
chcp 65001 >nul
title YCDesk 信令服务器 v3.3.0 (后台模式)

echo ============================================
echo   YCDesk 信令服务器 v3.3.0 (后台模式)
echo ============================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Node.js 运行时
    echo 请从 https://nodejs.org/ 下载并安装 Node.js
    pause
    exit /b 1
)

:: 使用 start 命令隐藏窗口启动
start /B "" node server.js > server.log 2>&1

echo [信息] 服务器已在后台启动
echo [信息] 日志输出: server.log
echo [信息] 默认端口: 3000
echo.
echo 按任意键停止服务器...
pause >nul

:: 停止服务器
echo [信息] 正在停止服务器...
taskkill /f /im node.exe >nul 2>&1
echo [信息] 服务器已停止
pause

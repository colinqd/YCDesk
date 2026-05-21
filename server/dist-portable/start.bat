@echo off
chcp 65001 >nul
title YCDesk 信令服务器 v3.3.0

echo ============================================
echo   YCDesk 信令服务器 v3.3.0
echo   YCDesk Signaling Server
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

echo [信息] Node.js 版本:
node --version
echo.

:: 启动服务器
echo [信息] 正在启动信令服务器...
echo [信息] 默认端口: 3000
echo [信息] 按 Ctrl+C 停止服务器
echo.
node server.js

pause

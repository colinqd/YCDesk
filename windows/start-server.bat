@echo off
chcp 65001 >nul
title YCDesk - 信令服务器
echo ====================================
echo YCDesk 信令服务器
echo ====================================
echo.

cd /d "%~dp0server"

echo 正在启动信令服务器...
echo 服务器将在 http://localhost:3000 运行
echo.
echo 按 Ctrl+C 停止服务器
echo.

npm start

if %errorlevel% neq 0 (
    echo.
    echo 服务器启动失败！
    echo 请确保已运行"安装依赖.bat"
    echo.
    pause
)

@echo off
chcp 65001 >nul
title YCDesk - 客户端
echo ====================================
echo YCDesk 客户端
echo ====================================
echo.

cd /d "%~dp0"

echo 正在启动 YCDesk...
echo.

npm start

if %errorlevel% neq 0 (
    echo.
    echo 客户端启动失败！
    echo 请确保已运行"安装依赖.bat"
    echo.
    pause
)

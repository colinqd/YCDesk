@echo off
echo ========================================
echo   YCDesk Service 安装工具
echo ========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 需要管理员权限，正在请求提权...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo 正在安装 YCDeskService...
cd /d "%~dp0"

:: 安装依赖
call npm install --production

:: 运行安装脚本
node install.js

echo.
pause

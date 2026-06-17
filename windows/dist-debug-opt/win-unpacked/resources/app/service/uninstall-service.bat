@echo off
echo ========================================
echo   YCDesk Service 卸载工具
echo ========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 需要管理员权限，正在请求提权...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo 正在卸载 YCDeskService...
cd /d "%~dp0"

node uninstall.js

echo.
pause

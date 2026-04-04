@echo off
chcp 65001 >nul
echo ========================================
echo YCDesk Windows - 开发模式启动
echo ========================================
echo.
echo [信息] 设置 NODE_ENV=development
echo [信息] 此模式下会忽略 SSL 证书错误
echo.

set NODE_ENV=development
cd /d "%~dp0windows"
npm run dev

pause

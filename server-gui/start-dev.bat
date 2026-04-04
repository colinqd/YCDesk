@echo off
chcp 65001 >nul
echo ========================================
echo YCDesk Server GUI - 开发模式
echo ========================================
echo.

cd /d "%~dp0"

echo [信息] 检查依赖...
if not exist "node_modules" (
    echo [信息] 安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败！
        pause
        exit /b 1
    )
)

echo.
echo [信息] 启动应用...
echo.

npm run dev

pause

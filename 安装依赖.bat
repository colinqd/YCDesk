@echo off
chcp 65001 >nul
echo ====================================
echo YCDesk - 安装依赖
echo ====================================
echo.

echo [1/2] 正在安装客户端依赖...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ 客户端依赖安装失败！
    pause
    exit /b 1
)
echo ✅ 客户端依赖安装完成！
echo.

echo [2/2] 正在安装服务器依赖...
cd server
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ 服务器依赖安装失败！
    pause
    exit /b 1
)
echo ✅ 服务器依赖安装完成！
cd ..
echo.

echo ====================================
echo ✅ 所有依赖安装完成！
echo ====================================
echo.
echo 现在可以运行 start-server.bat 和 start-client.bat
echo.
pause

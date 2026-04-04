@echo off
chcp 65001 >nul
echo ========================================
echo YCDesk 自签名证书生成工具
echo ========================================
echo.

REM 优先使用 Node.js 脚本（兼容性更好）
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [信息] 使用 Node.js 方式生成证书...
    node generate-cert.js
    goto end
)

echo [提示] 未找到 Node.js，尝试使用 OpenSSL...
echo.

REM 检查 OpenSSL
where openssl >nul 2>&1
if %errorlevel% neq 0 (
    echo ========================================
    echo 错误：未找到 OpenSSL 或 Node.js！
    echo ========================================
    echo.
    echo 请选择以下方案之一：
    echo.
    echo 方案 A（推荐）：安装 Node.js
    echo   1. 下载地址: https://nodejs.org/
    echo   2. 安装后重新运行此脚本
    echo.
    echo 方案 B：安装 OpenSSL
    echo   1. 下载地址: https://slproweb.com/products/Win32OpenSSL.html
    echo   2. 安装后将 OpenSSL 的 bin 目录添加到 PATH 环境变量
    echo   3. 重新运行此脚本
    echo.
    echo 方案 C：使用在线证书生成工具
    echo   访问: https://www.selfsignedcertificate.com/
    echo   或: https://mkcert.dev/
    echo.
    pause
    exit /b 1
)

echo [信息] 使用 OpenSSL 方式生成证书...
echo.

echo [1/4] 生成私钥...
openssl genrsa -out server.key 2048
if %errorlevel% neq 0 (
    echo [错误] 生成私钥失败！
    pause
    exit /b 1
)
echo [完成] server.key 已生成
echo.

echo [2/4] 生成证书签名请求...
openssl req -new -key server.key -out server.csr -subj "/CN=localhost/O=YCDesk/OU=Development/C=CN"
if %errorlevel% neq 0 (
    echo [错误] 生成证书签名请求失败！
    pause
    exit /b 1
)
echo [完成] server.csr 已生成
echo.

echo [3/4] 生成自签名证书（有效期 365 天）...
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt
if %errorlevel% neq 0 (
    echo [错误] 生成自签名证书失败！
    pause
    exit /b 1
)
echo [完成] server.crt 已生成
echo.

echo [4/4] 清理临时文件...
del server.csr
echo [完成] 临时文件已清理
echo.

echo ========================================
echo 证书生成成功！
echo ========================================
echo.
echo 生成的文件：
echo   - server.crt  (证书文件)
echo   - server.key  (私钥文件)
echo.
echo 使用方法：
echo   node server.js --cert server.crt --key server.key --port 3000
echo.
echo 注意：
echo   - 此证书仅用于开发/测试环境
echo   - 生产环境请使用正规 CA 签发的证书（如 Let's Encrypt）
echo   - 浏览器会提示"不安全"，这是正常的
echo.
pause

:end

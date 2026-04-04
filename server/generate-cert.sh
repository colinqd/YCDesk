#!/bin/bash

echo "========================================"
echo "YCDesk 自签名证书生成工具"
echo "========================================"
echo ""

# 检查 Node.js
if command -v node &> /dev/null; then
    echo "[信息] 使用 Node.js 方式生成证书..."
    node generate-cert.js
    exit $?
fi

echo "[提示] 未找到 Node.js，尝试使用 OpenSSL..."
echo ""

# 检查 OpenSSL
if ! command -v openssl &> /dev/null; then
    echo "========================================"
    echo "错误：未找到 OpenSSL 或 Node.js！"
    echo "========================================"
    echo ""
    echo "请选择以下方案之一："
    echo ""
    echo "方案 A（推荐）：安装 Node.js"
    echo "  Ubuntu/Debian: sudo apt-get install nodejs npm"
    echo "  CentOS/RHEL:   sudo yum install nodejs npm"
    echo "  macOS:         brew install node"
    echo "  或访问: https://nodejs.org/"
    echo ""
    echo "方案 B：安装 OpenSSL"
    echo "  Ubuntu/Debian: sudo apt-get install openssl"
    echo "  CentOS/RHEL:   sudo yum install openssl"
    echo "  macOS:         brew install openssl"
    echo ""
    echo "方案 C：使用在线证书生成工具"
    echo "  访问: https://www.selfsignedcertificate.com/"
    echo "  或: https://mkcert.dev/"
    echo ""
    exit 1
fi

echo "[信息] 使用 OpenSSL 方式生成证书..."
echo ""

echo "[1/4] 生成私钥..."
openssl genrsa -out server.key 2048
if [ $? -ne 0 ]; then
    echo "[错误] 生成私钥失败！"
    exit 1
fi
echo "[完成] server.key 已生成"
echo ""

echo "[2/4] 生成证书签名请求..."
openssl req -new -key server.key -out server.csr -subj "/CN=localhost/O=YCDesk/OU=Development/C=CN"
if [ $? -ne 0 ]; then
    echo "[错误] 生成证书签名请求失败！"
    exit 1
fi
echo "[完成] server.csr 已生成"
echo ""

echo "[3/4] 生成自签名证书（有效期 365 天）..."
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt
if [ $? -ne 0 ]; then
    echo "[错误] 生成自签名证书失败！"
    exit 1
fi
echo "[完成] server.crt 已生成"
echo ""

echo "[4/4] 清理临时文件..."
rm -f server.csr
echo "[完成] 临时文件已清理"
echo ""

echo "========================================"
echo "证书生成成功！"
echo "========================================"
echo ""
echo "生成的文件："
echo "  - server.crt  (证书文件)"
echo "  - server.key  (私钥文件)"
echo ""
echo "使用方法："
echo "  node server.js --cert server.crt --key server.key --port 3000"
echo ""
echo "注意："
echo "  - 此证书仅用于开发/测试环境"
echo "  - 生产环境请使用正规 CA 签发的证书（如 Let's Encrypt）"
echo "  - 浏览器会提示"不安全"，这是正常的"
echo ""

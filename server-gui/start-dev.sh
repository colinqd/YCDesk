#!/bin/bash

echo "========================================"
echo "YCDesk Server GUI - 开发模式"
echo "========================================"
echo ""

cd "$(dirname "$0")"

echo "[信息] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "[信息] 安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败！"
        exit 1
    fi
fi

echo ""
echo "[信息] 启动应用..."
echo ""

npm run dev

@echo off
echo 正在停止 YCDesk 信令服务器...
taskkill /f /im node.exe >nul 2>&1
echo 服务器已停止
pause

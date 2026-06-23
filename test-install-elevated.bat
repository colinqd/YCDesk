@echo off
setlocal
chcp 65001 > nul
cd /d "D:\MyProg\YCDesk\windows\dist-v2\win-unpacked\resources\service-app"
echo [%date% %time%] 开始测试 install
echo [%date% %time%] --- 调用 elevate-cli install ---
"C:\Program Files\nodejs\node.exe" ".\elevate-cli.js" install
echo [%date% %time%] --- install 退出码 %ERRORLEVEL% ---
sc query ycdeskservice.exe
echo [%date% %time%] --- 验证完成 ---
endlocal

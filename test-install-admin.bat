@echo off
cd /d "D:\MyProg\YCDesk\windows\dist-v2\win-unpacked\resources\service-app"
"C:\Program Files\nodejs\node.exe" ".\elevate-cli.js" install
echo exit=%ERRORLEVEL%
pause

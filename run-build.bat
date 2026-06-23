@echo off
cd /d "D:\MyProg\YCDesk\windows"
echo Starting build at %date% %time% >> D:\MyProg\YCDesk\build4.log
call "C:\Program Files\nodejs\node.exe" "C:\Users\DHL\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js" run build >> D:\MyProg\YCDesk\build4.log 2>&1
echo Build exit=%ERRORLEVEL% at %time% >> D:\MyProg\YCDesk\build4.log

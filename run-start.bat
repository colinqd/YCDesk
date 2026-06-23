@echo off
cd /d "D:\MyProg\YCDesk\windows\service"
echo === net start === > "D:\MyProg\YCDesk\start_output.txt"
net start ycdeskservice >> "D:\MyProg\YCDesk\start_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\start_output.txt"
echo === sleep 3s === >> "D:\MyProg\YCDesk\start_output.txt"
ping -n 3 127.0.0.1 >nul
echo === sc query === >> "D:\MyProg\YCDesk\start_output.txt"
sc query ycdeskservice >> "D:\MyProg\YCDesk\start_output.txt" 2>&1
@echo off
cd /d "D:\MyProg\YCDesk\windows\service"
node elevate-cli.js install > "D:\MyProg\YCDesk\install_output.txt" 2> "D:\MyProg\YCDesk\install_error.txt"
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\install_output.txt"
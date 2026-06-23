@echo off
echo === run winsw.exe install === > "D:\MyProg\YCDesk\winsw_output.txt"
"D:\MyProg\YCDesk\windows\service\daemon\ycdeskservice.exe" install >> "D:\MyProg\YCDesk\winsw_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\winsw_output.txt"
echo === sc qc === >> "D:\MyProg\YCDesk\winsw_output.txt"
sc qc ycdeskservice >> "D:\MyProg\YCDesk\winsw_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\winsw_output.txt"
@echo off
echo === sc query === > "D:\MyProg\YCDesk\cleanup_output.txt"
sc query ycdeskservice >> "D:\MyProg\YCDesk\cleanup_output.txt" 2>&1
echo === sc delete === >> "D:\MyProg\YCDesk\cleanup_output.txt"
sc delete ycdeskservice >> "D:\MyProg\YCDesk\cleanup_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\cleanup_output.txt"
echo === sc query after delete === >> "D:\MyProg\YCDesk\cleanup_output.txt"
sc query ycdeskservice >> "D:\MyProg\YCDesk\cleanup_output.txt" 2>&1
echo === end === >> "D:\MyProg\YCDesk\cleanup_output.txt"
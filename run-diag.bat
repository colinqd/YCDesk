@echo off
echo === whoami /groups | find Admin === > "D:\MyProg\YCDesk\diag_output.txt"
whoami /groups | findstr /i "Admin" >> "D:\MyProg\YCDesk\diag_output.txt" 2>&1
echo === sc delete with verbose === >> "D:\MyProg\YCDesk\diag_output.txt"
sc delete ycdeskservice >> "D:\MyProg\YCDesk\diag_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\diag_output.txt"
echo === sc qc === >> "D:\MyProg\YCDesk\diag_output.txt"
sc qc ycdeskservice >> "D:\MyProg\YCDesk\diag_output.txt" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\MyProg\YCDesk\diag_output.txt"
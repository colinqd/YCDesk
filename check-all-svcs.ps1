Get-WmiObject Win32_Service | Where-Object { $_.Name -like '*ycdesk*' } | Select-Object Name, State, PathName | Format-Table -AutoSize
Write-Output "---"
sc query ycdeskservice.exe 2>&1
Write-Output "---"
sc query ycdeskservice 2>&1

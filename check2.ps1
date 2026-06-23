Get-ChildItem -Path 'D:\MyProg\YCDesk\windows\service\daemon' -ErrorAction SilentlyContinue | Select-Object Name, Length
Write-Output "---"
Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" -ErrorAction SilentlyContinue | Select-Object Name, State, PathName | Format-List

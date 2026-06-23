Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" | Select-Object Name, DisplayName, State, StartMode, PathName | Format-List

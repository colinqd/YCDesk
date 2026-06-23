Register-ScheduledTask -TaskName "YCDeskInstallTest" -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)) -Action (New-ScheduledTaskAction -Execute "cmd.exe" -Argument '/c cd /d "D:\MyProg\YCDesk\windows\service" && node elevate-cli.js install > "D:\MyProg\YCDesk\install_output.txt" 2>&1') -RunLevel Highest -Force -Description "YCDesk Install Test"
Start-Sleep -Seconds 3
Unregister-ScheduledTask -TaskName "YCDeskInstallTest" -Confirm:$false -ErrorAction SilentlyContinue

Write-Output "=== Install Output ==="
if (Test-Path "D:\MyProg\YCDesk\install_output.txt") {
  Get-Content "D:\MyProg\YCDesk\install_output.txt"
} else {
  Write-Output "No output file"
}

Write-Output ""
Write-Output "=== Service State ==="
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" -ErrorAction SilentlyContinue
if ($svc) {
  $svc | Select-Object Name, State, StartMode, PathName | Format-List
} else {
  Write-Output "service not found"
}

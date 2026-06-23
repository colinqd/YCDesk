$ErrorActionPreference = 'Stop'

# Use sc to manually set up the service with the correct binPath
# This bypasses both the broken P/Invoke code and the node-windows Service.install() quirks
$svcName = 'ycdeskservice'
$svcDisplay = 'YCDesk Remote Desktop Service'
$svcDesc = 'YCDesk 远程桌面后台服务，提供锁屏画面捕获和系统级输入注入功能'
$winswPath = 'D:\MyProg\YCDesk\windows\service\daemon\ycdeskservice.exe'

Write-Output "=== Verifying winsw.exe exists ==="
if (-not (Test-Path $winswPath)) {
  Write-Output "  NOT FOUND: $winswPath"
  exit 1
}
Write-Output "  OK: $winswPath"

Write-Output ""
Write-Output "=== Checking daemon dir contents ==="
Get-ChildItem -Path 'D:\MyProg\YCDesk\windows\service\daemon' | ForEach-Object { Write-Output "  - $($_.Name)" }

Write-Output ""
Write-Output "=== Creating service via sc.exe ==="
# binPath should be the path to ycdeskservice.exe
$createOutput = & sc.exe create $svcName binPath= "`"$winswPath`"" DisplayName= $svcDisplay start= auto 2>&1
Write-Output "  sc create output: $createOutput"

Start-Sleep -Seconds 1

Write-Output ""
Write-Output "=== Setting description ==="
$descOutput = & sc.exe description $svcName $svcDesc 2>&1
Write-Output "  sc description output: $descOutput"

Write-Output ""
Write-Output "=== Setting failure recovery ==="
$failOutput = & sc.exe failure $svcName reset= 86400 actions= restart/5000/restart/10000/restart/30000 2>&1
Write-Output "  sc failure output: $failOutput"

Write-Output ""
Write-Output "=== Verifying service state ==="
Start-Sleep -Seconds 1
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" -ErrorAction SilentlyContinue
if ($svc) {
  $svc | Select-Object Name, DisplayName, State, StartMode, PathName | Format-List
} else {
  Write-Output "  service not found"
}

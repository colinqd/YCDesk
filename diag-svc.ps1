Write-Output "=== 服务详情 ==="
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'"
$svc | Select-Object Name, DisplayName, State, StartMode, PathName | Format-List

Write-Output "`n=== 安装路径是否还存在 ==="
$paths = @(
  "C:\Users\DHL\AppData\Local\Temp\3FWjtg4I30ksHpvIhT4xzUUdVAZ\resources\service-app\service-daemon.js",
  "C:\Users\DHL\AppData\Local\Temp\3FWjtg4I30ksHpvIhT4xzUUdVAZ\resources\service-app\node_modules\node-windows\lib\wrapper.js"
)
foreach ($p in $paths) {
  if (Test-Path $p) {
    Write-Output "  存在: $p"
  } else {
    Write-Output "  不存在: $p"
  }
}

Write-Output "`n=== 当前用户 Temp 目录中的 YCDesk 相关临时目录 ==="
Get-ChildItem -Path "C:\Users\DHL\AppData\Local\Temp" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^[0-9a-zA-Z]{20,}$' } |
  Select-Object -First 5 |
  ForEach-Object { Write-Output "  $($_.FullName)" }

Write-Output "`n=== 最近的相关服务事件 ==="
Get-EventLog -LogName System -Newest 50 -Source 'Service Control Manager' -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*ycdesk*' -or $_.Message -like '*YCDesk*' } |
  Select-Object -First 10 |
  ForEach-Object { Write-Output ('  [' + $_.TimeGenerated + '] ' + ($_.Message -replace "`r`n", ' ').Substring(0, [Math]::Min(150, $_.Message.Length))) }

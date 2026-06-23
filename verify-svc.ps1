Start-Sleep -Seconds 2
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'"
Write-Output "=== Service State ==="
$svc | Select-Object Name, DisplayName, State, StartMode, PathName | Format-List

Write-Output ""
Write-Output "=== binPath File Exists ==="
$pathName = $svc.PathName
$exePath = ($pathName -split '"')[1]
if ($exePath.StartsWith('"')) { $exePath = $exePath.Substring(1) }
if (Test-Path $exePath) {
  Write-Output "  EXISTS: $exePath"
  $dir = Split-Path $exePath -Parent
  Get-ChildItem -Path $dir | ForEach-Object { Write-Output "  - $($_.Name)" }
} else {
  Write-Output "  MISSING: $exePath"
}

Write-Output ""
Write-Output "=== Recent Service Events ==="
Get-EventLog -LogName System -Newest 30 -Source 'Service Control Manager' -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*ycdesk*' -or $_.Message -like '*YCDesk*' } |
  Select-Object -First 5 |
  ForEach-Object {
    $msg = ($_.Message -replace "`r`n", ' ')
    if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) + '...' }
    Write-Output ('  [' + $_.TimeGenerated + '] ' + $msg)
  }

Write-Output ""
Write-Output "=== Service Daemon Log (last 20 lines) ==="
$logPath = 'C:\Users\DHL\.ycdesk\service-daemon.log'
if (Test-Path $logPath) {
  $bytes = [System.IO.File]::ReadAllBytes($logPath)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $lines = $text -split "`n"
  $start = [Math]::Max(0, $lines.Count - 20)
  for ($i = $start; $i -lt $lines.Count; $i++) {
    Write-Output $lines[$i]
  }
} else {
  Write-Output "  log missing"
}

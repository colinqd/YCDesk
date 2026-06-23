$serviceAppDir = 'D:\MyProg\YCDesk\windows\service'
$daemonDir = Join-Path $serviceAppDir 'daemon'

Write-Output "=== Service App Dir ==="
if (Test-Path $serviceAppDir) {
  Get-ChildItem -Path $serviceAppDir -Force | Select-Object Name, Mode | Format-Table -AutoSize
} else {
  Write-Output "  not found: $serviceAppDir"
}

Write-Output ""
Write-Output "=== Daemon Dir ==="
if (Test-Path $daemonDir) {
  Get-ChildItem -Path $daemonDir -Force | Select-Object Name, Length | Format-Table -AutoSize
  Write-Output ""
  Write-Output "=== Daemon XML ==="
  $xmlFile = Join-Path $daemonDir 'ycdeskservice.xml'
  if (Test-Path $xmlFile) {
    Get-Content $xmlFile
  } else {
    Write-Output "  not found: $xmlFile"
  }
} else {
  Write-Output "  not found: $daemonDir"
}

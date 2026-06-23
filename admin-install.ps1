$ErrorActionPreference = 'Stop'

# Find the service name
$svcName = 'ycdeskservice'

# Try to stop the service first
Write-Output "=== Stopping service ==="
try {
  $stop = Start-Process -FilePath "sc.exe" -ArgumentList "stop", $svcName -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sc_stop_out.txt" -RedirectStandardError "$env:TEMP\sc_stop_err.txt"
  Write-Output "  sc stop exit: $($stop.ExitCode)"
  if (Test-Path "$env:TEMP\sc_stop_out.txt") { Get-Content "$env:TEMP\sc_stop_out.txt" }
} catch {
  Write-Output "  stop error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2

# Try to delete the service
Write-Output ""
Write-Output "=== Deleting service ==="
try {
  $del = Start-Process -FilePath "sc.exe" -ArgumentList "delete", $svcName -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sc_del_out.txt" -RedirectStandardError "$env:TEMP\sc_del_err.txt"
  Write-Output "  sc delete exit: $($del.ExitCode)"
  if (Test-Path "$env:TEMP\sc_del_out.txt") { Get-Content "$env:TEMP\sc_del_out.txt" }
} catch {
  Write-Output "  delete error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2

# Run elevate-cli install
Write-Output ""
Write-Output "=== Running elevate-cli install ==="
Set-Location "D:\MyProg\YCDesk\windows\service"
$installOutput = & node elevate-cli.js install 2>&1 | Out-String
Write-Output $installOutput

# Show current state
Write-Output ""
Write-Output "=== Current service state ==="
Start-Sleep -Seconds 2
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" -ErrorAction SilentlyContinue
if ($svc) {
  $svc | Select-Object Name, State, StartMode, PathName | Format-List
} else {
  Write-Output "  service not found"
}

$script = @'
cd /d "d:\MyProg\YCDesk\windows\service"
node elevate-cli.js install
'@
$tempBat = Join-Path $env:TEMP "ycdesk_install_$([DateTime]::Now.Ticks).bat"
[System.IO.File]::WriteAllText($tempBat, $script, [System.Text.Encoding]::UTF8)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $tempBat
$psi.Verb = "runas"
$psi.UseShellExecute = $true
$psi.WindowStyle = "Normal"

try {
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.WaitForExit()
  Write-Output "ExitCode: $($proc.ExitCode)"
} catch {
  Write-Output "Error: $($_.Exception.Message)"
} finally {
  Remove-Item $tempBat -ErrorAction SilentlyContinue
}

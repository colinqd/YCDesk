$outFile = 'D:\MyProg\YCDesk\start_output.txt'
Remove-Item $outFile -ErrorAction SilentlyContinue

$batContent = @"
@echo off
cd /d "D:\MyProg\YCDesk\windows\service"
echo === net start === > "$outFile"
net start ycdeskservice >> "$outFile" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "$outFile"
echo === sleep 3s === >> "$outFile"
ping -n 3 127.0.0.1 >nul
echo === sc query === >> "$outFile"
sc query ycdeskservice >> "$outFile" 2>&1
"@
$batFile = 'D:\MyProg\YCDesk\run-start.bat'
[System.IO.File]::WriteAllText($batFile, $batContent, [System.Text.Encoding]::ASCII)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $batFile
$psi.Verb = "runas"
$psi.UseShellExecute = $true
$psi.WindowStyle = "Hidden"

try {
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.WaitForExit(60000) | Out-Null
} catch {
  Write-Output "Error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2
if (Test-Path $outFile) { Get-Content $outFile }

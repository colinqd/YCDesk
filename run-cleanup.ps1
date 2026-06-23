$outFile = 'D:\MyProg\YCDesk\cleanup_output.txt'
Remove-Item $outFile -ErrorAction SilentlyContinue

$batContent = @"
@echo off
echo === sc query === > "$outFile"
sc query ycdeskservice >> "$outFile" 2>&1
echo === sc delete === >> "$outFile"
sc delete ycdeskservice >> "$outFile" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "$outFile"
echo === sc query after delete === >> "$outFile"
sc query ycdeskservice >> "$outFile" 2>&1
echo === end === >> "$outFile"
"@
$batFile = 'D:\MyProg\YCDesk\run-cleanup.bat'
[System.IO.File]::WriteAllText($batFile, $batContent, [System.Text.Encoding]::ASCII)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $batFile
$psi.Verb = "runas"
$psi.UseShellExecute = $true
$psi.WindowStyle = "Hidden"

try {
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.WaitForExit(30000) | Out-Null
} catch {
  Write-Output "Error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2
if (Test-Path $outFile) { Get-Content $outFile }

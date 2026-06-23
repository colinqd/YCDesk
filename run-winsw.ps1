$outFile = 'D:\MyProg\YCDesk\winsw_output.txt'
Remove-Item $outFile -ErrorAction SilentlyContinue

$winswPath = 'D:\MyProg\YCDesk\windows\service\daemon\ycdeskservice.exe'

$batContent = @"
@echo off
echo === run winsw.exe install === > "$outFile"
"$winswPath" install >> "$outFile" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "$outFile"
echo === sc qc === >> "$outFile"
sc qc ycdeskservice >> "$outFile" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "$outFile"
"@
$batFile = 'D:\MyProg\YCDesk\run-winsw.bat'
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

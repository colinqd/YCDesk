$outFile = 'D:\MyProg\YCDesk\install_output.txt'
$errFile = 'D:\MyProg\YCDesk\install_error.txt'

# 删除旧输出文件
Remove-Item $outFile -ErrorAction SilentlyContinue
Remove-Item $errFile -ErrorAction SilentlyContinue

# 创建一个批处理文件，包含整个 install 命令
$batContent = @"
@echo off
cd /d "D:\MyProg\YCDesk\windows\service"
node elevate-cli.js install > "$outFile" 2> "$errFile"
echo EXITCODE=%ERRORLEVEL% >> "$outFile"
"@
$batFile = 'D:\MyProg\YCDesk\run-install.bat'
[System.IO.File]::WriteAllText($batFile, $batContent, [System.Text.Encoding]::ASCII)

# 用 Start-Process 提权运行
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $batFile
$psi.Verb = "runas"
$psi.UseShellExecute = $true
$psi.WindowStyle = "Hidden"

try {
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.WaitForExit(60000) | Out-Null
  Write-Output "Process exit: $($proc.ExitCode)"
} catch {
  Write-Output "Error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2

Write-Output ""
Write-Output "=== Install Output ==="
if (Test-Path $outFile) { Get-Content $outFile } else { Write-Output "no output file" }

Write-Output ""
Write-Output "=== Service State ==="
$svc = Get-WmiObject Win32_Service -Filter "Name='ycdeskservice'" -ErrorAction SilentlyContinue
if ($svc) {
  $svc | Select-Object Name, State, StartMode, PathName | Format-List
} else {
  Write-Output "service not found"
}

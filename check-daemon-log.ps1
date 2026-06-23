$logPath = 'C:\Users\DHL\.ycdesk\service-daemon.log'
if (Test-Path $logPath) {
  $bytes = [System.IO.File]::ReadAllBytes($logPath)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $lines = $text -split "`n"
  $start = [Math]::Max(0, $lines.Count - 15)
  for ($i = $start; $i -lt $lines.Count; $i++) {
    Write-Output $lines[$i]
  }
} else {
  Write-Output "log missing: $logPath"
}

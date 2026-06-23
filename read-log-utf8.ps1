$logPath = 'C:\Users\DHL\.ycdesk\service-daemon.log'
if (Test-Path $logPath) {
  $bytes = [System.IO.File]::ReadAllBytes($logPath)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  Write-Output $text
}

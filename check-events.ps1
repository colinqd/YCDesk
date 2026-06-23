Get-EventLog -LogName System -Newest 50 -Source 'Service Control Manager' -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*ycdesk*' -or $_.Message -like '*YCDesk*' } |
  Select-Object -First 20 |
  ForEach-Object { Write-Output ('[' + $_.TimeGenerated + '] ' + $_.Message) }

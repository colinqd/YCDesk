# YCDesk Credential Provider Diagnostic Script
# Run as Administrator
Write-Host "=== YCDesk CP Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

$dllPath = "C:\Program Files\YCDesk\YCDeskCredentialProvider.dll"
$clsid = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"

Write-Host "[1] Check DLL file" -ForegroundColor Yellow
if (Test-Path $dllPath) {
    $dll = Get-Item $dllPath
    Write-Host "  EXISTS: $dllPath"
    Write-Host "  Size: $($dll.Length) bytes"
    Write-Host "  Modified: $($dll.LastWriteTime)"
    
    # Check architecture
    $peHeader = [System.IO.File]::ReadAllBytes($dllPath)
    if ($peHeader.Length -gt 0x3C + 4) {
        $peOffset = [BitConverter]::ToInt32($peHeader, 0x3C)
        $machine = [BitConverter]::ToUInt16($peHeader, $peOffset + 4)
        $arch = if ($machine -eq 0x014C) { "32-bit (x86)" } elseif ($machine -eq 0x8664) { "64-bit (x64)" } elseif ($machine -eq 0xAA64) { "ARM64" } else { "Unknown (0x$($machine.ToString('X4'))" }
        Write-Host "  Architecture: $arch"
    }
} else {
    Write-Host "  MISSING: $dllPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Check CLSID Registry" -ForegroundColor Yellow
$clsidPath = "HKLM:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32"
if (Test-Path $clsidPath) {
    $val = (Get-ItemProperty -Path $clsidPath -Name '(default)' -ErrorAction SilentlyContinue).'(default)'
    $threadModel = (Get-ItemProperty -Path $clsidPath -Name 'ThreadingModel' -ErrorAction SilentlyContinue).'ThreadingModel'
    Write-Host "  InprocServer32: $val"
    Write-Host "  ThreadingModel: $threadModel"
} else {
    Write-Host "  MISSING CLSID registration" -ForegroundColor Red
}

Write-Host ""
Write-Host "[3] Check Credential Provider Registry" -ForegroundColor Yellow
$cpPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\$clsid"
if (Test-Path $cpPath) {
    $cpName = (Get-ItemProperty -Path $cpPath -Name '(default)' -ErrorAction SilentlyContinue).'(default)'
    Write-Host "  Registered as: $cpName"
} else {
    Write-Host "  MISSING Credential Provider registration" -ForegroundColor Red
}

Write-Host ""
Write-Host "[4] Try regsvr32 registration" -ForegroundColor Yellow
$result = Start-Process -FilePath "C:\Windows\System32\regsvr32.exe" -ArgumentList "/s `"$dllPath`"" -Wait -NoNewWindow -PassThru
Write-Host "  Exit code: $($result.ExitCode) (0 = success)"
if ($result.ExitCode -ne 0) {
    Write-Host "  REGSVR32 FAILED! Run without /s to see error dialog." -ForegroundColor Red
}

Write-Host ""
Write-Host "[5] Check Data Directory ACL" -ForegroundColor Yellow
$dataDir = "C:\ProgramData\YCDesk"
if (Test-Path $dataDir) {
    $acl = Get-Acl $dataDir
    Write-Host "  Owner: $($acl.Owner)"
    Write-Host "  Access rules:"
    $acl.Access | ForEach-Object {
        Write-Host "    $($_.IdentityReference) : $($_.FileSystemRights) : $($_.AccessControlType)"
    }
} else {
    Write-Host "  Directory missing!" -ForegroundColor Red
}

Write-Host ""
Write-Host "[6] Check if flag files exist" -ForegroundColor Yellow
$flagFile = Join-Path $dataDir "unlock_ready.flag"
$credsFile = Join-Path $dataDir "unlock_creds.dat"
if (Test-Path $flagFile) { Write-Host "  Flag file EXISTS: $flagFile ($((Get-Item $flagFile).Length) bytes)" } 
else { Write-Host "  Flag file missing" -ForegroundColor Yellow }
if (Test-Path $credsFile) { Write-Host "  Creds file EXISTS: $credsFile ($((Get-Item $credsFile).Length) bytes)" } 
else { Write-Host "  Creds file missing" -ForegroundColor Yellow }

Write-Host ""
Write-Host "[7] Check DLL exports (Dependencies)" -ForegroundColor Yellow
try {
    $depOutput = & "C:\Windows\System32\dumpbin.exe" /dependents $dllPath 2>&1
    $depOutput | Select-String "YCDesk|DllGetClassObject|DllRegisterServer" | ForEach-Object {
        Write-Host "  $_"
    }
    # Also check for missing DLLs
    $depOutput | Select-String "(not found|NOT FOUND)" | ForEach-Object {
        Write-Host "  MISSING DEP: $_" -ForegroundColor Red
    }
} catch {
    Write-Host "  dumpbin not available (install Visual Studio)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[8] IMPORTANT: Try rebooting Windows, then lock (Win+L) and test again" -ForegroundColor Green
Write-Host "    New Credential Providers often require a reboot to be recognized."
Write-Host ""
Write-Host "=== Diagnostic Complete ===" -ForegroundColor Cyan

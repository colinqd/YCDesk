#Requires -RunAsAdministrator
# YCDesk Credential Provider - One-click fix and install

$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  YCDesk CP Repair and Install" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

$newCLSID    = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
$providerReg = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers'
$clsidReg    = 'HKLM:\SOFTWARE\Classes\CLSID'
$installDir  = "$env:ProgramFiles\YCDesk"

# ========================
# Step 1: Kill LogonUI to break lock loop
# ========================
Write-Host '[1/5] Killing LogonUI to break lock loop...' -ForegroundColor Yellow
Stop-Process -Name 'LogonUI' -Force -ErrorAction SilentlyContinue
Write-Host '  Done (screen may blink briefly - this is normal)' -ForegroundColor Green
Start-Sleep -Seconds 2

# ========================
# Step 2: Delete RemoteDesk old DLL files
# ========================
Write-Host '[2/5] Deleting old RemoteDesk CP DLLs...' -ForegroundColor Yellow

$oldDllPaths = @(
    "$env:ProgramFiles\RemoteDesk\RemoteDeskCredentialProvider.dll",
    "$env:ProgramFiles\RemoteDesk\SimpleCredentialProvider.dll"
)

foreach ($dll in $oldDllPaths) {
    if (Test-Path $dll) {
        try {
            Remove-Item -LiteralPath $dll -Force -ErrorAction Stop
            Write-Host "  Deleted: $dll" -ForegroundColor Green
        } catch {
            Write-Host "  Could not delete: $dll ($_)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Not found: $dll" -ForegroundColor Gray
    }
}

# ========================
# Step 3: Clean all old registry entries
# ========================
Write-Host '[3/5] Cleaning old registry entries...' -ForegroundColor Yellow

$oldCLSIDs = @(
    '%CLSID%',
    '{12345678-1234-1234-1234-567890ABCDEF}',
    '{8FD7B8E2-3B5E-4A8B-A93C-5F7D1E2B4C6A}',
    '{849A629B-903E-422F-AE57-308E1C10C34C}',
    $newCLSID
)

foreach ($clsid in $oldCLSIDs) {
    $p1 = Join-Path $providerReg $clsid
    if (Test-Path $p1) {
        Remove-Item -LiteralPath $p1 -Force -Recurse -ErrorAction SilentlyContinue
        Write-Host "  Removed Provider: $clsid" -ForegroundColor Green
    }

    $p2 = Join-Path $clsidReg $clsid
    if (Test-Path $p2) {
        Remove-Item -LiteralPath $p2 -Force -Recurse -ErrorAction SilentlyContinue
        Write-Host "  Removed CLSID: $clsid" -ForegroundColor Green
    }
}

# Also remove RemoteDesk Software key
$rdKey = 'HKLM:\SOFTWARE\RemoteDesk'
if (Test-Path $rdKey) {
    Remove-Item -LiteralPath $rdKey -Force -Recurse -ErrorAction SilentlyContinue
    Write-Host '  Removed RemoteDesk software key' -ForegroundColor Green
}

Write-Host '  Registry cleanup done' -ForegroundColor Green
Write-Host ''

# ========================
# Step 4: Copy DLL to install directory
# ========================
Write-Host '[4/5] Installing YCDesk CP DLL...' -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$possibleDlls = @(
    (Join-Path $scriptDir 'build\Release\YCDeskCredentialProvider.dll'),
    (Join-Path $scriptDir 'Release\YCDeskCredentialProvider.dll'),
    (Join-Path (Split-Path $scriptDir -Parent) 'bin\YCDeskCredentialProvider.dll')
)

$dllPath = $null
foreach ($dll in $possibleDlls) {
    if (Test-Path -LiteralPath $dll) {
        $dllPath = $dll
        Write-Host "  Found DLL: $dllPath" -ForegroundColor Green
        break
    }
}

if (-not $dllPath) {
    Write-Host '  ERROR: Cannot find YCDeskCredentialProvider.dll!' -ForegroundColor Red
    Write-Host '  Tried paths:' -ForegroundColor Red
    foreach ($dll in $possibleDlls) {
        Write-Host "    $dll" -ForegroundColor Red
    }
    Write-Host '  Press Enter to exit...' -ForegroundColor Red
    Read-Host
    exit 1
}

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

$targetDll = Join-Path $installDir 'YCDeskCredentialProvider.dll'
Copy-Item -LiteralPath $dllPath -Destination $targetDll -Force
Write-Host "  Installed DLL: $targetDll" -ForegroundColor Green
Write-Host ''

# ========================
# Step 5: Register Credential Provider
# ========================
Write-Host '[5/5] Registering Credential Provider...' -ForegroundColor Yellow

# CLSID key
$clsidPath = Join-Path $clsidReg $newCLSID
if (-not (Test-Path $clsidPath)) {
    New-Item -Path $clsidPath -Force | Out-Null
}
Set-ItemProperty -LiteralPath $clsidPath -Name '(default)' -Value 'YCDesk Credential Provider' -Type String

# InprocServer32
$inprocPath = Join-Path $clsidPath 'InprocServer32'
if (-not (Test-Path $inprocPath)) {
    New-Item -Path $inprocPath -Force | Out-Null
}
Set-ItemProperty -LiteralPath $inprocPath -Name '(default)' -Value $targetDll -Type String
Set-ItemProperty -LiteralPath $inprocPath -Name 'ThreadingModel' -Value 'Apartment' -Type String
Write-Host '  CLSID registered' -ForegroundColor Green

# Credential Provider entry
$cpPath = Join-Path $providerReg $newCLSID
if (-not (Test-Path $cpPath)) {
    New-Item -Path $cpPath -Force | Out-Null
}
Set-ItemProperty -LiteralPath $cpPath -Name '(default)' -Value 'YCDeskCredentialProvider' -Type String
Write-Host '  Credential Provider registered' -ForegroundColor Green

# Install path for logging
$appKey = 'HKLM:\SOFTWARE\YCDesk'
if (-not (Test-Path $appKey)) {
    New-Item -Path $appKey -Force | Out-Null
}
Set-ItemProperty -LiteralPath $appKey -Name 'InstallPath' -Value $installDir -Type String
Write-Host '  Install path set' -ForegroundColor Green

# Restart LogonUI
Write-Host ''
Write-Host 'Restarting LogonUI...' -ForegroundColor Yellow
Start-Process 'LogonUI.exe' -NoNewWindow -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host ''
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host '  REPAIR COMPLETE!' -ForegroundColor Green
Write-Host ''
Write-Host '  REBOOT your computer now to apply changes.' -ForegroundColor Yellow
Write-Host '  After reboot: Win+L lock screen should work normally' -ForegroundColor Yellow
Write-Host '==============================================' -ForegroundColor Cyan

Read-Host 'Press Enter to exit'

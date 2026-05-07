# YCDesk Credential Provider Installation Script
# Requires administrator privileges

param(
    [string]$DllPath,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

# Check admin privileges
function Test-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "ERROR: This script requires administrator privileges!" -ForegroundColor Red
    Write-Host "Please right-click and select Run as administrator" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) {
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    exit 1
}

Write-Host "=== YCDesk Credential Provider Installation ===" -ForegroundColor Cyan

# Clean up old/broken Credential Provider entries
Write-Host "Cleaning up old Credential Provider entries..." -ForegroundColor Yellow

$oldEntries = @(
    "%CLSID%",
    "{8FD7B8E2-3B5E-4A8B-A93C-5F7D1E2B4C6A}"
)

$providerBaseKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers"
$clsidBaseKey = "HKLM:\SOFTWARE\Classes\CLSID"

foreach ($entry in $oldEntries) {
    try {
        $cpKey = "$providerBaseKey\$entry"
        if (Test-Path $cpKey) {
            Remove-Item -Path $cpKey -Force -Recurse
            Write-Host "  Removed CP: $entry" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Skipped CP: $entry (not found)" -ForegroundColor Gray
    }
    try {
        $clsidKey = "$clsidBaseKey\$entry"
        if (Test-Path $clsidKey) {
            Remove-Item -Path $clsidKey -Force -Recurse
            Write-Host "  Removed CLSID: $entry" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Skipped CLSID: $entry (not found)" -ForegroundColor Gray
    }
}

Write-Host "Cleanup complete." -ForegroundColor Green
Write-Host ""

# Find DLL file
if ([string]::IsNullOrEmpty($DllPath)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $possiblePaths = @(
        (Join-Path $scriptDir "YCDeskCredentialProvider.dll"),
        (Join-Path $scriptDir "bin\YCDeskCredentialProvider.dll"),
        (Join-Path $scriptDir "Release\YCDeskCredentialProvider.dll"),
        (Join-Path $scriptDir "build\Release\YCDeskCredentialProvider.dll"),
        (Join-Path (Split-Path $scriptDir -Parent) "bin\YCDeskCredentialProvider.dll")
    )
    
    foreach ($p in $possiblePaths) {
        if (Test-Path $p) {
            $DllPath = $p
            break
        }
    }
}

if ([string]::IsNullOrEmpty($DllPath) -or !(Test-Path $DllPath)) {
    Write-Host "ERROR: Cannot find YCDeskCredentialProvider.dll file!" -ForegroundColor Red
    Write-Host "Please run build.ps1 first to compile" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) {
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    exit 1
}

$DllPath = Resolve-Path $DllPath
Write-Host "Found DLL: $DllPath" -ForegroundColor Green

# Determine installation directory
$installDir = "C:\Program Files\YCDesk"
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

$targetDll = Join-Path $installDir "YCDeskCredentialProvider.dll"

Write-Host "Installation directory: $installDir" -ForegroundColor Yellow
Write-Host "Copying DLL..." -ForegroundColor Yellow

Copy-Item $DllPath $targetDll -Force

Write-Host "Configuring registry..." -ForegroundColor Yellow

$CLSID = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
$providerKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\$CLSID"

# Create Credential Provider registry key
if (!(Test-Path $providerKey)) {
    New-Item -Path $providerKey -Force | Out-Null
}

Set-ItemProperty -Path $providerKey -Name "(default)" -Value "YCDesk Credential Provider"

# Create CLSID registry key (use HKLM instead of HKCR)
$clsidKey = "HKLM:\SOFTWARE\Classes\CLSID\$CLSID"
if (!(Test-Path $clsidKey)) {
    New-Item -Path $clsidKey -Force | Out-Null
}
Set-ItemProperty -Path $clsidKey -Name "(default)" -Value "YCDesk Credential Provider"

$inproc32Key = "$clsidKey\InprocServer32"
if (!(Test-Path $inproc32Key)) {
    New-Item -Path $inproc32Key -Force | Out-Null
}
Set-ItemProperty -Path $inproc32Key -Name "(default)" -Value $targetDll
Set-ItemProperty -Path $inproc32Key -Name "ThreadingModel" -Value "Apartment"

# Write installation directory to registry
$configKey = "HKLM:\SOFTWARE\YCDesk"
if (!(Test-Path $configKey)) {
    New-Item -Path $configKey -Force | Out-Null
}
Set-ItemProperty -Path $configKey -Name "InstallPath" -Value $installDir

Write-Host ""
Write-Host "Installation successful!" -ForegroundColor Green
Write-Host ""
if (-not $Silent) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart your computer (recommended)"
    Write-Host "2. Lock screen (Win+L) to test"
    Write-Host "3. You should see YCDesk option on login screen"
    Write-Host ""
    Write-Host "To uninstall, run uninstall.ps1"
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

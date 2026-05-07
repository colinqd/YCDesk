# YCDesk Credential Provider Emergency Uninstall Script
# Use this to stop the constant screen lock loop

param(
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
    if (-not $Silent) {
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    exit 1
}

Write-Host "=== YCDesk Credential Provider Emergency Uninstall ===" -ForegroundColor Cyan

$CLSID = "{12345678-1234-1234-1234-567890ABCDEF}"

# Delete registry keys immediately
Write-Host "Removing Credential Provider registry key..." -ForegroundColor Yellow
$providerKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\$CLSID"
if (Test-Path $providerKey) {
    Remove-Item -Path $providerKey -Recurse -Force
    Write-Host "Provider key removed" -ForegroundColor Green
}

# Remove CLSID
Write-Host "Removing CLSID registry key..." -ForegroundColor Yellow
$clsidKey = "HKLM:\SOFTWARE\Classes\CLSID\$CLSID"
if (Test-Path $clsidKey) {
    Remove-Item -Path $clsidKey -Recurse -Force
    Write-Host "CLSID key removed" -ForegroundColor Green
}

# Remove DLL
Write-Host "Removing DLL file..." -ForegroundColor Yellow
$targetDll = "C:\Program Files\YCDesk\YCDeskCredentialProvider.dll"
if (Test-Path $targetDll) {
    Remove-Item -Path $targetDll -Force -ErrorAction SilentlyContinue
    Write-Host "DLL removed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Emergency uninstall complete!" -ForegroundColor Green
Write-Host "Please restart your computer immediately!" -ForegroundColor Red
Write-Host ""
if (-not $Silent) {
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

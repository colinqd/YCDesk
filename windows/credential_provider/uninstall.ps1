# YCDesk Credential Provider 卸载脚本
# 需要管理员权限运行

param(
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

# 检查管理员权限
function Test-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "错误: 此脚本需要管理员权限运行!" -ForegroundColor Red
    Write-Host "请右键点击此脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) {
        Write-Host "按任意键退出..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    exit 1
}

Write-Host "=== YCDesk Credential Provider 卸载 ===" -ForegroundColor Cyan

$CLSID = "{12345678-1234-1234-1234-567890ABCDEF}"

# 先尝试用 regsvr32 取消注册
$installDir = "C:\Program Files\YCDesk"
$targetDll = Join-Path $installDir "YCDeskCredentialProvider.dll"

if (Test-Path $targetDll) {
    Write-Host "正在取消注册 DLL..." -ForegroundColor Yellow
    try {
        Start-Process -FilePath "regsvr32.exe" -ArgumentList "/u /s `"$targetDll`"" -Wait -PassThru -ErrorAction SilentlyContinue | Out-Null
    } catch {
        Write-Host "跳过 regsvr32" -ForegroundColor Yellow
    }
}

# 删除注册表项
Write-Host "正在清理注册表..." -ForegroundColor Yellow

$providerKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\$CLSID"
if (Test-Path $providerKey) {
    Remove-Item -Path $providerKey -Recurse -Force
}

$clsidKey = "HKCR:\CLSID\$CLSID"
if (Test-Path $clsidKey) {
    Remove-Item -Path $clsidKey -Recurse -Force
}

# 保留 YCDesk 配置项（可选）
# $configKey = "HKLM:\SOFTWARE\YCDesk"
# if (Test-Path $configKey) {
#     Remove-Item -Path $configKey -Recurse -Force
# }

# 删除文件
if (Test-Path $installDir) {
    Write-Host "正在删除文件..." -ForegroundColor Yellow
    if (Test-Path $targetDll) {
        Remove-Item -Path $targetDll -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "卸载完成!" -ForegroundColor Green
Write-Host ""
if (-not $Silent) {
    Write-Host "建议重启电脑以完全清除所有残留" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

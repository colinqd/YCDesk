# YCDesk Credential Provider 构建脚本
# 用于编译和打包 Credential Provider DLL

param(
    [switch]$Clean,
    [switch]$Install,
    [string]$BuildType = "Release"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "YCDesk Credential Provider 构建" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 CMake
try {
    $cmakeVersion = cmake --version 2>&1 | Select-Object -First 1
    Write-Host "[信息] CMake: $cmakeVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未找到 CMake，请先安装 CMake" -ForegroundColor Red
    Write-Host "下载地址：https://cmake.org/download/" -ForegroundColor Yellow
    pause
    exit 1
}

# 检测生成器
$generator = "Visual Studio 17 2022"
try {
    $vsVersion = cmake -G $generator -N 2>&1 | Select-String "error"
    if (-not $vsVersion) {
        Write-Host "[信息] 使用生成器：$generator" -ForegroundColor Green
    }
} catch {
    Write-Host "[提示] Visual Studio 17 不可用，尝试查找最新版本..." -ForegroundColor Yellow
    # 尝试自动检测 Visual Studio
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsInstalls = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64
        if ($vsInstalls -match "Visual Studio (\d+)") {
            $vsYear = $matches[1]
            $generator = "Visual Studio $vsYear 2022"
            if ($vsYear -eq 17) { $generator = "Visual Studio 17 2022" }
            if ($vsYear -eq 16) { $generator = "Visual Studio 16 2019" }
            if ($vsYear -eq 18) { $generator = "Visual Studio 18 2026" }
            Write-Host "[信息] 使用生成器：$generator" -ForegroundColor Green
        }
    } else {
        Write-Host "[错误] 未找到 Visual Studio，请安装 Visual Studio 2019 或更新版本" -ForegroundColor Red
        Write-Host "需要安装：VC++ 2019 或 2022 v143 C++ x64/x86 生成工具" -ForegroundColor Yellow
        pause
        exit 1
    }
}

Write-Host ""

# 清理构建
if ($Clean) {
    Write-Host "[步骤 0/2] 清理构建..." -ForegroundColor Yellow
    if (Test-Path "build") {
        Remove-Item -Path "build" -Recurse -Force
        Write-Host "[信息] 已清理构建目录" -ForegroundColor Green
    }
    Write-Host ""
}

# 创建构建目录
if (-not (Test-Path "build")) {
    New-Item -ItemType Directory -Path "build" | Out-Null
    Write-Host "[信息] 创建构建目录" -ForegroundColor Green
}

# 配置项目
Write-Host "[步骤 1/2] 配置项目..." -ForegroundColor Cyan
try {
    cmake -G $generator -B build -S . -A x64
} catch {
    Write-Host "[错误] 配置失败" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[成功] 配置完成" -ForegroundColor Green
Write-Host ""

# 构建项目
Write-Host "[步骤 2/2] 构建项目..." -ForegroundColor Cyan
try {
    cmake --build build --config $BuildType
} catch {
    Write-Host "[错误] 构建失败" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[成功] 构建完成" -ForegroundColor Green
Write-Host ""

# 验证构建
Write-Host "[验证] 检查编译输出..." -ForegroundColor Cyan
$buildDllPath = "build\$BuildType\YCDeskCredentialProvider.dll"
$binDir = "..\bin"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}

if (Test-Path $buildDllPath) {
    $dllSize = (Get-Item $buildDllPath).Length
    Write-Host "[成功] 找到 DLL 文件 ($([math]::Round($dllSize/1KB, 2)) KB)" -ForegroundColor Green
    
    Copy-Item -Path $buildDllPath -Destination $binDir -Force
    Write-Host "[成功] 已复制到: $binDir" -ForegroundColor Green
} else {
    Write-Host "[警告] 未找到 DLL 文件，请检查构建日志" -ForegroundColor Yellow
    $debugPath = "build\Debug\YCDeskCredentialProvider.dll"
    if (Test-Path $debugPath) {
        Write-Host "[提示] 找到 Debug 版本，正在复制..." -ForegroundColor Yellow
        Copy-Item -Path $debugPath -Destination $binDir -Force
        Write-Host "[成功] 已复制到: $binDir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "构建完成!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "1. 以管理员身份运行 install.ps1 来安装 Credential Provider"
Write-Host "2. 重启电脑"
Write-Host "3. 在 YCDesk 设置页面中刷新 Credential Provider 状态"
Write-Host "4. 锁定屏幕 (Win+L) 测试"
Write-Host ""
Write-Host "或者，你可以在 YCDesk 设置页面中点击'安装'按钮进行安装"
Write-Host ""

if (-not $Install) {
    pause
}

# 如果指定了 Install，尝试运行安装脚本
if ($Install) {
    Write-Host "[自动安装] 正在启动安装脚本..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoProfile", "-File", "install.ps1" -Verb RunAs
}


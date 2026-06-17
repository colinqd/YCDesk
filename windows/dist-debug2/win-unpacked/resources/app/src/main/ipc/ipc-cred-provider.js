const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const CLSID = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
const INSTALL_DIR = 'C:\\Program Files\\YCDesk'
const TARGET_DLL = path.join(INSTALL_DIR, 'YCDeskCredentialProvider.dll')

function getSourceDllPath() {
  const projectRoot = path.resolve(__dirname, '../../..')
  const devPaths = [
    path.join(projectRoot, 'windows', 'credential_provider', 'YCDeskCredentialProvider.dll'),
    path.join(projectRoot, 'windows', 'bin', 'YCDeskCredentialProvider.dll')
  ]
  const packagedPath = path.join(process.resourcesPath, 'cred-provider', 'YCDeskCredentialProvider.dll')

  for (const p of [...devPaths, packagedPath]) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function buildInstallPsScript(sourceDllPath) {
  return `
$ErrorActionPreference = 'Stop'
$CLSID = '${CLSID}'
$installDir = '${INSTALL_DIR}'
$targetDll = '${TARGET_DLL}'
$sourceDll = '${sourceDllPath}'

Write-Host 'INSTALL:BEGIN'

if (!(Test-Path $installDir)) {
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}
Write-Host 'INSTALL:DIR_OK'

Copy-Item $sourceDll $targetDll -Force
Write-Host 'INSTALL:COPY_OK'

$providerKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\$CLSID"
if (!(Test-Path $providerKey)) { New-Item -Path $providerKey -Force | Out-Null }
Set-ItemProperty -Path $providerKey -Name '(default)' -Value 'YCDesk Credential Provider'

$clsidKey = "HKLM:\\SOFTWARE\\Classes\\CLSID\\$CLSID"
if (!(Test-Path $clsidKey)) { New-Item -Path $clsidKey -Force | Out-Null }
Set-ItemProperty -Path $clsidKey -Name '(default)' -Value 'YCDesk Credential Provider'

$inprocKey = "$clsidKey\\InprocServer32"
if (!(Test-Path $inprocKey)) { New-Item -Path $inprocKey -Force | Out-Null }
Set-ItemProperty -Path $inprocKey -Name '(default)' -Value $targetDll
Set-ItemProperty -Path $inprocKey -Name 'ThreadingModel' -Value 'Apartment'
Write-Host 'INSTALL:REG_OK'

$configKey = 'HKLM:\\SOFTWARE\\YCDesk'
if (!(Test-Path $configKey)) { New-Item -Path $configKey -Force | Out-Null }
Set-ItemProperty -Path $configKey -Name 'InstallPath' -Value $installDir

Write-Host 'INSTALL:SUCCESS'
`.trim()
}

function buildUninstallPsScript() {
  return `
$ErrorActionPreference = 'Stop'
$CLSID = '${CLSID}'
$installDir = '${INSTALL_DIR}'
$targetDll = '${TARGET_DLL}'

Write-Host 'UNINSTALL:BEGIN'

$providerKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\$CLSID"
if (Test-Path $providerKey) { Remove-Item -Path $providerKey -Force -Recurse }
Write-Host 'UNINSTALL:CP_REMOVED'

$clsidKey = "HKLM:\\SOFTWARE\\Classes\\CLSID\\$CLSID"
if (Test-Path $clsidKey) { Remove-Item -Path $clsidKey -Force -Recurse }
Write-Host 'UNINSTALL:CLSID_REMOVED'

$configKey = 'HKLM:\\SOFTWARE\\YCDesk'
if (Test-Path $configKey) { Remove-Item -Path $configKey -Force -Recurse }
Write-Host 'UNINSTALL:CONFIG_REMOVED'

if (Test-Path $targetDll) { Remove-Item -Path $targetDll -Force }
Write-Host 'UNINSTALL:DLL_REMOVED'

Write-Host 'UNINSTALL:SUCCESS'
`.trim()
}

function runAsAdmin(psScriptContent, logFn) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process')
    const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
    const psPath = path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const tmpDir = os.tmpdir()
    const scriptFile = path.join(tmpDir, `ycdesk_cred_${Date.now()}.ps1`)

    fs.writeFileSync(scriptFile, psScriptContent, 'utf8')
    logFn('info', `临时脚本: ${scriptFile}`)

    const proc = spawn(psPath, [
      '-NoProfile', '-NonInteractive',
      '-Command',
      `Start-Process -FilePath '${psPath}' -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','${scriptFile}' -Verb RunAs -Wait`
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString(); logFn('info', 'OUT: ' + data.toString().trim()) })
    proc.stderr.on('data', (data) => { stderr += data.toString(); logFn('warn', 'ERR: ' + data.toString().trim()) })

    proc.on('close', (code) => {
      logFn('info', `UAC 进程结束: code=${code}`)
      try { fs.unlinkSync(scriptFile) } catch (e) {}
      resolve({ code: code === 0 ? 0 : code, stdout: stdout.trim(), stderr: stderr.trim() })
    })

    proc.on('error', (err) => {
      logFn('error', 'UAC 进程错误: ' + err.message)
      try { fs.unlinkSync(scriptFile) } catch (e) {}
      resolve({ code: -1, stdout: '', stderr: err.message })
    })
  })
}

async function verifyCredProviderInstallation() {
  const result = {
    installed: false,
    dllExists: false,
    registered: false,
    clsidRegistered: false,
    details: []
  }

  try {
    result.dllExists = fs.existsSync(TARGET_DLL)
    result.details.push(result.dllExists ? 'DLL 文件存在' : 'DLL 文件不存在')

    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const execFileAsync = promisify(execFile)

    const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
    const regPath = path.join(windir, 'System32', 'reg.exe')

    try {
      await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${CLSID}`], { timeout: 5000 })
      result.registered = true
      result.details.push('Credential Provider 已注册')
    } catch (e) {
      result.details.push('Credential Provider 未注册')
    }

    try {
      await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Classes\\CLSID\\${CLSID}\\InprocServer32`], { timeout: 5000 })
      result.clsidRegistered = true
      result.details.push('CLSID 已注册')
    } catch (e) {
      result.details.push('CLSID 未注册')
    }

    result.installed = result.dllExists && result.registered && result.clsidRegistered
    return result
  } catch (e) {
    result.details.push('验证失败: ' + e.message)
    return result
  }
}

function register(safeHandler, logFn) {
  ipcMain.handle('credProvider:check', safeHandler(async () => {
    logFn('info', '检查 Credential Provider 状态')
    try {
      const { execFile } = require('child_process')
      const { promisify } = require('util')
      const execFileAsync = promisify(execFile)

      const result = {
        installed: false,
        dllExists: false,
        registered: false,
        details: []
      }

      if (fs.existsSync(TARGET_DLL)) {
        result.dllExists = true
        result.dllPath = TARGET_DLL
        const stat = fs.statSync(TARGET_DLL)
        result.dllSize = stat.size
        result.dllModified = stat.mtime
      }

      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const regPath = path.join(windir, 'System32', 'reg.exe')

      try {
        await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${CLSID}`], { timeout: 5000 })
        result.registered = true
        result.details.push('Credential Provider 已注册')
      } catch (e) {
        result.details.push('Credential Provider 未注册')
      }

      try {
        await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Classes\\CLSID\\${CLSID}\\InprocServer32`], { timeout: 5000 })
        result.clsidRegistered = true
        result.details.push('CLSID 已注册')
      } catch (e) {
        result.clsidRegistered = false
        result.details.push('CLSID 未注册')
      }

      result.installed = result.dllExists && result.registered && result.clsidRegistered
      return { success: true, ...result }
    } catch (e) {
      logFn('error', '检查 Credential Provider 状态失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'credProvider:check'))

  ipcMain.handle('credProvider:install', safeHandler(async (event) => {
    logFn('info', '开始安装 Credential Provider')
    const steps = []

    try {
      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }

      const sourceDll = getSourceDllPath()
      if (!sourceDll) {
        return { success: false, error: '找不到 YCDeskCredentialProvider.dll', steps }
      }

      steps.push({ step: 'check_dll', status: 'success', message: `找到 DLL: ${sourceDll}` })
      sendProgress('check_dll', 'success', `找到 DLL: ${sourceDll}`)
      logFn('info', `源 DLL 路径: ${sourceDll}`)

      sendProgress('install', 'running', '正在请求管理员权限安装...')
      const psScript = buildInstallPsScript(sourceDll)
      const result = await runAsAdmin(psScript, logFn)

      await new Promise(r => setTimeout(r, 2000))

      sendProgress('verify', 'running', '正在验证安装...')
      const verifyResult = await verifyCredProviderInstallation()

      steps.push({
        step: 'verify',
        status: verifyResult.installed ? 'success' : 'warning',
        message: verifyResult.details.join(', ')
      })
      sendProgress('verify', verifyResult.installed ? 'success' : 'warning', verifyResult.details.join(', '))
      logFn('info', '安装流程完成: ' + JSON.stringify(verifyResult))

      return {
        success: verifyResult.installed,
        message: verifyResult.installed ? '安装成功！请重启电脑' : '安装可能未成功，请查看控制台日志',
        steps,
        verification: verifyResult,
        needRestart: true
      }
    } catch (e) {
      logFn('error', '安装失败: ' + e.message)
      return { success: false, error: e.message, steps }
    }
  }, 'credProvider:install'))

  ipcMain.handle('credProvider:uninstall', safeHandler(async (event) => {
    logFn('info', '开始卸载 Credential Provider')
    const steps = []

    try {
      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }

      sendProgress('uninstall', 'running', '正在请求管理员权限卸载...')
      logFn('info', '执行 UAC 提升卸载脚本...')

      const psScript = buildUninstallPsScript()
      const result = await runAsAdmin(psScript, logFn)

      await new Promise(r => setTimeout(r, 1000))
      sendProgress('verify', 'running', '正在验证卸载...')
      const verifyResult = await verifyCredProviderInstallation()

      return {
        success: !verifyResult.installed,
        message: verifyResult.installed ? '卸载可能未完全成功，请检查' : '卸载完成',
        steps,
        verification: verifyResult,
        needRestart: true
      }
    } catch (e) {
      logFn('error', '卸载失败: ' + e.message)
      return { success: false, error: e.message, steps }
    }
  }, 'credProvider:uninstall'))
}

module.exports = { register }
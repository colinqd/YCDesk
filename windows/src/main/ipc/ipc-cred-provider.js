const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

async function verifyCredProviderInstallation(clsid, systemDllPath) {
  const result = {
    installed: false,
    dllExists: false,
    registered: false,
    clsidRegistered: false,
    details: []
  }

  try {
    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const execFileAsync = promisify(execFile)

    result.dllExists = fs.existsSync(systemDllPath)
    if (result.dllExists) {
      result.details.push('DLL 文件存在')
    } else {
      result.details.push('DLL 文件不存在')
    }

    const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
    const regPath = path.join(windir, 'System32', 'reg.exe')

    try {
      await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${clsid}`], { timeout: 5000 })
      result.registered = true
      result.details.push('Credential Provider 已注册')
    } catch (e) {
      result.details.push('Credential Provider 未注册')
    }

    try {
      await execFileAsync(regPath, ['query', `HKCR\\CLSID\\${clsid}\\InprocServer32`], { timeout: 5000 })
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

async function verifyCredProviderState() {
  const clsid = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
  const possiblePaths = [
    'C:\\Program Files\\YCDesk\\YCDeskCredentialProvider.dll',
    'C:\\Windows\\System32\\YCDeskCredentialProvider.dll'
  ]

  for (const dllPath of possiblePaths) {
    if (fs.existsSync(dllPath)) {
      return await verifyCredProviderInstallation(clsid, dllPath)
    }
  }

  return await verifyCredProviderInstallation(clsid, possiblePaths[0])
}

function register(safeHandler, logFn) {
  ipcMain.handle('credProvider:check', safeHandler(async () => {
    logFn('info', '检查 Credential Provider 状态')
    try {
      const { execFile } = require('child_process')
      const { promisify } = require('util')
      const execFileAsync = promisify(execFile)

      const clsid = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
      const systemDllPath1 = 'C:\\Windows\\System32\\YCDeskCredentialProvider.dll'
      const systemDllPath2 = 'C:\\Program Files\\YCDesk\\YCDeskCredentialProvider.dll'
      const result = {
        installed: false,
        dllExists: false,
        registered: false,
        details: []
      }

      if (fs.existsSync(systemDllPath1)) {
        result.dllExists = true
        result.dllPath = systemDllPath1
        const stat = fs.statSync(systemDllPath1)
        result.dllSize = stat.size
        result.dllModified = stat.mtime
      } else if (fs.existsSync(systemDllPath2)) {
        result.dllExists = true
        result.dllPath = systemDllPath2
        const stat = fs.statSync(systemDllPath2)
        result.dllSize = stat.size
        result.dllModified = stat.mtime
      }

      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const regPath = path.join(windir, 'System32', 'reg.exe')
      const keyPath = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${clsid}`

      try {
        await execFileAsync(regPath, ['query', keyPath], { timeout: 5000 })
        result.registered = true
        result.details.push('Credential Provider 已注册')
      } catch (e) {
        result.details.push('Credential Provider 未注册')
      }

      const clsidKey = `HKCR\\CLSID\\${clsid}\\InprocServer32`
      try {
        await execFileAsync(regPath, ['query', clsidKey], { timeout: 5000 })
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
      const { exec, spawn } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)

      const projectRoot = path.resolve(__dirname, '../../..')
      const buildDllPath1 = path.join(projectRoot, 'windows', 'credential_provider', 'YCDeskCredentialProvider.dll')
      const buildDllPath2 = path.join(projectRoot, 'windows', 'bin', 'YCDeskCredentialProvider.dll')

      let buildDllPath = ''
      if (fs.existsSync(buildDllPath1)) buildDllPath = buildDllPath1
      else if (fs.existsSync(buildDllPath2)) buildDllPath = buildDllPath2

      if (!buildDllPath) {
        return { success: false, error: '找不到 YCDeskCredentialProvider.dll', steps }
      }

      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }

      steps.push({ step: 'check_dll', status: 'success', message: '找到 DLL 文件' })
      sendProgress('check_dll', 'success', '找到 DLL 文件')
      sendProgress('uac_install', 'running', '正在请求管理员权限...')

      const installScriptPath = path.join(projectRoot, 'windows', 'credential_provider', 'install.ps1')
      logFn('info', '准备启动 UAC: ' + installScriptPath)

      const tempBat = path.join(projectRoot, 'windows', 'install_with_uac.bat')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const system32Path = path.join(windir, 'System32')
      const powershellPath = path.join(system32Path, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const netPath = path.join(system32Path, 'net.exe')
      const timeoutPath = path.join(windir, 'System32', 'timeout.exe')

      const batLines = [
        '@echo off',
        ':: Check admin rights',
        `"${netPath}" session >nul 2>&1`,
        'if %errorLevel% == 0 (',
        '    echo Already admin, running script...',
        `    "${powershellPath}" -NoProfile -ExecutionPolicy Bypass -File "${installScriptPath}" -Silent`,
        '    echo INSTALL_DONE',
        `    "${timeoutPath}" /t 3`,
        ') else (',
        '    echo Requesting admin access...',
        `    "${powershellPath}" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~f0' -Verb RunAs"`,
        '    exit /b',
        ')'
      ]

      const batContent = batLines.join('\n') + '\n'
      fs.writeFileSync(tempBat, batContent, 'ascii')
      logFn('info', '执行批处理文件弹出 UAC')

      await new Promise((resolve) => {
        const cmdPath = path.join(windir, 'System32', 'cmd.exe')
        exec(`"${cmdPath}" /c start "" "${tempBat}"`, {
          windowsHide: false,
          timeout: 120000
        }, (error, stdout, stderr) => {
          if (error) {
            logFn('error', '启动批处理失败: ' + error.message)
            resolve({ code: -1, error: error.message })
          } else {
            logFn('info', '批处理已启动')
            resolve({ code: 0, stdout, stderr })
          }
        })
      })

      try { fs.unlinkSync(tempBat) } catch (e) {}
      await new Promise(r => setTimeout(r, 3000))

      sendProgress('verify', 'running', '正在验证安装...')
      const verifyResult = await verifyCredProviderState()

      steps.push({
        step: 'verify',
        status: verifyResult.installed ? 'success' : 'warning',
        message: verifyResult.details.join(', ')
      })
      sendProgress('verify', verifyResult.installed ? 'success' : 'warning', verifyResult.details.join(', '))
      logFn('info', '安装流程完成，验证结果: ' + verifyResult.installed)

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
      const { spawn } = require('child_process')

      const projectRoot = path.resolve(__dirname, '../../..')
      const uninstallScriptPath = path.join(projectRoot, 'windows', 'credential_provider', 'uninstall.ps1')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const system32Path = path.join(windir, 'System32')
      const psPath = path.join(system32Path, 'WindowsPowerShell', 'v1.0', 'powershell.exe')

      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }

      sendProgress('uac_uninstall', 'running', '正在请求管理员权限...')

      const psCommand = `
$ErrorActionPreference = 'Stop'
try {
  $process = Start-Process -FilePath '${psPath}' -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','${uninstallScriptPath}','-Silent' -Verb RunAs -PassThru -Wait
  Write-Host "UAC_UNINSTALL_SUCCESS"
  exit 0
} catch {
  Write-Host "UAC_DENIED_OR_FAILED"
  exit 1
}
`
      logFn('info', '执行卸载 PowerShell 命令...')

      const result = await new Promise((resolve) => {
        const proc = spawn(psPath, [
          '-NoProfile', '-NonInteractive', '-Command', psCommand
        ], {
          windowsHide: false,
          timeout: 60000
        })

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
          stdout += data.toString()
          logFn('info', '卸载输出: ' + data.toString().trim())
        })

        proc.stderr.on('data', (data) => {
          stderr += data.toString()
          logFn('warn', '卸载警告: ' + data.toString().trim())
        })

        proc.on('close', (code) => {
          logFn('info', `卸载进程结束，代码: ${code}`)
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
        })

        proc.on('error', (err) => {
          logFn('error', '卸载进程错误: ' + err.message)
          resolve({ code: -1, stdout: '', stderr: err.message })
        })
      })

      logFn('info', `UAC卸载结果: code=${result.code}, stdout=${result.stdout}, stderr=${result.stderr}`)

      if (result.stdout.includes('UAC_UNINSTALL_SUCCESS')) {
        steps.push({ step: 'uac_uninstall', status: 'success', message: '卸载成功！' })
        sendProgress('uac_uninstall', 'success', '卸载成功！')
      } else if (result.stdout.includes('UAC_DENIED') || result.code === 1) {
        steps.push({ step: 'uac_uninstall', status: 'error', message: '用户取消了 UAC 请求或卸载失败' })
        sendProgress('uac_uninstall', 'error', '用户取消了 UAC 请求或卸载失败')
        return { success: false, error: '用户取消了 UAC 请求或卸载失败', steps }
      } else {
        steps.push({ step: 'uac_uninstall', status: 'warning', message: 'UAC 请求完成，需要验证' })
        sendProgress('uac_uninstall', 'warning', 'UAC 请求完成，需要验证')
      }

      await new Promise(r => setTimeout(r, 1000))
      const verifyResult = await verifyCredProviderState()

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
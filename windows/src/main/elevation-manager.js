/**
 * 提权与 Windows Service 管理器
 *
 * 设计要点（v0.3）：
 *   - 服务通过 node-windows 的 Service 类注册
 *   - 由 windows/service/elevate-cli.js 接受 install/uninstall/start/stop/status 命令
 *   - 本管理器负责用 UAC 提权 spawn 该 CLI
 *   - 提权方式：PowerShell Start-Process -Verb RunAs（比 mshta/VBScript 更稳定可靠）
 *   - dev 模式：service/ 在项目内
 *   - 打包后：service-app/ 在 process.resourcesPath 下
 *
 * 客户端与服务打包在同一个安装包内：
 *   electron-builder extraResources 把 service/ 复制到 resources/service-app/
 *   NSIS hook 安装 Credential Provider DLL
 *   运行时通过本管理器调用 service-app/elevate-cli.js
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

class ElevationManager {
  constructor(options = {}) {
    this._logger = options.logger || { log: () => {}, error: () => {} }
    this._serviceName = 'ycdeskservice' // SCM 服务名（不能含 .exe），与 elevate-cli.js SVC_ID 一致
    this._serviceDisplayName = 'YCDesk Remote Desktop Service'
    this._serviceDescription = 'YCDesk 远程桌面后台服务，提供锁屏画面捕获和系统级输入注入功能'
    // 提权操作串行队列（防止并发 _runElevated 冲突）
    this._elevationQueue = Promise.resolve()
  }

  log(msg) { this._logger.log(`[ElevationManager] ${msg}`) }

  // ==================== 路径解析 ====================

  /**
   * 获取服务子项目根目录
   * - dev:        <repo>/windows/service/
   * - 打包后:    <resourcesPath>/service-app/
   */
  _getServiceAppPath() {
    const candidates = [
      // 打包后: resources/service-app/
      process.resourcesPath ? path.join(process.resourcesPath, 'service-app') : null,
      // 兜底: app 根 + service-app
      process.resourcesPath ? path.join(path.dirname(process.resourcesPath || ''), 'service-app') : null,
      // dev: src/main/elevation-manager.js -> ../../service/
      path.resolve(__dirname, '../../service'),
      // 兜底: app.asar.unpacked/service-app
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'service-app') : null
    ].filter(Boolean)

    for (const p of candidates) {
      try {
        if (fs.existsSync(path.join(p, 'service-daemon.js'))) {
          return p
        }
      } catch (e) {}
    }
    // 返回 dev 路径作为兜底
    return path.resolve(__dirname, '../../service')
  }

  /**
   * 获取 elevate-cli.js 的绝对路径
   */
  _getServiceCliPath() {
    return path.join(this._getServiceAppPath(), 'elevate-cli.js')
  }

  /**
   * 查找系统 node.exe
   * 优先级: 环境变量 > process.execPath (dev 模式就是系统 node) > where node > 常见安装路径 > PATH
   *
   * 返回 { ok, path, hint }：ok=false 时 hint 给出友好提示
   */
  _findNodeExe() {
    // 1. 环境变量
    if (process.env.YCDESK_NODE_EXE && fs.existsSync(process.env.YCDESK_NODE_EXE)) {
      return { ok: true, path: process.env.YCDESK_NODE_EXE, hint: null }
    }

    // 2. dev 模式 process.execPath 就是 node.exe
    if (process.execPath && process.execPath.toLowerCase().endsWith('node.exe') && fs.existsSync(process.execPath)) {
      return { ok: true, path: process.execPath, hint: null }
    }

    // 3. where node
    try {
      const out = execSync('where node', { encoding: 'utf8', timeout: 5000, windowsHide: true })
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      for (const line of lines) {
        if (line.toLowerCase().endsWith('node.exe') && fs.existsSync(line)) {
          return { ok: true, path: line, hint: null }
        }
      }
    } catch (e) {}

    // 4. 常见安装路径
    const common = [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')
    ]
    for (const p of common) {
      try { if (fs.existsSync(p)) return { ok: true, path: p, hint: null } } catch (e) {}
    }

    // 5. 兜底：检测 PATH 里是否有 node
    const pathEnv = process.env.PATH || ''
    const pathDirs = pathEnv.split(path.delimiter).filter(Boolean)
    for (const dir of pathDirs) {
      const candidate = path.join(dir, 'node.exe')
      try { if (fs.existsSync(candidate)) return { ok: true, path: candidate, hint: null } } catch (e) {}
    }

    // 全部失败
    return {
      ok: false,
      path: null,
      hint: '未检测到系统 node.exe。Windows Service 运行需要 Node.js 18+。\n' +
            '请从 https://nodejs.org/ 下载安装 LTS 版本（勾选 "Add to PATH"），\n' +
            '或在环境变量 YCDESK_NODE_EXE 中手动指定 node.exe 绝对路径后重启应用。'
    }
  }

  // ==================== 权限检查 ====================

  isElevated() {
    try {
      execSync('net session', { stdio: 'ignore' })
      return true
    } catch (e) {
      return false
    }
  }

  // ==================== 服务状态查询 ====================

  async queryServiceStatus() {
    try {
      const output = execSync(`sc query ${this._serviceName}`, { encoding: 'utf8', timeout: 5000 })

      if (output.includes('RUNNING')) return { installed: true, running: true }
      if (output.includes('STOPPED')) return { installed: true, running: false }
      if (output.includes('STOP_PENDING')) return { installed: true, running: false, pending: 'stop' }
      if (output.includes('START_PENDING')) return { installed: true, running: false, pending: 'start' }

      return { installed: true, running: false }
    } catch (e) {
      if (e.message && e.message.includes('1060')) {
        return { installed: false, running: false }
      }
      return { installed: false, running: false, error: e.message }
    }
  }

  // ==================== 安装/卸载/启停 ====================

  async installService() {
    const svcAppPath = this._getServiceAppPath()
    const cliPath = this._getServiceCliPath()
    this.log('installService called')
    this.log('  serviceAppPath: ' + svcAppPath)
    this.log('  cliPath: ' + cliPath)

    if (!fs.existsSync(cliPath)) {
      this.log('CLI not found at: ' + cliPath)
      return {
        success: false,
        error: '服务 CLI 未找到: ' + cliPath + '。请确认完整安装包未被裁剪。'
      }
    }

    const nodeResult = this._findNodeExe()
    this.log('nodeResult: ' + JSON.stringify(nodeResult))
    if (!nodeResult.ok) {
      return { success: false, error: nodeResult.hint }
    }

    const cmd = `"${nodeResult.path}" "${cliPath}" install`
    return this._runElevated(cmd, '安装服务')
  }

  async uninstallService() {
    const cliPath = this._getServiceCliPath()
    if (!fs.existsSync(cliPath)) {
      return { success: false, error: '服务 CLI 未找到: ' + cliPath }
    }

    const nodeResult = this._findNodeExe()
    if (!nodeResult.ok) {
      this.log('未找到 node.exe，回退到 sc delete 兜底')
      return this._runElevated(`sc delete ${this._serviceName}`, '卸载服务')
    }

    const cmd = `"${nodeResult.path}" "${cliPath}" uninstall`
    return this._runElevated(cmd, '卸载服务')
  }

  async startService() {
    const cliPath = this._getServiceCliPath()
    if (fs.existsSync(cliPath)) {
      const nodeResult = this._findNodeExe()
      if (nodeResult.ok) {
        this.log('Starting service via elevate-cli')
        const cmd = `"${nodeResult.path}" "${cliPath}" start`
        return this._runElevated(cmd, '启动服务')
      }
    }
    // 兜底：sc start
    return this._runElevated(`sc start ${this._serviceName}`, '启动服务')
  }

  async stopService() {
    const cliPath = this._getServiceCliPath()
    if (fs.existsSync(cliPath)) {
      const nodeResult = this._findNodeExe()
      if (nodeResult.ok) {
        this.log('Stopping service via elevate-cli')
        const cmd = `"${nodeResult.path}" "${cliPath}" stop`
        return this._runElevated(cmd, '停止服务')
      }
    }
    return this._runElevated(`sc stop ${this._serviceName}`, '停止服务')
  }

  // ==================== 提权执行（核心）====================

  /**
   * 串行化提权执行入口（防止并发 _runElevated 冲突）
   * 所有提权操作通过 FIFO 队列顺序执行
   */
  _runElevated(cmd, friendlyName) {
    const prev = this._elevationQueue
    this._elevationQueue = prev.then(() => {
      return this._runElevatedInternal(cmd, friendlyName)
    }).catch(() => {})
    return this._elevationQueue
  }

  /**
   * 用 PowerShell Start-Process -Verb RunAs 以管理员身份执行命令（内部实现）
   *
   * 流程：
   *   1. 把命令写入 .bat
   *   2. 用 PowerShell Start-Process cmd.exe /c bat -Verb RunAs -Wait 提权执行
   *   3. 读取 .bat 的输出文件获取结果
   *
   * 为什么用 PowerShell 而不是 VBScript/mshta：
   *   - Start-Process -Verb RunAs 是 Windows 标准 UAC 提权 API
   *   - -Wait 参数能可靠阻塞直到提权进程退出
   *   - 无需 VBScript 引号转义，更稳定
   */
  _runElevatedInternal(cmd, friendlyName) {
    this.log(`_runElevated: ${friendlyName}, cmd=${cmd}`)

    // 使用 %LOCALAPPDATA%\YCDesk\elevate-tmp\ 而非 os.tmpdir()
    // 因为 UAC 提权后 %TEMP% 可能值不同，导致输出文件跨上下文读不到
    const elevateDir = path.join(
      process.env.LOCALAPPDATA || os.homedir(),
      'YCDesk', 'elevate-tmp'
    )
    try { fs.mkdirSync(elevateDir, { recursive: true }) } catch (e) {}

    const ts = Date.now()
    const batFile = path.join(elevateDir, `ycdesk_${ts}.bat`)
    const outFile = path.join(elevateDir, `ycdesk_${ts}.out.txt`)
    const errFile = path.join(elevateDir, `ycdesk_${ts}.err.txt`)
    const exitFile = path.join(elevateDir, `ycdesk_${ts}.exit.txt`)

    // .bat：写入输出文件 + 写入独立退出码文件
    const batContent =
      `@echo off\r\n` +
      `setlocal\r\n` +
      `chcp 65001 >nul\r\n` +
      `${cmd} > "${outFile}" 2> "${errFile}"\r\n` +
      `echo %ERRORLEVEL% > "${exitFile}"\r\n` +
      `endlocal\r\n`

    try {
      fs.writeFileSync(batFile, batContent, 'utf8')
    } catch (e) {
      return { success: false, error: '无法创建执行脚本: ' + e.message }
    }

    // PowerShell：Start-Process -Verb RunAs -Wait -PassThru 获取退出码
    // 使用 -Command 内联脚本，避免临时 .ps1 文件
    // 关键：使用 cmd /c "call" 确保 .bat 退出码被正确传递
    // -WindowStyle Hidden 避免 PowerShell 自身窗口闪烁
    const psCmd = `try { $p = Start-Process cmd.exe -ArgumentList '/c call "${batFile}"' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; if ($p -eq $null) { exit 999 } else { exit $p.ExitCode } } catch { exit 998 }`

    this.log(`执行 PowerShell 提权: Start-Process cmd.exe ... -Verb RunAs -Wait`)

    // 从 PowerShell 退出码反推 CLI 退出码
    let psExitCode = 0
    try {
      // 用 Start-Process 启动 powershell，确保 PowerShell 进程自身可见
      // 等待最多 120 秒（UAC 等待 + 执行时间）
      const psOutput = execSync(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command "${psCmd.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8', timeout: 120000, windowsHide: false }
      )
      psExitCode = 0
    } catch (e) {
      psExitCode = (e && typeof e.status === 'number') ? e.status : -1
    }

    // 999 = UAC 被拒或超时；998 = PowerShell 自身错误
    if (psExitCode === 999) {
      this._cleanupTmpFiles([batFile, outFile, errFile, exitFile])
      return { success: false, error: `${friendlyName}失败：UAC 提权被取消，请在弹窗中点击"是"以允许管理员权限` }
    }
    if (psExitCode === 998) {
      this._cleanupTmpFiles([batFile, outFile, errFile, exitFile])
      return { success: false, error: `${friendlyName}失败：UAC 提权过程异常（可能被防病毒软件拦截），请以管理员身份手动运行 YCDesk 后重试` }
    }

    // 从退出码文件 + 输出文件读取
    const result = this._readElevatedOutput(outFile, errFile, exitFile)
    this._cleanupTmpFiles([batFile, outFile, errFile, exitFile])

    // 当 exitCode 文件不存在时，用 PowerShell 退出码兜底
    if (result.exitCode === -1 && psExitCode >= 0 && psExitCode <= 255) {
      result.exitCode = psExitCode
      result.success = psExitCode === 0
    }

    this.log(`${friendlyName} 结果: exit=${result.exitCode}, psExit=${psExitCode}, stdout=${(result.output || '').substring(0, 120)}`)

    if (!result.success) {
      const stderr = result.stderr || ''
      const stdout = result.output || ''
      if (stderr.includes('1060') || stdout.includes('1060')) {
        return { success: true, output: '服务未安装' }
      }
      if (stderr.includes('1056') || stdout.includes('1056')) {
        return { success: true, output: '服务已在运行中' }
      }
      if (stderr.includes('1062') || stdout.includes('1062')) {
        return { success: true, output: '服务未在运行' }
      }
      const errMsg = stderr || stdout || `退出码 ${result.exitCode}`
      return { success: false, error: `${friendlyName}失败: ${errMsg}` }
    }

    const stdout = result.output || ''
    if (stdout.includes('INVALID')) {
      return { success: false, error: '服务安装无效，请重装后重试' }
    }
    if (stdout.includes('ALREADY')) {
      return { success: true, output: '操作已完成（目标状态已满足）' }
    }
    return { success: true, output: stdout || '操作成功' }
  }

  /**
   * 从 elevate-tmp 目录读取提权执行后的输出
   */
  _readElevatedOutput(outFile, errFile, exitFile) {
    let stdout = ''
    let stderr = ''
    let exitCode = -1

    try {
      if (fs.existsSync(exitFile)) {
        exitCode = parseInt(fs.readFileSync(exitFile, 'utf8').trim(), 10)
        if (isNaN(exitCode)) exitCode = -1
      }
    } catch (e) {}

    try {
      if (fs.existsSync(outFile)) {
        stdout = fs.readFileSync(outFile, 'utf8').trim()
      }
    } catch (e) {}

    try {
      if (fs.existsSync(errFile)) {
        stderr = fs.readFileSync(errFile, 'utf8').trim()
      }
    } catch (e) {}

    return { success: exitCode === 0, output: stdout, stderr, exitCode }
  }

  /**
   * mshta VBScript 兜底（推荐的 PowerShell 不可用时）
   */
  _tryMshtaFallback(batFile, outFile, errFile) {
    try {
      if (!fs.existsSync(batFile)) return null

      const vbsDir = path.join(
        process.env.LOCALAPPDATA || os.homedir(),
        'YCDesk', 'elevate-tmp'
      )
      try { fs.mkdirSync(vbsDir, { recursive: true }) } catch (e) {}
      const vbsFile = path.join(vbsDir, `ycdesk_fb_${Date.now()}.vbs`)
      const flagFile = path.join(vbsDir, `ycdesk_fb_${Date.now()}.done`)

      const batContent = fs.readFileSync(batFile, 'utf8')
      const newBatContent = batContent.replace(`endlocal\r\n`, `copy /b NUL "${flagFile}" >NUL 2>&1\r\nendlocal\r\n`)
      fs.writeFileSync(batFile, newBatContent, 'utf8')

      const vbsContent =
        `Dim shell, fso, timeout\r\n` +
        `Set shell = CreateObject("Shell.Application")\r\n` +
        `shell.ShellExecute "cmd.exe", "/c ""${batFile}""", "", "runas", 0\r\n` +
        `WScript.Sleep 500\r\n` +
        `Set fso = CreateObject("Scripting.FileSystemObject")\r\n` +
        `timeout = 0\r\n` +
        `Do While Not fso.FileExists("${flagFile}") And timeout < 90\r\n` +
        `  WScript.Sleep 1000\r\n` +
        `  timeout = timeout + 1\r\n` +
        `Loop\r\n`

      fs.writeFileSync(vbsFile, vbsContent, 'utf8')

      execSync(`mshta "${vbsFile}"`, {
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true
      })

      this._cleanupTmpFiles([vbsFile, flagFile])
      const exitFile = path.join(vbsDir, path.basename(outFile).replace('.out.txt', '.exit.txt'))
      return this._readElevatedOutput(outFile, errFile, exitFile)
    } catch (e) {
      this.log('mshta 兜底也失败: ' + e.message)
      return null
    }
  }

  /**
   * 清理临时文件
   */
  _cleanupTmpFiles(files) {
    files.forEach(f => {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f) } catch (e) {}
    })
  }

  /**
   * 旧接口保留兼容
   */
  _getServiceExePath() {
    return null
  }
}

// 导出单例实例
const elevationManager = new ElevationManager()

module.exports = elevationManager
module.exports.ElevationManager = ElevationManager
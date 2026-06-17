#!/usr/bin/env node
/**
 * YCDesk 服务管理 CLI（需以管理员权限运行）
 *
 * 由主程序通过 UAC 提权调用，负责：
 *   - install   通过 node-windows 注册 Windows Service
 *   - uninstall 卸载服务
 *   - start     启动服务
 *   - stop      停止服务
 *   - status    查询服务状态
 *
 * 用法:
 *   node elevate-cli.js <action>
 *
 * 环境变量:
 *   YCDESK_NODE_EXE   强制指定 node.exe 路径（可选）
 *
 * 退出码:
 *   0  成功
 *   1  失败
 *   2  已经处于目标状态
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

// ===== 配置 =====
const SVC_NAME = 'YCDeskService'
const SVC_DISPLAY = 'YCDesk Remote Desktop Service'
const SVC_DESC = 'YCDesk 远程桌面后台服务，提供锁屏画面捕获和系统级输入注入功能'
// node-windows 以 id 作为 winsw 服务名，必须与 elevation-manager.js 中 _serviceName 一致
const SVC_ID = 'ycdeskservice.exe'

// 服务子项目根目录
const SERVICE_APP_DIR = path.resolve(__dirname)
const SCRIPT_PATH = path.join(SERVICE_APP_DIR, 'service-daemon.js')

// node.exe 路径：优先使用环境变量，其次 process.execPath（dev 模式下就是系统 node）
function resolveNodeExe() {
  if (process.env.YCDESK_NODE_EXE && fs.existsSync(process.env.YCDESK_NODE_EXE)) {
    return process.env.YCDESK_NODE_EXE
  }
  // dev 模式下 process.execPath 就是 node.exe
  if (process.execPath && process.execPath.toLowerCase().endsWith('node.exe')) {
    return process.execPath
  }
  return 'node.exe' // 回退到 PATH 查找
}

const NODE_EXE = resolveNodeExe()

// ===== 日志（同时输出到 stdout 与日志文件）=====
const LOG_DIR = path.join(process.env.TEMP || process.env.TMP || '.', 'ycdesk')
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch (e) {}
const LOG_FILE = path.join(LOG_DIR, 'service-elevate.log')

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch (e) {}
  // 输出到 stdout
  if (level === 'ERROR') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

function exitWith(code, msg) {
  if (msg) log(code === 0 ? 'INFO' : 'ERROR', msg)
  // 给事件循环一点时间让 stdout flush
  setTimeout(() => process.exit(code), 50)
}

// ===== 检查前置条件 =====
function checkPrerequisites() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    log('ERROR', '服务脚本未找到: ' + SCRIPT_PATH)
    return false
  }
  if (!fs.existsSync(path.join(SERVICE_APP_DIR, 'node_modules', 'node-windows'))) {
    log('ERROR', 'node-windows 未安装: ' + path.join(SERVICE_APP_DIR, 'node_modules', 'node-windows'))
    return false
  }
  return true
}

function getService() {
  const Service = require('node-windows').Service
  return new Service({
    name: SVC_NAME,
    id: SVC_ID,
    description: SVC_DESC,
    script: SCRIPT_PATH,
    execPath: NODE_EXE,
    workingdirectory: SERVICE_APP_DIR,
    nodeOptions: ['--harmony', '--max_old_space_size=128'],
    env: [
      { name: 'NODE_ENV', value: 'production' }
    ]
  })
}

// ===== 动作 =====
function install() {
  if (!checkPrerequisites()) return exitWith(1)

  const svc = getService()
  svc.on('install', () => {
    log('INFO', '服务安装成功 (winsw 完成注册)')
    // 等待 SCM 完全注册服务后再配置
    setTimeout(() => {
      try {
        execSync(`sc config ${SVC_ID} start= auto`, { stdio: 'pipe', timeout: 10000 })
        log('INFO', '已设置 start= auto')
      } catch (e) {
        log('WARN', '设置 start= auto 失败: ' + (e.stderr || e.message || '').trim())
      }
      try {
        execSync(`sc failure ${SVC_ID} reset= 86400 actions= restart/5000/restart/10000/restart/30000`, { stdio: 'pipe', timeout: 10000 })
        log('INFO', '已设置失败恢复策略')
      } catch (e) {
        log('WARN', '设置失败恢复策略失败: ' + (e.stderr || e.message || '').trim())
      }
      exitWith(0, 'OK')
    }, 1000)
  })
  svc.on('alreadyinstalled', () => {
    log('INFO', '服务已经安装')
    // 即使已存在也确保 auto-start
    try {
      execSync(`sc config ${SVC_ID} start= auto`, { stdio: 'pipe' })
    } catch (e) {}
    exitWith(0, 'ALREADY')
  })
  svc.on('invalidinstallation', () => {
    log('ERROR', '服务安装无效（缺少必要文件）')
    exitWith(1, 'INVALID')
  })
  svc.on('error', (err) => {
    log('ERROR', '安装失败: ' + (err && err.message ? err.message : err))
    exitWith(1, 'ERROR')
  })
  log('INFO', '开始安装服务...')
  log('INFO', '  script: ' + SCRIPT_PATH)
  log('INFO', '  execPath: ' + NODE_EXE)
  log('INFO', '  workingdirectory: ' + SERVICE_APP_DIR)
  try {
    svc.install()
  } catch (e) {
    log('ERROR', 'svc.install 抛出异常: ' + e.message)
    exitWith(1, 'ERROR')
  }
}

function uninstall() {
  log('INFO', `开始卸载服务 (sc delete ${SVC_ID})...`)
  // 1. 先停止服务（如果正在运行）
  try {
    execSync(`net stop "${SVC_ID}" /y`, { stdio: 'pipe', timeout: 15000 })
    log('INFO', '已停止运行中的服务')
  } catch (e) {
    // 1062 = not running, 忽略
    if (!e || e.status !== 1062) {
      log('WARN', '停止服务时出错（继续卸载）: ' + safeError(e))
    }
  }

  // 2. 删除服务
  try {
    execSync(`sc delete "${SVC_ID}"`, { stdio: 'pipe', timeout: 10000 })
    log('INFO', '服务已从 SCM 删除')
  } catch (e) {
    const msg = safeError(e)
    if (msg.includes('1060')) {
      log('INFO', '服务未安装（SCM 中不存在）')
    } else {
      log('ERROR', 'sc delete 失败: ' + msg)
      exitWith(1, 'ERROR')
    }
  }

  // 3. 清理残留
  try { fs.rmSync(path.join(SERVICE_APP_DIR, 'daemon'), { recursive: true, force: true }) } catch (e) {}

  log('INFO', '卸载完成')
  exitWith(0, 'OK')
}

/**
 * 清理 node-windows install 产生的 daemon/ 中间目录
 * 包含: <id>.exe (winsw 副本) + <id>.exe.config + <id>.xml
 */
function cleanupDaemonDir() {
  const daemonDir = path.join(SERVICE_APP_DIR, 'daemon')
  if (!fs.existsSync(daemonDir)) {
    log('INFO', 'daemon 目录不存在，无需清理')
    return
  }
  try {
    fs.rmSync(daemonDir, { recursive: true, force: true })
    log('INFO', '已清理 daemon 目录: ' + daemonDir)
  } catch (e) {
    log('WARN', '清理 daemon 目录失败: ' + e.message)
  }
}

function start() {
  log('INFO', `开始启动服务 (net start ${SVC_ID})...`)
  try {
    execSync(`net start "${SVC_ID}"`, { stdio: 'pipe', timeout: 30000 })
    log('INFO', '服务启动成功')
    exitWith(0, 'OK')
  } catch (e) {
    // net start 失败时，用 sc query 验证实际状态
    // 不同 Windows 版本的错误码可能不同，sc query 更可靠
    try {
      const qry = execSync(`sc query ${SVC_ID}`, { encoding: 'utf8', timeout: 5000 })
      if (qry.includes('RUNNING') || qry.includes('START_PENDING')) {
        log('INFO', '服务已在运行中')
        return exitWith(0, 'OK')
      }
    } catch (q) {}
    log('ERROR', '启动失败: ' + safeError(e))
    exitWith(1, 'ERROR')
  }
}

function stop() {
  log('INFO', `开始停止服务 (net stop ${SVC_ID})...`)
  try {
    execSync(`net stop "${SVC_ID}"`, { stdio: 'pipe', timeout: 30000 })
    log('INFO', '服务停止成功')
    exitWith(0, 'OK')
  } catch (e) {
    // net stop 失败时，用 sc query 验证实际状态
    try {
      const qry = execSync(`sc query ${SVC_ID}`, { encoding: 'utf8', timeout: 5000 })
      if (qry.includes('STOPPED') || qry.includes('STOP_PENDING') || qry.includes('1060')) {
        log('INFO', '服务未在运行')
        return exitWith(0, 'OK')
      }
    } catch (q) {}
    log('ERROR', '停止失败: ' + safeError(e))
    exitWith(1, 'ERROR')
  }
}

function status() {
  try {
    const out = execSync(`sc query ${SVC_ID}`, { encoding: 'utf8', timeout: 5000 })
    if (out.includes('RUNNING')) {
      process.stdout.write('RUNNING\n')
      return exitWith(0, 'OK')
    }
    if (out.includes('STOPPED')) {
      process.stdout.write('STOPPED\n')
      return exitWith(0, 'OK')
    }
    process.stdout.write('UNKNOWN\n')
    return exitWith(0, 'OK')
  } catch (e) {
    if (e.message && e.message.includes('1060')) {
      process.stdout.write('NOT_INSTALLED\n')
      return exitWith(0, 'OK')
    }
    log('ERROR', '查询失败: ' + e.message)
    exitWith(1, 'ERROR')
  }
}

function safeError(e) { return ((e && (typeof e.stderr === 'string' ? e.stderr : (e.stderr || '').toString())) || (e && e.message) || '').trim() }
const action = (process.argv[2] || '').toLowerCase()
log('INFO', `elevate-cli 启动, action=${action}, pid=${process.pid}, execPath=${process.execPath}`)

switch (action) {
  case 'install': install(); break
  case 'uninstall': uninstall(); break
  case 'start': start(); break
  case 'stop': stop(); break
  case 'status': status(); break
  default:
    log('ERROR', '未知动作: ' + action)
    process.stderr.write('Usage: node elevate-cli.js <install|uninstall|start|stop|status>\n')
    exitWith(1, 'ERROR')
}

/**
 * YCDesk Windows Service 守护进程
 * 在系统启动时（Session 0）运行，连接信令服务器注册设备，等待远程连接
 */

const path = require('path')
const os = require('os')
const fs = require('fs')

const CONFIG_DIR = path.join(os.homedir(), '.ycdesk')
const LOG_FILE = path.join(CONFIG_DIR, 'service-daemon.log')
const AUTO_CONNECT_CONFIG = path.join(CONFIG_DIR, 'auto-connect.json')
const DEVICE_ID_FILE = path.join(CONFIG_DIR, 'device-id')

// 日志工具
const logger = {
  _write(level, msg) {
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] [${level}] ${msg}\n`
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
      }
      fs.appendFileSync(LOG_FILE, line, 'utf8')
    } catch (e) {
      console.error(line.trim())
    }
  },
  info(msg) { this._write('INFO', msg) },
  warn(msg) { this._write('WARN', msg) },
  error(msg) { this._write('ERROR', msg) },
  debug(msg) { this._write('DEBUG', msg) }
}

// 加载配置
function loadAutoConnectConfig() {
  try {
    if (fs.existsSync(AUTO_CONNECT_CONFIG)) {
      return JSON.parse(fs.readFileSync(AUTO_CONNECT_CONFIG, 'utf8'))
    }
  } catch (e) {
    logger.error('读取 auto-connect.json 失败: ' + e.message)
  }
  return null
}

function loadDeviceId() {
  try {
    if (fs.existsSync(DEVICE_ID_FILE)) {
      return fs.readFileSync(DEVICE_ID_FILE, 'utf8').trim()
    }
  } catch (e) {
    logger.error('读取 device-id 失败: ' + e.message)
  }
  return null
}

// 模块引用（延迟加载）
let SignalingClient = null
let PipeServer = null
let SessionMonitor = null

let signalingClient = null
let pipeServer = null
let sessionMonitor = null

// 服务状态
let isRunning = false

// 启动/停止操作互斥锁（防止 TOCTOU 竞态）
let _startPromise = null
let _stopPromise = null

// 保活定时器（确保 SCM 保持 RUNNING 状态）
let _keepAliveTimer = null

function startKeepAlive() {
  if (_keepAliveTimer) return
  _keepAliveTimer = setInterval(() => {}, 60000)
  logger.debug('保活定时器已启动')
}

function stopKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer)
    _keepAliveTimer = null
    logger.debug('保活定时器已停止')
  }
}

/**
 * 启动服务
 * 使用 Promise 互斥锁确保同一时间只有一个 start() 执行
 */
async function start() {
  // 如果已有启动操作进行中，返回现有 Promise
  if (_startPromise) return _startPromise
  if (isRunning) return

  _startPromise = (async () => {
    try {
      isRunning = true

      logger.info('YCDeskService 启动中...')
      logger.info('Node 版本: ' + process.version)
      logger.info('配置目录: ' + CONFIG_DIR)

      // 加载配置
      const config = loadAutoConnectConfig()
      const deviceId = loadDeviceId()

      // 初始化命名管道服务端（无论 auto-connect 是否启用，始终启动）
      // 这是服务进程的保活机制——net.Server 维持事件循环，
      // 使 winsw/SCM 保持 RUNNING 状态，同时等待 Electron 连接
      try {
        PipeServer = require('./pipe-server')
        pipeServer = new PipeServer({ logger })
        await pipeServer.start()
        logger.info('命名管道服务已启动')
      } catch (e) {
        logger.error('命名管道启动失败: ' + e.message)
      }

      // auto-connect 未启用 → 纯待机模式，只维持 pipe server
      if (!config || !config.enabled) {
        logger.info('自动连接未启用，服务进入待机模式（pipe server 保持活跃）')
        startKeepAlive()
        return
      }

      if (!deviceId) {
        logger.error('未找到设备 ID，无法注册到信令服务器')
        startKeepAlive()
        return
      }

      logger.info('设备 ID: ' + deviceId)
      logger.info('连接模式: ' + config.mode)

      // 初始化信令客户端（仅在 auto-connect 启用时）
      if (config.mode === 'signaling' && config.serverUrl) {
        try {
          SignalingClient = require('./signaling-client')
          signalingClient = new SignalingClient({
            deviceId: deviceId,
            serverUrl: config.serverUrl,
            logger: logger,
            onIncomingConnection: handleIncomingConnection,
            onConnected: () => logger.info('已连接到信令服务器'),
            onDisconnected: (reason) => logger.warn('与信令服务器断开: ' + reason)
          })
          await signalingClient.connect()
          logger.info('信令客户端已启动，连接到: ' + config.serverUrl)
        } catch (e) {
          logger.error('信令客户端启动失败: ' + e.message)
        }
      }

      // 初始化会话监控
      try {
        SessionMonitor = require('./session-monitor')
        sessionMonitor = new SessionMonitor({
          logger: logger,
          onUserLogon: handleUserLogon,
          onUserLogoff: handleUserLogoff
        })
        sessionMonitor.start()
        logger.info('会话监控已启动')
      } catch (e) {
        logger.error('会话监控启动失败: ' + e.message)
      }

      logger.info('YCDeskService 启动完成')

      // 保活：确保 Node.js 事件循环不会退出
      startKeepAlive()
    } finally {
      _startPromise = null
    }
  })()

  return _startPromise
}

/**
 * 停止服务
 * 使用 Promise 互斥锁确保同一时间只有一个 stop() 执行
 */
async function stop() {
  // 如果已有停止操作进行中，返回现有 Promise
  if (_stopPromise) return _stopPromise
  if (!isRunning) return

  _stopPromise = (async () => {
    try {
      isRunning = false

      logger.info('YCDeskService 停止中...')

      if (signalingClient) {
        signalingClient.disconnect()
        signalingClient = null
      }

      if (pipeServer) {
        pipeServer.stop()
        pipeServer = null
      }

      if (sessionMonitor) {
        sessionMonitor.stop()
        sessionMonitor = null
      }

      stopKeepAlive()

      logger.info('YCDeskService 已停止')
    } finally {
      _stopPromise = null
    }
  })()

  return _stopPromise
}

/**
 * 处理远程连接请求
 */
function handleIncomingConnection(fromDeviceId) {
  logger.info('收到来自 ' + fromDeviceId + ' 的连接请求')

  // 如果有 Electron 应用连接，通知它
  if (pipeServer && pipeServer.hasElectronConnection()) {
    pipeServer.notifyIncomingConnection(fromDeviceId)
  } else {
    logger.info('无 Electron 应用连接，连接请求将等待用户登录')
  }
}

/**
 * 处理用户登录事件
 */
function handleUserLogon(sessionId) {
  logger.info('检测到用户登录，会话 ID: ' + sessionId)

  // 启动 Electron 应用
  try {
    const { exec } = require('child_process')
    const electronPath = findElectronApp()
    if (electronPath) {
      exec('"' + electronPath + '" --auto-start --service-mode', {
        detached: true,
        stdio: 'ignore'
      }).unref()
      logger.info('已启动 Electron 应用: ' + electronPath)
    } else {
      logger.warn('未找到 Electron 应用路径')
    }
  } catch (e) {
    logger.error('启动 Electron 应用失败: ' + e.message)
  }
}

/**
 * 处理用户注销事件
 */
function handleUserLogoff(sessionId) {
  logger.info('检测到用户注销，会话 ID: ' + sessionId)
  // 服务重新接管信令连接（如果需要）
  if (signalingClient && !signalingClient.isConnected()) {
    const config = loadAutoConnectConfig()
    if (config && config.serverUrl) {
      signalingClient.connect(config.serverUrl)
      logger.info('服务重新接管信令连接')
    }
  }
}

/**
 * 查找 Electron 应用路径
 */
function findElectronApp() {
  const possiblePaths = [
    path.join(__dirname, '../YCDesk.exe'),
    path.join(__dirname, '../dist-v2/win-unpacked/YCDesk.exe'),
    path.join(process.resourcesPath || '', '../YCDesk.exe'),
    path.join(__dirname, '../../node_modules/.bin/electron')
  ]

  // 开发模式
  if (process.env.NODE_ENV === 'development') {
    return process.execPath
  }

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p
    } catch (e) {}
  }
  return null
}

// node-windows 服务入口
const Service = require('node-windows').Service

const svc = new Service({
  name: 'YCDeskService',
  description: 'YCDesk 远程桌面后台服务，提供用户未登录时的自动启动与监听功能',
  script: path.join(__dirname, 'service-daemon.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=128'
  ]
})

svc.on('install', () => {
  logger.info('服务安装成功')
  svc.start()
})

svc.on('uninstall', () => {
  logger.info('服务卸载成功')
})

svc.on('start', () => {
  logger.info('服务已启动')
  start()
})

svc.on('stop', () => {
  logger.info('服务已停止')
  stop()
})

svc.on('error', (err) => {
  logger.error('服务错误: ' + err.message)
})

// 始终启动服务（不依赖 node-windows 的 'start' 事件）
// winsw 直接运行 node.exe，node-windows 可能无法检测到服务模式
// 若 'start' 事件后来触发，isRunning 守卫可防止二次启动
logger.info('正在启动服务...')
start().catch(err => {
  logger.error('启动失败: ' + (err && err.message || err))
  // 保活：即使启动失败也保持进程存活
  startKeepAlive()
})

// 如果直接运行（非服务模式），启动 + 信号处理
if (process.argv.includes('--run-directly')) {
  start().catch(err => {
    logger.error('启动失败: ' + err.message)
    process.exit(1)
  })

  process.on('SIGINT', () => {
    stop().then(() => process.exit(0))
  })

  process.on('SIGTERM', () => {
    stop().then(() => process.exit(0))
  })
}

module.exports = { start, stop, logger, loadAutoConnectConfig, loadDeviceId }

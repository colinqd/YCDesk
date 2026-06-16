/**
 * YCDesk Watchdog - 自维护监控进程
 * 
 * 使用 Worker Thread 独立运行监控任务：
 * - 主进程心跳检测
 * - WebRTC 连接健康检查
 * - 渲染进程响应性检测
 * - 内存使用监控
 * - 自动恢复策略
 */

const { parentPort } = require('worker_threads')

// ========== 配置 ==========
const CONFIG = {
    HEARTBEAT_INTERVAL: 3000,       // 心跳间隔 3 秒
    MAIN_PING_TIMEOUT: 5000,        // 主进程 ping 超时 5 秒
    MEMORY_CHECK_INTERVAL: 30000,   // 内存检查间隔 30 秒
    MEMORY_WARN_THRESHOLD: 500 * 1024 * 1024,  // 内存预警阈值 500MB
    MEMORY_CRITICAL_THRESHOLD: 800 * 1024 * 1024, // 内存严重阈值 800MB
    MAX_CONSECUTIVE_FAILURES: 3,    // 连续心跳失败次数上限
    RECOVERY_COOLDOWN: 15000,       // 恢复冷却时间 15 秒
    MAX_RECOVERY_ATTEMPTS: 5,       // 总恢复次数上限（超过后停止所有恢复）
    HEALTHY_RESET_TIME: 60000,      // 连续健康 60 秒后重置恢复计数器
}

// ========== 状态 ==========
const state = {
    mainProcessAlive: true,
    lastMainPong: Date.now(),
    consecutiveMainFailures: 0,
    webrtcStatus: { connected: false, dataChannelOpen: false },
    memoryUsage: 0,
    failures: [],
    recoveryActions: [],
    started: false,
    lastRecoveryTime: 0,
    recoveryLevel: 0,            // 0=正常, 1=轻量恢复, 2=中等恢复, 3=完全重连
    totalRecoveryAttempts: 0,    // 累计恢复尝试次数
    recoveryExhausted: false,    // 是否已达到上限停止修复
    healthySince: 0,             // 最近一次变为健康的时间戳
    forceReconnectInProgress: false  // 防止并发 force-reconnect
}

let heartbeatTimer = null
let memoryTimer = null

// ========== 消息发送 ==========
function sendToMain(type, data = {}) {
    if (parentPort) {
        parentPort.postMessage({ type, timestamp: Date.now(), ...data })
    }
}

function log(message) {
    sendToMain('watchdog-log', { message })
}

// ========== 恢复次数限制 ==========
function _canAttemptRecovery() {
    if (state.recoveryExhausted) {
        return false
    }
    if (state.totalRecoveryAttempts >= CONFIG.MAX_RECOVERY_ATTEMPTS) {
        state.recoveryExhausted = true
        log('🛑 累计恢复次数已达上限 (' + CONFIG.MAX_RECOVERY_ATTEMPTS + ')，停止所有自动修复')
        return false
    }
    return true
}

function _recordRecoveryAttempt() {
    state.totalRecoveryAttempts++
    log('📊 恢复尝试: ' + state.totalRecoveryAttempts + '/' + CONFIG.MAX_RECOVERY_ATTEMPTS)
}

// ========== 主进程心跳检查 ==========
function checkMainProcess() {
    return new Promise((resolve) => {
        const startTime = Date.now()
        const timeout = setTimeout(() => {
            state.consecutiveMainFailures++
            log('⚠️ 主进程心跳超时 (' + state.consecutiveMainFailures + '/' + CONFIG.MAX_CONSECUTIVE_FAILURES + ')')
            state.mainProcessAlive = false
            
            recordFailure('main-heartbeat-timeout', '主进程心跳超时')
            
            if (state.consecutiveMainFailures >= CONFIG.MAX_CONSECUTIVE_FAILURES) {
                if (state.forceReconnectInProgress) {
                    log('⏳ force-reconnect 正在执行中，跳过重复触发')
                } else if (_canAttemptRecovery()) {
                    log('🚨 主进程连续 ' + CONFIG.MAX_CONSECUTIVE_FAILURES + ' 次心跳超时，自动执行完全重连...')
                    state.recoveryLevel = 3
                    state.forceReconnectInProgress = true
                    _recordRecoveryAttempt()
                    sendToMain('watchdog-force-reconnect', {
                        reason: 'main-process-unresponsive',
                        consecutiveFailures: state.consecutiveMainFailures
                    })
                } else {
                    log('🛑 主进程心跳超时但恢复次数已用尽，不再尝试自动修复')
                }
            }
            resolve(false)
        }, CONFIG.MAIN_PING_TIMEOUT)

        // 发送 ping，等待 pong
        sendToMain('watchdog-ping')
        
        // 监听 pong 响应（由 main.js 通过 postMessage 回复）
        const onPong = (msg) => {
            if (msg && msg.type === 'watchdog-pong') {
                clearTimeout(timeout)
                state.mainProcessAlive = true
                state.consecutiveMainFailures = 0
                state.lastMainPong = Date.now()
                parentPort.off('message', onPong)
                resolve(true)
            } else if (msg && msg.type === 'watchdog-status') {
                // 接收 WebRTC 状态更新
                state.webrtcStatus = msg.webrtcStatus || state.webrtcStatus
                state.memoryUsage = msg.memoryUsage || state.memoryUsage
            }
        }
        
        const originalOnMessage = parentPort ? parentPort.listeners('message') : []
        if (parentPort) {
            // 使用 once 等价实现
            parentPort.on('message', onPong)
        }
    })
}

// ========== WebRTC 状态检查 ==========
function checkWebRTCState() {
    if (!state.webrtcStatus.connected) return // 没有活动连接，跳过

    const now = Date.now()
    const inCooldown = (now - state.lastRecoveryTime) < CONFIG.RECOVERY_COOLDOWN

    // 检查是否需要停止恢复（已用尽）
    const canRecover = _canAttemptRecovery()

    // ===== 健康状态：重置恢复计数器 =====
    if (state.webrtcStatus.dataChannelOpen === true &&
        state.webrtcStatus.connectionState === 'connected' &&
        !state.webrtcStatus.disconnected) {

        if (!state.healthySince) {
            state.healthySince = now
        } else if ((now - state.healthySince) >= CONFIG.HEALTHY_RESET_TIME) {
            if (state.totalRecoveryAttempts > 0 || state.recoveryExhausted) {
                log('✅ 连续健康 ' + (CONFIG.HEALTHY_RESET_TIME / 1000) + ' 秒，重置恢复计数器（原=' + state.totalRecoveryAttempts + '）')
                state.totalRecoveryAttempts = 0
                state.recoveryExhausted = false
            }
            state.forceReconnectInProgress = false
            state.healthySince = now
        }

        if (state.recoveryLevel > 0) {
            state.recoveryLevel = Math.max(0, state.recoveryLevel - 0.5)
        }
        return
    }

    // 不健康时清除 healthySince
    state.healthySince = 0

    if (!canRecover) {
        return // 已用尽恢复次数，不再尝试
    }

    // 数据通道关闭
    if (state.webrtcStatus.dataChannelOpen !== true) {
        if (inCooldown) {
            log('⏳ 数据通道已关闭，但仍在恢复冷却中，等待...')
            return
        }
        log('⚠️ WebRTC 数据通道已关闭，自动触发恢复 (level=' + state.recoveryLevel + ')')
        recordFailure('data-channel-closed', '数据通道异常关闭')

        if (state.recoveryLevel < 3) {
            state.recoveryLevel++
            _recordRecoveryAttempt()
            sendToMain('watchdog-recover', { action: 'data-channel-recovery', level: state.recoveryLevel })
            state.lastRecoveryTime = now
        } else {
            log('⏰ 数据通道恢复已达到最高级别，等待冷却...')
        }
        return
    }

    // WebRTC 连接失败
    if (state.webrtcStatus.connectionState === 'failed') {
        if (inCooldown) return
        log('🚨 WebRTC 连接失败，自动触发 ICE restart (level=' + state.recoveryLevel + ')')
        state.recoveryLevel = Math.max(state.recoveryLevel, 2)
        _recordRecoveryAttempt()
        sendToMain('watchdog-recover', { action: 'ice-restart', level: state.recoveryLevel })
        state.lastRecoveryTime = now
        return
    }

    // WebRTC 断开
    if (state.webrtcStatus.disconnected === true) {
        if (inCooldown) return
        if (state.forceReconnectInProgress) {
            log('⏳ force-reconnect 正在执行中，跳过重复触发')
            return
        }
        log('⚠️ WebRTC 连接断开，自动触发恢复 (level=' + (state.recoveryLevel + 1) + ')')
        recordFailure('webrtc-disconnected', 'WebRTC 断开')
        state.recoveryLevel = Math.min(state.recoveryLevel + 1, 3)
        state.forceReconnectInProgress = true
        _recordRecoveryAttempt()
        sendToMain('watchdog-force-reconnect', { reason: 'webrtc-disconnected', level: state.recoveryLevel })
        state.lastRecoveryTime = now
    }
}

// ========== 内存检查 ==========
function checkMemory() {
    const usage = state.memoryUsage
    if (usage > CONFIG.MEMORY_CRITICAL_THRESHOLD) {
        log('🚨 内存使用严重超标: ' + Math.round(usage / 1024 / 1024) + 'MB')
        sendToMain('watchdog-recover', { action: 'memory-warning', level: 'critical' })
    } else if (usage > CONFIG.MEMORY_WARN_THRESHOLD) {
        log('⚠️ 内存使用偏高: ' + Math.round(usage / 1024 / 1024) + 'MB')
        sendToMain('watchdog-recover', { action: 'memory-warning', level: 'warn' })
    }
}

// ========== 失败记录 ==========
function recordFailure(type, message) {
    state.failures.push({
        type,
        message,
        timestamp: Date.now()
    })
    
    // 保留最近 20 条记录
    if (state.failures.length > 20) {
        state.failures.shift()
    }
    
    state.recoveryActions.push({
        action: type,
        timestamp: Date.now()
    })
    if (state.recoveryActions.length > 20) {
        state.recoveryActions.shift()
    }
}

// ========== 主循环 ==========
function startMonitoring() {
    if (state.started) return
    state.started = true
    log('Watchdog 监控已启动（间隔=' + CONFIG.HEARTBEAT_INTERVAL + 'ms）')

    // 心跳定时器
    heartbeatTimer = setInterval(async () => {
        await checkMainProcess()
        checkWebRTCState()
    }, CONFIG.HEARTBEAT_INTERVAL)

    // 内存检查定时器
    memoryTimer = setInterval(() => {
        checkMemory()
    }, CONFIG.MEMORY_CHECK_INTERVAL)

    // 立即执行一次
    checkMainProcess()
}

function stopMonitoring() {
    state.started = false
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (memoryTimer) clearInterval(memoryTimer)
    heartbeatTimer = null
    memoryTimer = null
    log('Watchdog 监控已停止')
}

// ========== 启动 ==========
if (parentPort) {
    parentPort.on('message', (msg) => {
        switch (msg.type) {
            case 'watchdog-start':
                startMonitoring()
                break
            case 'watchdog-stop':
                stopMonitoring()
                break
            case 'watchdog-status':
                if (msg.webrtcStatus) {
                    state.webrtcStatus = msg.webrtcStatus
                }
                if (msg.memoryUsage !== undefined) {
                    state.memoryUsage = msg.memoryUsage
                }
                break
            case 'watchdog-pong':
                // pong 由 checkMainProcess 内部的 onPong 处理
                break
        }
    })
    
    log('Watchdog Worker 线程已启动')
}

module.exports = { CONFIG, startMonitoring, stopMonitoring }
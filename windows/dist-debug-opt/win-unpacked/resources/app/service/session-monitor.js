/**
 * Windows 会话监控
 * 监听用户登录/注销事件
 */

const { execSync, exec } = require('child_process')

class SessionMonitor {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.onUserLogon = options.onUserLogon || null
    this.onUserLogoff = options.onUserLogoff || null
    this._pollTimer = null
    this._lastSessions = new Map()
    this._isRunning = false
  }

  /**
   * 启动会话监控
   * 使用 query session 命令轮询检测会话变更
   */
  start() {
    if (this._isRunning) return
    this._isRunning = true
    this.logger.info('会话监控已启动')

    // 立即检测一次
    this._pollSessions()

    // 每 5 秒轮询一次
    this._pollTimer = setInterval(() => {
      this._pollSessions()
    }, 5000)
  }

  /**
   * 停止会话监控
   */
  stop() {
    this._isRunning = false
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    this.logger.info('会话监控已停止')
  }

  /**
   * 轮询检测会话变更
   */
  _pollSessions() {
    try {
      const output = execSync('query session', { encoding: 'utf8', timeout: 5000 })
      const sessions = this._parseSessionOutput(output)

      for (const [id, session] of sessions) {
        const prev = this._lastSessions.get(id)
        if (!prev && session.state === 'Active') {
          // 新的活跃会话 = 用户登录
          this.logger.info('检测到用户登录: 会话 ' + id + ' 用户 ' + session.username)
          if (this.onUserLogon) this.onUserLogon(id)
        } else if (prev && prev.state === 'Active' && session.state !== 'Active') {
          // 活跃会话变为非活跃 = 用户注销
          this.logger.info('检测到用户注销: 会话 ' + id + ' 用户 ' + session.username)
          if (this.onUserLogoff) this.onUserLogoff(id)
        }
      }

      this._lastSessions = sessions
    } catch (e) {
      // query session 可能因权限问题失败，静默处理
    }
  }

  /**
   * 解析 query session 输出
   * 输出格式示例：
   *  SESSIONNAME       USERNAME                 ID  STATE
   *  >services                                   0  Disc
   *   console           user1                    1  Active
   */
  _parseSessionOutput(output) {
    const sessions = new Map()
    const lines = output.split('\n').slice(1) // 跳过标题行

    for (const line of lines) {
      const match = line.match(/\s+(\S*)\s+(\S+)\s+(\d+)\s+(\S+)/)
      if (match) {
        const sessionName = match[1].replace('>', '').trim()
        const username = match[2]
        const id = match[3]
        const state = match[4]

        sessions.set(id, { sessionName, username, state })
      }
    }

    return sessions
  }
}

module.exports = SessionMonitor

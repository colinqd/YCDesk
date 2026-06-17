const net = require('net')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { createLogger } = require('./logger')

const logger = createLogger()

const DIAG_LOG = 'C:\\ProgramData\\YCDesk\\input_handler.log'
function diagLog(msg) {
  try { fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] [IPC] ${msg}\n`, 'utf8') } catch (e) {}
}

class UnlockIpcServer {
  constructor() {
    this.serverYCDesk = null
    this.serverRemoteDesk = null
    this.isRunning = false
    this.storedUsername = ''
    this.storedPassword = ''
    this.hasStoredCredentials = false
    this.pipeNameYCDesk = '\\\\.\\pipe\\YCDeskUnlock'
    this.pipeNameRemoteDesk = '\\\\.\\pipe\\RemoteDeskUnlock'
    // Pending request from controller (with or without credentials)
    this.pendingUsername = ''
    this.pendingPassword = ''
    this.hasPendingCredentials = false
  }

  start() {
    if (this.isRunning) {
      logger.info('[UnlockIpcServer] 已在运行')
      return true
    }

    try {
      let started = false

      // 创建 YCDesk 管道服务器
      this.serverYCDesk = net.createServer((socket) => {
        logger.info('[UnlockIpcServer] YCDesk 客户端已连接')
        this.handleClient(socket)
      })
      this.serverYCDesk.on('error', (err) => {
        logger.error('[UnlockIpcServer] YCDesk 服务器错误:', err)
      })
      this.serverYCDesk.listen(this.pipeNameYCDesk, () => {
        logger.info('[UnlockIpcServer] YCDesk 服务器已启动，管道:', this.pipeNameYCDesk)
      })

      // 创建 RemoteDesk 管道服务器（兼容现有 DLL）
      this.serverRemoteDesk = net.createServer((socket) => {
        logger.info('[UnlockIpcServer] RemoteDesk 客户端已连接')
        this.handleClient(socket)
      })
      this.serverRemoteDesk.on('error', (err) => {
        logger.error('[UnlockIpcServer] RemoteDesk 服务器错误:', err)
      })
      this.serverRemoteDesk.listen(this.pipeNameRemoteDesk, () => {
        logger.info('[UnlockIpcServer] RemoteDesk 服务器已启动，管道:', this.pipeNameRemoteDesk)
      })

      this.isRunning = true
      return true
    } catch (error) {
      logger.error('[UnlockIpcServer] 启动失败:', error)
      return false
    }
  }

  stop() {
    if (!this.isRunning) {
      return
    }

    if (this.serverYCDesk) {
      this.serverYCDesk.close()
    }
    if (this.serverRemoteDesk) {
      this.serverRemoteDesk.close()
    }
    this.isRunning = false
    logger.info('[UnlockIpcServer] 服务器已停止')
  }

  handleClient(socket) {
    let buffer = Buffer.alloc(0)

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      
      // 尝试解析消息 (UTF-16LE encoding)
      const request = buffer.toString('utf16le')
      
      if (request.startsWith('REQUEST_UNLOCK')) {
        logger.info('[UnlockIpcServer] 收到 REQUEST_UNLOCK 请求')
        
        // Parse: REQUEST_UNLOCK\0username\0password
        // Or just: REQUEST_UNLOCK (empty password means use stored credentials)
        const prefixLen = 'REQUEST_UNLOCK\0'.length
        const content = request.substring(prefixLen)
        
        let username = ''
        let password = ''
        
        // Check if controller sent credentials
        const nullIndex = content.indexOf('\0')
        if (nullIndex !== -1) {
          // Controller sent: username\0password
          username = content.substring(0, nullIndex)
          password = content.substring(nullIndex + 1)
          logger.info('[UnlockIpcServer] 主控端发送了凭据，用户:', username)
        } else {
          // Empty password - use stored credentials
          logger.info('[UnlockIpcServer] 主控端发送空密码，尝试使用已存储凭据')
          username = this.storedUsername
          password = this.storedPassword
        }
        
        // Send response: username\0password (UTF-16LE)
        if (password && password.length > 0 && username && username.length > 0) {
          const usernameBuffer = Buffer.from(username + '\0', 'utf16le')
          const passwordBuffer = Buffer.from(password, 'utf16le')
          const response = Buffer.concat([usernameBuffer, passwordBuffer])
          
          socket.write(response)
          logger.info('[UnlockIpcServer] 已发送凭据，用户:', username)
        } else {
          logger.info('[UnlockIpcServer] 没有可用的凭据')
          // Send empty response
          socket.write(Buffer.from('\0', 'utf16le'))
        }
        
      } else if (request.startsWith('SET_CREDENTIALS')) {
        logger.info('[UnlockIpcServer] 收到 SET_CREDENTIALS 请求')
        // Parse username\0password
        const prefixLen = 'SET_CREDENTIALS\0'.length
        const content = request.substring(prefixLen)
        const nullIndex = content.indexOf('\0')
        
        if (nullIndex !== -1) {
          this.storedUsername = content.substring(0, nullIndex)
          this.storedPassword = content.substring(nullIndex + 1)
          this.hasStoredCredentials = true
          logger.info('[UnlockIpcServer] 凭据已存储，用户:', this.storedUsername)
          socket.write(Buffer.from('OK\0', 'utf16le'))
        } else {
          socket.write(Buffer.from('ERROR\0', 'utf16le'))
        }
      }
    })

    socket.on('end', () => {
      logger.info('[UnlockIpcServer] 客户端已断开')
    })

    socket.on('error', (err) => {
      logger.error('[UnlockIpcServer] Socket 错误:', err)
    })
  }

  setCredentials(username, password) {
    this.storedUsername = username
    this.storedPassword = password
    this.hasStoredCredentials = true
    diagLog(`setCredentials called: user=${username}, pwdLen=${password ? password.length : 0}`)
    logger.info('[UnlockIpcServer] setCredentials 被调用，用户:', username)
    
    // Write credentials to a file so the CP DLL can read them directly
    // This bypasses the need for the IPC pipe to be available
    try {
      const flagDir = 'C:\\ProgramData\\YCDesk'
      if (!fs.existsSync(flagDir)) {
        fs.mkdirSync(flagDir, { recursive: true })
      }
      
      // Write timestamp flag (triggers pbAutoLogon in GetCredentialCount)
      const flagFile = path.join(flagDir, 'unlock_ready.flag')
      fs.writeFileSync(flagFile, Date.now().toString())
      diagLog(`Flag file written: ${flagFile}`)
      logger.info('[UnlockIpcServer] Flag file written:', flagFile)
      
      // Write actual credentials in a separate file (UTF-16LE with null separators)
      const credFile = path.join(flagDir, 'unlock_creds.dat')
      // Format: username\0password (UTF-16LE)
      const usernameBuffer = Buffer.from(username, 'utf16le')
      const passwordBuffer = Buffer.from(password, 'utf16le')
      const nullChar = Buffer.from([0, 0]) // UTF-16LE null
      const credBuffer = Buffer.concat([usernameBuffer, nullChar, passwordBuffer])
      fs.writeFileSync(credFile, credBuffer)
      diagLog(`Creds file written: ${credFile}, size=${credBuffer.length}`)
      logger.info('[UnlockIpcServer] Credentials file written:', credFile)
      
      // Set strict ACL: only SYSTEM and Administrators can read
      try {
        const { execSync } = require('child_process')
        execSync(`icacls "${credFile}" /inheritance:r /grant:r "SYSTEM:(R)" /grant:r "BUILTIN\\Administrators:(R)"`, { stdio: 'ignore' })
      } catch (aclErr) {
        logger.info('[UnlockIpcServer] ACL设置失败（可忽略）:', aclErr.message)
      }
    } catch (e) {
      diagLog(`Failed to write credential files: ${e.message}`)
      logger.error('[UnlockIpcServer] Failed to write credential files:', e.message)
    }
    
    return true
  }

  clearCredentials() {
    this.storedUsername = ''
    this.storedPassword = ''
    this.hasStoredCredentials = false
    logger.info('[UnlockIpcServer] 凭据已清除')
    
    // Clear the flag and credential files
    try {
      const flagDir = 'C:\\ProgramData\\YCDesk'
      const flagFile = path.join(flagDir, 'unlock_ready.flag')
      const credFile = path.join(flagDir, 'unlock_creds.dat')
      if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile)
      if (fs.existsSync(credFile)) fs.unlinkSync(credFile)
    } catch (e) {}
  }
}

module.exports = new UnlockIpcServer()

const { safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')
const unlockIpcServer = require('./unlock-ipc-server')

class CredentialsManager {
  constructor() {
    this.configDir = path.join(__dirname, '../..', 'data')
    this.credentialsFile = path.join(this.configDir, 'credentials.json')
    this.ensureConfigDir()
    this.credentialProviderAvailable = this.checkCredentialProvider()
  }

  checkCredentialProvider() {
    try {
      // 检查注册表项是否存在
      const { execSync } = require('child_process')
      const result = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" 2>nul || echo not found',
        { encoding: 'utf8', shell: true }
      )
      return !result.includes('not found')
    } catch (e) {
      return false
    }
  }

  async unlockWithCredentialProvider(username, password) {
    console.log('[CredentialsManager] unlockWithCredentialProvider 被调用，用户:', username)
    
    try {
      // 使用 IPC 服务器设置凭据
      unlockIpcServer.setCredentials(username, password)
      
      return { 
        success: true, 
        message: 'Credential Provider 解锁已触发' 
      }
    } catch (error) {
      console.error('[CredentialsManager] 设置凭据失败:', error)
      return { 
        success: false, 
        message: `设置凭据失败: ${error.message}` 
      }
    }
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }
  }

  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable()
  }

  async saveUnlockPassword(password, remember = true) {
    try {
      if (!password) {
        return { success: false, message: '密码不能为空' }
      }

      let encryptedPassword
      if (safeStorage.isEncryptionAvailable()) {
        encryptedPassword = safeStorage.encryptString(password).toString('base64')
      } else {
        return { success: false, message: '系统加密不可用，无法安全存储密码' }
      }

      const credentials = {
        encryptedPassword,
        rememberPassword: true,
        lastUpdated: Date.now(),
        encrypted: safeStorage.isEncryptionAvailable()
      }

      fs.writeFileSync(
        this.credentialsFile, 
        JSON.stringify(credentials, null, 2), 
        'utf-8'
      )

      return { success: true, message: '密码保存成功' }
    } catch (error) {
      console.error('保存解锁密码失败:', error)
      return { 
        success: false, 
        message: error.message || '保存密码失败' 
      }
    }
  }

  async getUnlockPassword() {
    try {
      if (!fs.existsSync(this.credentialsFile)) {
        return { success: false, password: null }
      }

      const credentialsData = fs.readFileSync(this.credentialsFile, 'utf-8')
      const credentials = JSON.parse(credentialsData)

      if (!credentials.encryptedPassword || credentials.encryptedPassword.trim() === '') {
        return { success: false, password: null }
      }

      let password
      const wasEncrypted = credentials.encrypted === true

      if (wasEncrypted && safeStorage.isEncryptionAvailable()) {
        try {
          const encryptedBuffer = Buffer.from(credentials.encryptedPassword, 'base64')
          password = safeStorage.decryptString(encryptedBuffer)
        } catch (decryptError) {
          console.error('密码解密失败:', decryptError.message)
          try {
            fs.unlinkSync(this.credentialsFile)
          } catch (e) {
          }
          return { success: false, password: null, error: '解密失败' }
        }
      } else {
        password = Buffer.from(credentials.encryptedPassword, 'base64').toString('utf8')
      }

      if (!password || password.trim() === '') {
        try {
          fs.unlinkSync(this.credentialsFile)
        } catch (e) {
        }
        return { success: false, password: null }
      }

      return { success: true, password }
    } catch (error) {
      console.error('获取解锁密码失败:', error)
      try {
        fs.unlinkSync(this.credentialsFile)
      } catch (e) {
      }
      return { success: false, password: null }
    }
  }

  async clearUnlockPassword() {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        fs.unlinkSync(this.credentialsFile)
      }
      return { success: true, message: '密码已清除' }
    } catch (error) {
      console.error('清除解锁密码失败:', error)
      return { 
        success: false, 
        message: error.message || '清除密码失败' 
      }
    }
  }
}

module.exports = new CredentialsManager()

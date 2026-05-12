const { safeStorage, app } = require('electron')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')
const unlockIpcServer = require('./unlock-ipc-server')

class CredentialsManager {
  constructor() {
    this._configDir = null
    this._credentialsFile = null
    this.credentialProviderAvailable = this.checkCredentialProvider()
  }
  
  getConfigDir() {
    if (this._configDir) {
      return this._configDir
    }
    
    try {
      if (app && app.isReady()) {
        this._configDir = path.join(app.getPath('userData'), 'data')
      } else {
        this._configDir = path.join(__dirname, '../..', 'data')
      }
    } catch (e) {
      this._configDir = path.join(__dirname, '../..', 'data')
    }
    
    return this._configDir
  }
  
  getCredentialsFile() {
    if (!this._credentialsFile) {
      this._credentialsFile = path.join(this.getConfigDir(), 'credentials.json')
    }
    return this._credentialsFile
  }
  
  ensureConfigDir() {
    const configDir = this.getConfigDir()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
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

  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable()
  }

  async saveUnlockPassword(password, remember = true) {
    try {
      console.log('[CredentialsManager] saveUnlockPassword 开始执行')
      
      if (!password) {
        console.log('[CredentialsManager] 密码为空')
        return { success: false, message: '密码不能为空' }
      }

      console.log('[CredentialsManager] 检查加密可用性...')
      const encryptionAvailable = safeStorage.isEncryptionAvailable()
      console.log('[CredentialsManager] safeStorage.isEncryptionAvailable() =', encryptionAvailable)
      
      if (!encryptionAvailable) {
        console.error('[CredentialsManager] 系统加密不可用')
        return { success: false, message: '系统加密不可用。请确保应用程序已正确初始化。' }
      }

      console.log('[CredentialsManager] 开始加密密码...')
      let encryptedPassword
      try {
        encryptedPassword = safeStorage.encryptString(password).toString('base64')
        console.log('[CredentialsManager] 密码加密成功，长度:', encryptedPassword.length)
      } catch (encryptError) {
        console.error('[CredentialsManager] 密码加密失败:', encryptError.message)
        return { success: false, message: '密码加密失败: ' + encryptError.message }
      }

      const credentials = {
        encryptedPassword,
        rememberPassword: true,
        lastUpdated: Date.now(),
        encrypted: true
      }

      console.log('[CredentialsManager] 准备写入文件:', this.getCredentialsFile())
      
      try {
        this.ensureConfigDir()
        fs.writeFileSync(
          this.getCredentialsFile(), 
          JSON.stringify(credentials, null, 2), 
          'utf-8'
        )
        console.log('[CredentialsManager] 文件写入成功')
      } catch (writeError) {
        console.error('[CredentialsManager] 文件写入失败:', writeError.message)
        return { success: false, message: '文件写入失败: ' + writeError.message }
      }

      console.log('[CredentialsManager] 密码保存成功')
      return { success: true, message: '密码保存成功' }
    } catch (error) {
      console.error('[CredentialsManager] 保存解锁密码失败:', error)
      return { 
        success: false, 
        message: error.message || '保存密码失败' 
      }
    }
  }

  async getUnlockPassword() {
    try {
      const credentialsFile = this.getCredentialsFile()
      if (!fs.existsSync(credentialsFile)) {
        return { success: false, password: null }
      }

      const credentialsData = fs.readFileSync(credentialsFile, 'utf-8')
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
          console.error('[CredentialsManager] 密码解密失败:', decryptError.message)
          try {
            fs.unlinkSync(credentialsFile)
          } catch (e) {
          }
          return { success: false, password: null, error: '解密失败' }
        }
      } else {
        password = Buffer.from(credentials.encryptedPassword, 'base64').toString('utf8')
      }

      if (!password || password.trim() === '') {
        try {
          fs.unlinkSync(credentialsFile)
        } catch (e) {
        }
        return { success: false, password: null }
      }

      return { success: true, password }
    } catch (error) {
      console.error('[CredentialsManager] 获取解锁密码失败:', error)
      try {
        fs.unlinkSync(this.getCredentialsFile())
      } catch (e) {
      }
      return { success: false, password: null }
    }
  }

  async clearUnlockPassword() {
    try {
      const credentialsFile = this.getCredentialsFile()
      if (fs.existsSync(credentialsFile)) {
        fs.unlinkSync(credentialsFile)
      }
      return { success: true, message: '密码已清除' }
    } catch (error) {
      console.error('[CredentialsManager] 清除解锁密码失败:', error)
      return { 
        success: false, 
        message: error.message || '清除密码失败' 
      }
    }
  }
}

module.exports = new CredentialsManager()

const { safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

class CredentialsManager {
  constructor() {
    this.configDir = path.join(__dirname, '../..', 'data')
    this.credentialsFile = path.join(this.configDir, 'credentials.json')
    this.ensureConfigDir()
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }
  }

  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable()
  }

  async saveUnlockPassword(password, remember = false) {
    try {
      if (!password) {
        return { success: false, message: '密码不能为空' }
      }

      let encryptedPassword = password
      if (this.isEncryptionAvailable()) {
        encryptedPassword = safeStorage.encryptString(password).toString('base64')
      }

      const credentials = {
        encryptedPassword,
        rememberPassword: remember,
        lastUpdated: Date.now()
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

      if (!credentials.encryptedPassword || !credentials.rememberPassword) {
        return { success: false, password: null }
      }

      let password = credentials.encryptedPassword
      if (this.isEncryptionAvailable()) {
        const buffer = Buffer.from(credentials.encryptedPassword, 'base64')
        password = safeStorage.decryptString(buffer)
      }

      return { success: true, password }
    } catch (error) {
      console.error('获取解锁密码失败:', error)
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

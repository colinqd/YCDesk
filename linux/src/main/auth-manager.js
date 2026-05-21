const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT_LENGTH = 32
const TAG_LENGTH = 16
const ITERATIONS = 100000
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 30000

let connectionPassword = null
let failedAttempts = 0
let lockoutUntil = 0

function setPassword(password) {
  if (!password || password.length < 4) {
    return { success: false, error: '密码长度至少4位' }
  }
  connectionPassword = password
  return { success: true }
}

function getPassword() {
  return connectionPassword
}

function hasPassword() {
  return connectionPassword !== null
}

function clearPassword() {
  connectionPassword = null
  failedAttempts = 0
  lockoutUntil = 0
}

function verifyPassword(password) {
  if (!connectionPassword) {
    return true
  }

  if (lockoutUntil > 0) {
    if (Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000)
      return { success: false, error: `验证被锁定，请等待 ${remaining} 秒`, lockedOut: true }
    }
    failedAttempts = 0
    lockoutUntil = 0
  }

  if (!password || typeof password !== 'string') {
    return { success: false, error: '密码格式无效' }
  }

  // timingSafeEqual 要求两个 Buffer 长度相同，长度不同时直接返回 false
  if (password.length !== connectionPassword.length) {
    failedAttempts++
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockoutUntil = Date.now() + LOCKOUT_DURATION
      return { success: false, error: '验证失败次数过多，已锁定30秒', lockedOut: true }
    }
    return { success: false, error: '密码错误', remainingAttempts: MAX_ATTEMPTS - failedAttempts }
  }

  const isValid = crypto.timingSafeEqual(
    Buffer.from(password, 'utf8'),
    Buffer.from(connectionPassword, 'utf8')
  )

  if (!isValid) {
    failedAttempts++
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockoutUntil = Date.now() + LOCKOUT_DURATION
      return { success: false, error: '验证失败次数过多，已锁定30秒', lockedOut: true }
    }
    return { success: false, error: '密码错误', remainingAttempts: MAX_ATTEMPTS - failedAttempts }
  }

  failedAttempts = 0
  return { success: true }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex')
  }
}

function verifyHash(password, saltHex, hashHex) {
  const salt = Buffer.from(saltHex, 'hex')
  const storedHash = Buffer.from(hashHex, 'hex')
  const computedHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')
  return crypto.timingSafeEqual(storedHash, computedHash)
}

function encrypt(data, password) {
  const pwd = password || connectionPassword
  if (!pwd) {
    return { success: false, error: '未设置密码' }
  }
  
  try {
    const salt = crypto.randomBytes(SALT_LENGTH)
    const key = crypto.pbkdf2Sync(pwd, salt, ITERATIONS, KEY_LENGTH, 'sha256')
    const iv = crypto.randomBytes(IV_LENGTH)
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const tag = cipher.getAuthTag()
    
    return {
      success: true,
      data: {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted: encrypted
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function decrypt(encryptedData, password) {
  const pwd = password || connectionPassword
  if (!pwd) {
    return { success: false, error: '未设置密码' }
  }
  
  try {
    const salt = Buffer.from(encryptedData.salt, 'hex')
    const iv = Buffer.from(encryptedData.iv, 'hex')
    const tag = Buffer.from(encryptedData.tag, 'hex')
    
    const key = crypto.pbkdf2Sync(pwd, salt, ITERATIONS, KEY_LENGTH, 'sha256')
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return {
      success: true,
      data: JSON.parse(decrypted)
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function createAuthMessage(type, data) {
  const timestamp = Date.now()
  const token = generateToken()
  
  return {
    type: type,
    timestamp: timestamp,
    token: token,
    data: data
  }
}

function verifyAuthMessage(message, maxAge = 30000) {
  if (!message || !message.timestamp || !message.token) {
    return false
  }
  
  const age = Date.now() - message.timestamp
  if (age > maxAge || age < 0) {
    return false
  }
  
  return true
}

module.exports = {
  setPassword,
  getPassword,
  hasPassword,
  clearPassword,
  verifyPassword,
  hashPassword,
  verifyHash,
  encrypt,
  decrypt,
  generateToken,
  createAuthMessage,
  verifyAuthMessage
}

let online = navigator.onLine
let connectionQuality = 'unknown'
let lastPingTime = 0
let pingInterval = null
let qualityCheckInterval = null

const QUALITY_THRESHOLDS = {
  EXCELLENT: 50,
  GOOD: 100,
  FAIR: 200,
  POOR: 500
}

const listeners = new Set()

function addNetworkListener(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifyListeners(event, data) {
  listeners.forEach(callback => {
    try {
      callback(event, data)
    } catch (error) {
      console.error('网络监听器错误:', error)
    }
  })
}

function init() {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  
  startQualityCheck()
  
  console.log('网络管理器已初始化, 当前状态:', online ? '在线' : '离线')
}

function handleOnline() {
  online = true
  console.log('网络已连接')
  notifyListeners('online')
}

function handleOffline() {
  online = false
  console.log('网络已断开')
  notifyListeners('offline')
}

function isOnline() {
  return online
}

function getQuality() {
  return connectionQuality
}

function startQualityCheck() {
  stopQualityCheck()
  
  qualityCheckInterval = setInterval(() => {
    checkConnectionQuality()
  }, 10000)
  
  checkConnectionQuality()
}

function stopQualityCheck() {
  if (qualityCheckInterval) {
    clearInterval(qualityCheckInterval)
    qualityCheckInterval = null
  }
}

async function checkConnectionQuality() {
  if (!navigator.onLine) {
    connectionQuality = 'offline'
    notifyListeners('quality-change', { quality: connectionQuality })
    return
  }
  
  try {
    const start = performance.now()
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    const latency = performance.now() - start
    
    if (latency < QUALITY_THRESHOLDS.EXCELLENT) {
      connectionQuality = 'excellent'
    } else if (latency < QUALITY_THRESHOLDS.GOOD) {
      connectionQuality = 'good'
    } else if (latency < QUALITY_THRESHOLDS.FAIR) {
      connectionQuality = 'fair'
    } else {
      connectionQuality = 'poor'
    }
    
    notifyListeners('quality-change', { quality: connectionQuality, latency })
  } catch (error) {
    connectionQuality = 'unknown'
    notifyListeners('quality-change', { quality: connectionQuality })
  }
}

function calculateReconnectDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  const jitter = delay * 0.1 * Math.random()
  return Math.floor(delay + jitter)
}

function getQualityIcon() {
  switch (connectionQuality) {
    case 'excellent':
      return '🟢'
    case 'good':
      return '🟡'
    case 'fair':
      return '🟠'
    case 'poor':
      return '🔴'
    case 'offline':
      return '⚫'
    default:
      return '⚪'
  }
}

function getQualityText() {
  switch (connectionQuality) {
    case 'excellent':
      return '优秀'
    case 'good':
      return '良好'
    case 'fair':
      return '一般'
    case 'poor':
      return '较差'
    case 'offline':
      return '离线'
    default:
      return '未知'
  }
}

function destroy() {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  stopQualityCheck()
  listeners.clear()
}

module.exports = {
  init,
  destroy,
  isOnline,
  getQuality,
  addNetworkListener,
  calculateReconnectDelay,
  getQualityIcon,
  getQualityText,
  startQualityCheck,
  stopQualityCheck
}
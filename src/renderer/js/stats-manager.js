let stats = {
  connectionStartTime: null,
  totalConnections: 0,
  totalDataSent: 0,
  totalDataReceived: 0,
  currentSession: {
    startTime: null,
    dataSent: 0,
    dataReceived: 0,
    frameCount: 0,
    avgFrameRate: 0,
    latency: []
  }
}

const listeners = new Set()

function addStatsListener(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifyListeners() {
  const currentStats = getStats()
  listeners.forEach(callback => {
    try {
      callback(currentStats)
    } catch (error) {
      console.error('统计监听器错误:', error)
    }
  })
}

function startSession() {
  stats.currentSession = {
    startTime: Date.now(),
    dataSent: 0,
    dataReceived: 0,
    frameCount: 0,
    avgFrameRate: 0,
    latency: []
  }
  stats.connectionStartTime = Date.now()
  stats.totalConnections++
  notifyListeners()
}

function endSession() {
  if (stats.currentSession.startTime) {
    stats.totalDataSent += stats.currentSession.dataSent
    stats.totalDataReceived += stats.currentSession.dataReceived
  }
  stats.currentSession = {
    startTime: null,
    dataSent: 0,
    dataReceived: 0,
    frameCount: 0,
    avgFrameRate: 0,
    latency: []
  }
  notifyListeners()
}

function recordDataSent(bytes) {
  stats.currentSession.dataSent += bytes
  notifyListeners()
}

function recordDataReceived(bytes) {
  stats.currentSession.dataReceived += bytes
  notifyListeners()
}

function recordFrame() {
  stats.currentSession.frameCount++
  
  if (stats.currentSession.startTime) {
    const elapsed = (Date.now() - stats.currentSession.startTime) / 1000
    stats.currentSession.avgFrameRate = Math.round(stats.currentSession.frameCount / elapsed)
  }
  notifyListeners()
}

function recordLatency(ms) {
  stats.currentSession.latency.push(ms)
  if (stats.currentSession.latency.length > 100) {
    stats.currentSession.latency.shift()
  }
  notifyListeners()
}

function getAverageLatency() {
  const latency = stats.currentSession.latency
  if (latency.length === 0) return 0
  const sum = latency.reduce((a, b) => a + b, 0)
  return Math.round(sum / latency.length)
}

function getMaxLatency() {
  const latency = stats.currentSession.latency
  if (latency.length === 0) return 0
  return Math.max(...latency)
}

function getMinLatency() {
  const latency = stats.currentSession.latency
  if (latency.length === 0) return 0
  return Math.min(...latency)
}

function getSessionDuration() {
  if (!stats.currentSession.startTime) return 0
  return Date.now() - stats.currentSession.startTime
}

function getStats() {
  return {
    ...stats,
    currentSession: {
      ...stats.currentSession,
      duration: getSessionDuration(),
      avgLatency: getAverageLatency(),
      maxLatency: getMaxLatency(),
      minLatency: getMinLatency()
    }
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分${seconds % 60}秒`
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  } else {
    return `${seconds}秒`
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFormattedStats() {
  const s = getStats()
  return {
    sessionDuration: formatDuration(s.currentSession.duration || 0),
    dataSent: formatBytes(s.currentSession.dataSent),
    dataReceived: formatBytes(s.currentSession.dataReceived),
    avgFrameRate: s.currentSession.avgFrameRate,
    avgLatency: s.currentSession.avgLatency,
    maxLatency: s.currentSession.maxLatency,
    minLatency: s.currentSession.minLatency,
    totalConnections: s.totalConnections,
    totalDataSent: formatBytes(s.totalDataSent),
    totalDataReceived: formatBytes(s.totalDataReceived)
  }
}

function reset() {
  stats = {
    connectionStartTime: null,
    totalConnections: 0,
    totalDataSent: 0,
    totalDataReceived: 0,
    currentSession: {
      startTime: null,
      dataSent: 0,
      dataReceived: 0,
      frameCount: 0,
      avgFrameRate: 0,
      latency: []
    }
  }
  notifyListeners()
}

module.exports = {
  startSession,
  endSession,
  recordDataSent,
  recordDataReceived,
  recordFrame,
  recordLatency,
  getStats,
  getFormattedStats,
  getAverageLatency,
  getSessionDuration,
  addStatsListener,
  reset,
  formatDuration,
  formatBytes
}

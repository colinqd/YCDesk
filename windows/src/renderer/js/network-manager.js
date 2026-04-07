let online = navigator.onLine
let connectionQuality = 'unknown'

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

module.exports = {
  init,
  addNetworkListener,
  notifyListeners
}

let selectedMode = 'http'
let isServerRunning = false

const statusDot = document.getElementById('statusDot')
const statusText = document.getElementById('statusText')
const startBtn = document.getElementById('startBtn')
const stopBtn = document.getElementById('stopBtn')
const logBox = document.getElementById('logBox')
const modeHttp = document.getElementById('modeHttp')
const modeHttps = document.getElementById('modeHttps')
const certConfig = document.getElementById('certConfig')
const certPathInput = document.getElementById('certPath')
const keyPathInput = document.getElementById('keyPath')
const portInput = document.getElementById('port')

function log(message, type = 'info') {
  const entry = document.createElement('div')
  entry.className = 'log-entry'
  
  const timestamp = new Date().toLocaleTimeString()
  const typeClass = `log-type-${type}`
  
  entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="${typeClass}">${escapeHtml(message)}</span>`
  
  logBox.appendChild(entry)
  logBox.scrollTop = logBox.scrollHeight
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function updateStatus(running) {
  isServerRunning = running
  
  if (running) {
    statusDot.classList.add('running')
    statusText.textContent = '运行中'
    startBtn.disabled = true
    stopBtn.disabled = false
    modeHttp.style.pointerEvents = 'none'
    modeHttps.style.pointerEvents = 'none'
    modeHttp.style.opacity = '0.5'
    modeHttps.style.opacity = '0.5'
    portInput.disabled = true
  } else {
    statusDot.classList.remove('running')
    statusText.textContent = '未启动'
    startBtn.disabled = false
    stopBtn.disabled = true
    modeHttp.style.pointerEvents = 'auto'
    modeHttps.style.pointerEvents = 'auto'
    modeHttp.style.opacity = '1'
    modeHttps.style.opacity = '1'
    portInput.disabled = false
  }
}

async function selectCertFile() {
  const result = await window.serverAPI.selectCertFile()
  if (!result.canceled) {
    certPathInput.value = result.filePath
  }
}

async function selectKeyFile() {
  const result = await window.serverAPI.selectKeyFile()
  if (!result.canceled) {
    keyPathInput.value = result.filePath
  }
}

async function startServer() {
  const options = {
    useHttps: selectedMode === 'https',
    port: parseInt(portInput.value) || 3000,
    certPath: certPathInput.value,
    keyPath: keyPathInput.value
  }

  log('正在启动服务器...', 'info')
  
  const result = await window.serverAPI.startServer(options)
  
  if (result.success) {
    log('服务器启动命令已发送', 'info')
  } else {
    log('启动失败: ' + (result.error || '未知错误'), 'error')
  }
}

async function stopServer() {
  log('正在停止服务器...', 'info')
  await window.serverAPI.stopServer()
}

modeHttp.addEventListener('click', () => {
  if (isServerRunning) return
  
  selectedMode = 'http'
  modeHttp.classList.add('selected')
  modeHttps.classList.remove('selected')
  certConfig.classList.remove('show')
})

modeHttps.addEventListener('click', () => {
  if (isServerRunning) return
  
  selectedMode = 'https'
  modeHttps.classList.add('selected')
  modeHttp.classList.remove('selected')
  certConfig.classList.add('show')
})

window.serverAPI.onServerLog((data) => {
  log(data.message, data.type)
})

window.serverAPI.onServerStarted(() => {
  updateStatus(true)
  log('服务器已成功启动', 'info')
})

window.serverAPI.onServerStopped(() => {
  updateStatus(false)
  log('服务器已停止', 'info')
})

updateStatus(false)
log('YCDesk Server GUI 已就绪', 'info')
log('请选择启动模式并点击"启动服务器"', 'info')

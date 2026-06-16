const fs = require('fs')

const DIAG_WEBRTC_FILE = 'C:\\ProgramData\\YCDesk\\diag_webrtc.log'

function webrtcDiagLog(message) {
  try {
    if (!fs.existsSync('C:\\ProgramData\\YCDesk')) {
      fs.mkdirSync('C:\\ProgramData\\YCDesk', { recursive: true })
    }
    fs.appendFileSync(DIAG_WEBRTC_FILE, '[' + new Date().toISOString() + '] ' + message + '\n', 'utf8')
  } catch (e) {}
}

function getIceConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
}

function setupDataChannel(channel, log) {
  channel.onopen = () => {
    log('数据通道已打开')
  }

  channel.onmessage = (event) => {
    log('收到数据通道消息:', event.data)
    try {
      const data = JSON.parse(event.data)
      webrtcDiagLog('WebRTC收到: type=' + data.type + ' inputType=' + data.inputType + (data.inputType === 'text_input' ? ' text=' + (data.text || '').substring(0, 30) : ''))
      if (data.type === 'input' || data.inputType) {
        window.electronAPI.send('remote-input', data)
      }
    } catch (e) {
      webrtcDiagLog('WebRTC解析失败: ' + e.message)
      console.error('解析数据失败:', e)
    }
  }

  channel.onclose = () => {
    log('数据通道已关闭')
  }

  channel.onerror = (error) => {
    console.error('数据通道错误:', error)
  }
}

async function startScreenCapture(peerConnection, log) {
  try {
    const sources = await window.electronAPI.getSources()
    log('可用屏幕源:', sources)
    
    if (sources.length > 0) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      })

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
      })

      log('屏幕捕获成功')
    }
  } catch (error) {
    log('屏幕捕获失败: ' + error.message)
  }
}

module.exports = {
  getIceConfig,
  setupDataChannel,
  startScreenCapture
}

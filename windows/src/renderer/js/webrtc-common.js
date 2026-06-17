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
        const sender = peerConnection.addTrack(track, stream)
        // 配置编码参数以优化性能
        if (sender && sender.getParameters) {
          try {
            const params = sender.getParameters()
            if (params && params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = 2500000 // 2.5 Mbps
              params.encodings[0].maxFramerate = 30
              params.encodings[0].scaleResolutionDownBy = 1
              params.encodings[0].networkPriority = 'high'
              // 优先保流畅度
              params.degradationPreference = 'maintain-framerate'
              sender.setParameters(params).catch(function(e) {
                // 某些浏览器不支持，静默忽略
              })
            }
          } catch (e) {
            // setParameters 在某些平台上不支持
          }
        }
      })

      // 设置编码器偏好：优先 H.264 硬件编码
      try {
        const transceivers = peerConnection.getTransceivers()
        for (const transceiver of transceivers) {
          if (transceiver.sender && transceiver.sender.track
              && transceiver.sender.track.kind === 'video') {
            const codecs = RTCRtpSender.getCapabilities
              ? RTCRtpSender.getCapabilities('video')
              : null
            if (codecs && codecs.codecs) {
              // 按优先级排序：H.264 > VP8 > VP9
              const preferred = ['H264', 'H.264', 'VP8', 'VP9']
              const sorted = codecs.codecs.filter(function(c) {
                return preferred.some(function(p) {
                  return c.mimeType.indexOf(p) !== -1
                })
              })
              if (sorted.length > 0) {
                transceiver.setCodecPreferences(sorted)
              }
            }
          }
        }
      } catch (e) {
        // setCodecPreferences 在某些浏览器中不支持
      }

      log('屏幕捕获成功 (H.264 优先, 2.5Mbps)')
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

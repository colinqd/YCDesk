function getIceConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
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
  startScreenCapture
}

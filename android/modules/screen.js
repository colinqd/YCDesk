import s from './state.js'

function updateScreenSize(width, height, scaleFactor, workArea) {
    if (typeof window.log === 'function') window.log('收到远程屏幕尺寸: ' + width + 'x' + height + ', scaleFactor=' + scaleFactor);
    
    if (s.matrixTransformer) {
        s.matrixTransformer.setRemoteScreenSize(width, height);
        
        if (scaleFactor) {
            s.matrixTransformer.scaleFactor = scaleFactor;
        }
        if (workArea) {
            s.matrixTransformer.workArea = workArea;
        }
        
        const videoContainer = document.getElementById('videoContainer');
        const videoWrapper = document.getElementById('videoWrapper');
        const remoteVideo = document.getElementById('remoteVideo');
        const remoteScreen = document.getElementById('remoteScreen');
        
        if (videoContainer && videoWrapper && remoteScreen) {
            s.matrixTransformer.reset();
            
            const screenRect = remoteScreen.getBoundingClientRect();
            s.matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
            
            if (remoteVideo && remoteVideo.videoWidth > 0) {
                s.matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
                if (typeof window.log === 'function') window.log('使用视频尺寸: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
            } else {
                s.matrixTransformer.setVideoSize(width, height);
                if (typeof window.log === 'function') window.log('使用远程屏幕尺寸作为视频尺寸: ' + width + 'x' + height);
            }
            
            s.matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
            
            if (typeof window.log === 'function') window.log('调整 videoContainer: ' + s.matrixTransformer.displayWidth + 'x' + s.matrixTransformer.displayHeight +
                ', 位置 (' + s.matrixTransformer.displayX + ', ' + s.matrixTransformer.displayY + ')');
            
            [100, 300, 500, 1000].forEach(delay => {
                setTimeout(() => {
                    if (remoteVideo && remoteVideo.videoWidth > 0) {
                        s.matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
                        s.matrixTransformer.setScreenSize(remoteScreen.getBoundingClientRect().width, remoteScreen.getBoundingClientRect().height);
                        s.matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
                        if (typeof window.log === 'function') window.log('延迟' + delay + 'ms重构容器尺寸: ' + s.matrixTransformer.displayWidth + 'x' + s.matrixTransformer.displayHeight);
                    }
                }, delay);
            });
        }
    }
}

function showRemoteScreen() {
  if (s.matrixTransformer) {
      s.matrixTransformer.fullReset();
  }
  
  document.getElementById('mainContainer').style.display = 'none'
  document.getElementById('remoteScreen').classList.add('active')
  startStatsMonitoring()
  
  setTimeout(() => {
      if (typeof window.setupRemoteScreenInteraction === 'function') window.setupRemoteScreenInteraction();
      setTimeout(() => {
          updateContainerSizeAfterVideoLoad();
      }, 500);
  }, 100);
}

function updateContainerSizeAfterVideoLoad() {
  if (typeof window.log === 'function') window.log('更新容器尺寸（视频加载后）');
  const remoteVideo = document.getElementById('remoteVideo');
  const videoContainer = document.getElementById('videoContainer');
  const videoWrapper = document.getElementById('videoWrapper');
  const remoteScreen = document.getElementById('remoteScreen');
  
  if (!remoteVideo || !videoContainer || !videoWrapper || !remoteScreen) {
      if (typeof window.log === 'function') window.log('缺少必要元素，跳过尺寸更新');
      return;
  }
  
  const screenRect = remoteScreen.getBoundingClientRect();
  if (s.matrixTransformer) {
      s.matrixTransformer.setScreenSize(screenRect.width, screenRect.height);
      
      if (remoteVideo.videoWidth > 0 && remoteVideo.videoHeight > 0) {
          s.matrixTransformer.setVideoSize(remoteVideo.videoWidth, remoteVideo.videoHeight);
          if (typeof window.log === 'function') window.log('视频尺寸: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
      }
      
      s.matrixTransformer.applyContainerSize(videoContainer, videoWrapper);
      if (typeof window.log === 'function') window.log('容器尺寸已更新: ' + s.matrixTransformer.displayWidth + 'x' + s.matrixTransformer.displayHeight);
  }
}

function hideRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'block'
  document.getElementById('remoteScreen').classList.remove('active')
  const remoteVideo = document.getElementById('remoteVideo')
  remoteVideo.srcObject = null
  s.isDirectControllerMode = false
  s.isWaitingRenegotiation = false
  stopStatsMonitoring()
}

function startStatsMonitoring() {
  if (s.statsInterval) {
    clearInterval(s.statsInterval)
  }
  
  s.statsInterval = setInterval(async () => {
    const pc = s.directPeerConnection || s.peerConnection
    if (!pc) return
    
    try {
      const stats = await pc.getStats()
      let videoStats = null
      let candidatePairStats = null
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          videoStats = report
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          candidatePairStats = report
        }
      })
      
      if (videoStats) {
        const width = videoStats.frameWidth || 0
        const height = videoStats.frameHeight || 0
        const fps = videoStats.framesPerSecond || 0
        const bitrate = videoStats.bytesReceived || 0
        
        document.getElementById('statsResolution').textContent = 
          width > 0 ? `${width}x${height}` : '-'
        document.getElementById('statsFps').textContent = 
          fps > 0 ? `${fps} fps` : '-'
        
        if (videoStats.lastStatsTime) {
          const timeDiff = (Date.now() - videoStats.lastStatsTime) / 1000
          const bytesDiff = bitrate - (videoStats.lastBytesReceived || 0)
          const bitrateMbps = ((bytesDiff * 8) / timeDiff / 1000000).toFixed(2)
          document.getElementById('statsBitrate').textContent = `${bitrateMbps} Mbps`
        }
        
        videoStats.lastStatsTime = Date.now()
        videoStats.lastBytesReceived = bitrate
      }
      
      if (candidatePairStats) {
        const rtt = candidatePairStats.currentRoundTripTime
        if (rtt !== undefined) {
          const latencyMs = (rtt * 1000).toFixed(0)
          document.getElementById('statsLatency').textContent = `${latencyMs} ms`
        }
      }
    } catch (error) {
      console.error('获取统计信息失败:', error)
    }
  }, 1000)
}

function stopStatsMonitoring() {
  if (s.statsInterval) {
    clearInterval(s.statsInterval)
    s.statsInterval = null
  }
}

export {
  updateScreenSize,
  showRemoteScreen,
  updateContainerSizeAfterVideoLoad,
  hideRemoteScreen,
  startStatsMonitoring,
  stopStatsMonitoring
}

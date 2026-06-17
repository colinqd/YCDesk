(function () {
  var logEntries = []
  var frameCount = 0
  var lastFpsTime = performance.now()
  var clickIndicator = null
  var debugLogVisible = false

  window.UIState = {
    log: function (message) {
      var timestamp = new Date().toLocaleTimeString()
      var logMessage = '[' + timestamp + '] ' + message
      console.log(logMessage)
      logEntries.push(logMessage)

      var debugLogContent = document.getElementById('debugLogContent')
      if (debugLogContent) {
        var div = document.createElement('div')
        div.textContent = logMessage
        debugLogContent.appendChild(div)
        debugLogContent.scrollTop = debugLogContent.scrollHeight
      }
    },

    copyAllLogs: function () {
      var debugLogContent = document.getElementById('debugLogContent')
      if (debugLogContent) {
        var text = Array.from(debugLogContent.children).map(function (el) { return el.textContent }).join('\n')
        navigator.clipboard.writeText(text).catch(function (err) { console.error('复制失败:', err) })
      }
    },

    copySelectedLogs: function () {
      var selectedText = window.getSelection().toString()
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).catch(function (err) { console.error('复制失败:', err) })
      }
    },

    clearLogs: function () {
      var debugLogContent = document.getElementById('debugLogContent')
      if (debugLogContent) { debugLogContent.innerHTML = '' }
      logEntries = []
    },

    toggleFullscreen: function () {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
      } else {
        document.exitFullscreen()
      }
    },

    toggleDebugLog: function () {
      var debugLog = document.getElementById('debugLog')
      if (debugLog) {
        debugLogVisible = !debugLogVisible
        debugLog.style.display = debugLogVisible ? 'block' : 'none'
      }
    },

    updateStatus: function (text, state) {
      var statusText = document.getElementById('statusText')
      var dot = document.getElementById('statusDot')
      if (!statusText || !dot) return
      statusText.textContent = text
      dot.className = 'status-dot'
      if (state === 'error') dot.classList.add('error')
      else if (state === 'connecting') dot.classList.add('connecting')
    },

    showPlaceholder: function (text, subtext) {
      var placeholder = document.getElementById('placeholder')
      var video = document.getElementById('screenVideo')
      if (!placeholder) return
      placeholder.style.display = 'flex'
      if (video) video.style.display = 'none'
      var textEl = document.querySelector('.placeholder-text')
      var subtextEl = document.getElementById('subtext')
      if (textEl) textEl.textContent = text
      if (subtextEl) subtextEl.textContent = subtext || ''
    },

    showVideo: function (videoElement, matrixTransformer) {
      var placeholder = document.getElementById('placeholder')
      if (placeholder) placeholder.style.display = 'none'
      if (videoElement) {
        videoElement.style.display = 'block'
        if (videoElement.videoWidth && videoElement.videoHeight) {
          var resEl = document.getElementById('resolution')
          if (resEl) resEl.textContent = videoElement.videoWidth + 'x' + videoElement.videoHeight
          if (matrixTransformer) {
            matrixTransformer.setRemoteScreenSize(videoElement.videoWidth, videoElement.videoHeight)
          }
        }
        if (videoElement.srcObject) {
          videoElement.play().catch(function (err) {
            window.UIState && window.UIState.log('Video play failed: ' + err.message)
          })
        }
      }
    },

    showClickIndicator: function (clientX, clientY) {
      if (!clickIndicator) {
        clickIndicator = document.getElementById('clickIndicator')
        if (!clickIndicator) return
      }
      var videoWrapper = document.getElementById('videoWrapper')
      if (!videoWrapper) return
      var rect = videoWrapper.getBoundingClientRect()
      clickIndicator.style.left = (clientX - rect.left) + 'px'
      clickIndicator.style.top = (clientY - rect.top) + 'px'
      clickIndicator.classList.add('show')
      setTimeout(function () { clickIndicator.classList.remove('show') }, 300)
    },

    updateFps: function () {
      frameCount++
      var now = performance.now()
      var elapsed = (now - lastFpsTime) / 1000
      if (elapsed >= 1) {
        var fps = Math.round(frameCount / elapsed)
        var fpsEl = document.getElementById('fps')
        if (fpsEl) fpsEl.textContent = fps + ' fps'
        frameCount = 0
        lastFpsTime = now
      }
    },

    startFpsMonitor: function () {
      var self = this
      function loop() {
        self.updateFps()
        requestAnimationFrame(loop)
      }
      loop()
    }
  }
})()
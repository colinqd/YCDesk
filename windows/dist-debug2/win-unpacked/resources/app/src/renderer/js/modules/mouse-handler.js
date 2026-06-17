(function () {
  var MOUSE_MOVE_CONFIG = {
    MIN_INTERVAL_MS: 8,
    MIN_DISTANCE_PX: 1,
    IDLE_TIMEOUT_MS: 100
  }

  var WHEEL_BATCH_INTERVAL_MS = 16

  window.MouseHandler = {
    _handlers: null,
    _timers: null,
    _videoWrapper: null,
    _videoContainer: null,

    destroy: function () {
      // 清除定时器
      if (this._timers) {
        if (this._timers.moveSendTimer) { clearInterval(this._timers.moveSendTimer); this._timers.moveSendTimer = null }
        if (this._timers.idleTimer) { clearTimeout(this._timers.idleTimer); this._timers.idleTimer = null }
        if (this._timers.wheelSendTimer) { clearTimeout(this._timers.wheelSendTimer); this._timers.wheelSendTimer = null }
      }
      // 移除事件监听器
      if (this._handlers && this._videoWrapper) {
        this._videoWrapper.removeEventListener('mousedown', this._handlers.mousedown)
        this._videoWrapper.removeEventListener('mousemove', this._handlers.mousemove)
        this._videoWrapper.removeEventListener('mouseup', this._handlers.mouseup)
        this._videoWrapper.removeEventListener('wheel', this._handlers.wheel)
        this._videoWrapper.removeEventListener('mouseleave', this._handlers.mouseleave)
        this._videoWrapper.removeEventListener('contextmenu', this._handlers.contextmenu)
      }
      if (this._handlers && this._handlers.visibility) {
        document.removeEventListener('visibilitychange', this._handlers.visibility)
      }
      this._handlers = null
      this._timers = null
      this._videoWrapper = null
      this._videoContainer = null
    },

    setup: function (videoWrapper, videoContainer, getMatrixTransformer, getConnectionManager) {
      // 先清理旧的
      this.destroy()

      if (!videoWrapper || !videoContainer) return

      this._videoWrapper = videoWrapper
      this._videoContainer = videoContainer

      var lastMoveTime = 0, lastMoveX = 0, lastMoveY = 0
      var accumulatedDeltaX = 0, accumulatedDeltaY = 0
      var sequenceId = 0
      var accumulatedWheelDeltaY = 0, accumulatedWheelDeltaX = 0
      var lastWheelRatioX = 0.5, lastWheelRatioY = 0.5
      var isMouseDownOnVideo = false

      this._timers = { moveSendTimer: null, idleTimer: null, wheelSendTimer: null }
      var timers = this._timers

      function getMt() { return typeof getMatrixTransformer === 'function' ? getMatrixTransformer() : getMatrixTransformer }
      function getCm() { return typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager }

      function flushMouseDelta() {
        if (accumulatedDeltaX === 0 && accumulatedDeltaY === 0) return
        var cm = getCm()
        if (!cm) return
        var inputCommand = window.createInputCommand(window.INPUT_TYPES.MOUSE_MOVE_DELTA, {
          dx: Math.round(accumulatedDeltaX),
          dy: Math.round(accumulatedDeltaY),
          sequenceId: sequenceId++
        })
        var result = cm.sendInput(inputCommand)
        if (!result || !result.sent) {
          // 输入命令无法发送，保留累积值等待下次尝试
          return
        }
        accumulatedDeltaX = 0
        accumulatedDeltaY = 0
        lastMoveTime = Date.now()
      }

      function flushWheelAccumulated() {
        if (accumulatedWheelDeltaY === 0 && accumulatedWheelDeltaX === 0) return
        var cm = getCm()
        if (!cm) return
        var inputCommand = window.createInputCommand(window.INPUT_TYPES.MOUSE_WHEEL_BATCH, {
          accumulatedDeltaY: accumulatedWheelDeltaY,
          accumulatedDeltaX: accumulatedWheelDeltaX,
          x: lastWheelRatioX, y: lastWheelRatioY
        })
        var result = cm.sendInput(inputCommand)
        if (!result || !result.sent) return
        accumulatedWheelDeltaY = 0
        accumulatedWheelDeltaX = 0
      }

      this._handlers = {
        mousedown: function (e) {
          if (e.button === 1) return
          window.UIState && window.UIState.showClickIndicator(e.clientX, e.clientY)
          flushMouseDelta()
          flushWheelAccumulated()

          var mt = getMt()
          if (!mt) return

          var containerRect = videoContainer.getBoundingClientRect()
          var localX = e.clientX - containerRect.left
          var localY = e.clientY - containerRect.top

          if (localX >= 0 && localX <= containerRect.width &&
              localY >= 0 && localY <= containerRect.height) {
            var ratioX = localX / containerRect.width
            var ratioY = localY / containerRect.height
            isMouseDownOnVideo = true
            lastMoveX = ratioX
            lastMoveY = ratioY

            var cm = getCm()
            if (!cm) return
            var inputCommand = window.createInputCommand(window.INPUT_TYPES.MOUSE_DOWN, {
              button: e.button,
              x: Math.max(0, Math.min(1, ratioX)),
              y: Math.max(0, Math.min(1, ratioY))
            })
            cm.sendInput(inputCommand)
          }
        },

        mousemove: function (e) {
          if (window.isDragging) return
          var mt = getMt()
          if (!mt) return

          if (timers.idleTimer) { clearTimeout(timers.idleTimer); timers.idleTimer = null }

          var containerRect = videoContainer.getBoundingClientRect()
          var ratioX = (e.clientX - containerRect.left) / containerRect.width
          var ratioY = (e.clientY - containerRect.top) / containerRect.height

          var remoteDeltaX = (ratioX - lastMoveX) * mt.remoteScreenWidth
          var remoteDeltaY = (ratioY - lastMoveY) * mt.remoteScreenHeight

          accumulatedDeltaX += remoteDeltaX
          accumulatedDeltaY += remoteDeltaY

          var now = Date.now()
          var timeSinceLastMove = now - lastMoveTime
          var distance = Math.sqrt(remoteDeltaX * remoteDeltaX + remoteDeltaY * remoteDeltaY)

          lastMoveX = ratioX
          lastMoveY = ratioY

          if (timeSinceLastMove >= MOUSE_MOVE_CONFIG.MIN_INTERVAL_MS &&
              distance >= MOUSE_MOVE_CONFIG.MIN_DISTANCE_PX) {
            flushMouseDelta()
          }

          if (!timers.moveSendTimer) {
            timers.moveSendTimer = setInterval(function () {
              if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) flushMouseDelta()
            }, MOUSE_MOVE_CONFIG.MIN_INTERVAL_MS)
          }

          timers.idleTimer = setTimeout(function () {
            if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) flushMouseDelta()
            if (timers.moveSendTimer) { clearInterval(timers.moveSendTimer); timers.moveSendTimer = null }
            timers.idleTimer = null
          }, MOUSE_MOVE_CONFIG.IDLE_TIMEOUT_MS)
        },

        mouseup: function (e) {
          if (e.button === 1) return
          flushMouseDelta()
          flushWheelAccumulated()
          if (!isMouseDownOnVideo || !getMt()) return
          isMouseDownOnVideo = false

          var containerRect = videoContainer.getBoundingClientRect()
          var localX = Math.max(0, Math.min(containerRect.width, e.clientX - containerRect.left))
          var localY = Math.max(0, Math.min(containerRect.height, e.clientY - containerRect.top))
          var ratioX = localX / containerRect.width
          var ratioY = localY / containerRect.height

          var cm = getCm()
          if (!cm) return
          var inputCommand = window.createInputCommand(window.INPUT_TYPES.MOUSE_UP, {
            button: e.button, x: ratioX, y: ratioY
          })
          cm.sendInput(inputCommand)
        },

        wheel: function (e) {
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); return }
          e.preventDefault()
          var mt = getMt()
          if (!mt) return

          var containerRect = videoContainer.getBoundingClientRect()
          var ratioX = (e.clientX - containerRect.left) / containerRect.width
          var ratioY = (e.clientY - containerRect.top) / containerRect.height

          accumulatedWheelDeltaY += e.deltaY
          accumulatedWheelDeltaX += e.deltaX || 0
          lastWheelRatioX = ratioX
          lastWheelRatioY = ratioY

          if (timers.wheelSendTimer) clearTimeout(timers.wheelSendTimer)
          timers.wheelSendTimer = setTimeout(function () {
            if (accumulatedWheelDeltaY !== 0 || accumulatedWheelDeltaX !== 0) {
              var cm = getCm()
              if (!cm) return
              var inputCommand = window.createInputCommand(window.INPUT_TYPES.MOUSE_WHEEL_BATCH, {
                accumulatedDeltaY: accumulatedWheelDeltaY,
                accumulatedDeltaX: accumulatedWheelDeltaX,
                x: ratioX, y: ratioY
              })
              cm.sendInput(inputCommand)
              accumulatedWheelDeltaY = 0
              accumulatedWheelDeltaX = 0
            }
            timers.wheelSendTimer = null
          }, WHEEL_BATCH_INTERVAL_MS)
        },

        mouseleave: function () {
          isMouseDownOnVideo = false
          if (timers.moveSendTimer) { clearInterval(timers.moveSendTimer); timers.moveSendTimer = null }
          if (timers.idleTimer) { clearTimeout(timers.idleTimer); timers.idleTimer = null }
          flushMouseDelta()
        },

        contextmenu: function (e) { e.preventDefault() },

        visibility: function () {
          if (document.hidden) {
            if (timers.moveSendTimer) { clearInterval(timers.moveSendTimer); timers.moveSendTimer = null }
            if (timers.idleTimer) { clearTimeout(timers.idleTimer); timers.idleTimer = null }
          }
        }
      }

      // 注册事件监听器
      videoWrapper.addEventListener('mousedown', this._handlers.mousedown)
      videoWrapper.addEventListener('mousemove', this._handlers.mousemove)
      videoWrapper.addEventListener('mouseup', this._handlers.mouseup)
      videoWrapper.addEventListener('wheel', this._handlers.wheel, { passive: false })
      videoWrapper.addEventListener('mouseleave', this._handlers.mouseleave)
      videoWrapper.addEventListener('contextmenu', this._handlers.contextmenu)
      document.addEventListener('visibilitychange', this._handlers.visibility)
    }
  }
})()
(function () {
  var MOUSE_MOVE_CONFIG = {
    MIN_INTERVAL_MS: 8,
    MIN_DISTANCE_PX: 1,
    IDLE_TIMEOUT_MS: 100
  }

  var WHEEL_BATCH_INTERVAL_MS = 16

  window.MouseHandler = {
    setup: function (videoWrapper, videoContainer, getMatrixTransformer, getConnectionManager) {
      if (!videoWrapper || !videoContainer) return

      var lastMoveTime = 0, lastMoveX = 0, lastMoveY = 0
      var accumulatedDeltaX = 0, accumulatedDeltaY = 0
      var moveSendTimer = null, idleTimer = null
      var sequenceId = 0
      var accumulatedWheelDeltaY = 0, accumulatedWheelDeltaX = 0
      var wheelSendTimer = null
      var isMouseDownOnVideo = false

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
        cm.sendInput(inputCommand)
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
          x: 0.5, y: 0.5
        })
        cm.sendInput(inputCommand)
        accumulatedWheelDeltaY = 0
        accumulatedWheelDeltaX = 0
      }

      videoWrapper.addEventListener('mousedown', function (e) {
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
      })

      videoWrapper.addEventListener('mousemove', function (e) {
        if (window.isDragging) return
        var mt = getMt()
        if (!mt) return

        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }

        var containerRect = videoContainer.getBoundingClientRect()
        var ratioX = (e.clientX - containerRect.left) / containerRect.width
        var ratioY = (e.clientY - containerRect.top) / containerRect.height

        var remoteDeltaX = (ratioX - lastMoveX) * mt.remoteScreenWidth
        var remoteDeltaY = (ratioY - lastMoveY) * mt.remoteScreenHeight

        accumulatedDeltaX += remoteDeltaX
        accumulatedDeltaY += remoteDeltaY
        lastMoveX = ratioX
        lastMoveY = ratioY

        var now = Date.now()
        var timeSinceLastMove = now - lastMoveTime
        var distance = Math.sqrt(Math.pow(ratioX - lastMoveX, 2) + Math.pow(ratioY - lastMoveY, 2))

        if (timeSinceLastMove >= MOUSE_MOVE_CONFIG.MIN_INTERVAL_MS &&
            distance >= MOUSE_MOVE_CONFIG.MIN_DISTANCE_PX) {
          flushMouseDelta()
        }

        if (!moveSendTimer) {
          moveSendTimer = setInterval(function () {
            if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) flushMouseDelta()
          }, MOUSE_MOVE_CONFIG.MIN_INTERVAL_MS)
        }

        idleTimer = setTimeout(function () {
          if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) flushMouseDelta()
          idleTimer = null
        }, MOUSE_MOVE_CONFIG.IDLE_TIMEOUT_MS)
      })

      videoWrapper.addEventListener('mouseup', function (e) {
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
      })

      videoWrapper.addEventListener('wheel', function (e) {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); return }
        e.preventDefault()
        var mt = getMt()
        if (!mt) return

        var containerRect = videoContainer.getBoundingClientRect()
        var ratioX = (e.clientX - containerRect.left) / containerRect.width
        var ratioY = (e.clientY - containerRect.top) / containerRect.height

        accumulatedWheelDeltaY += e.deltaY
        accumulatedWheelDeltaX += e.deltaX || 0

        if (wheelSendTimer) clearTimeout(wheelSendTimer)
        wheelSendTimer = setTimeout(function () {
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
          wheelSendTimer = null
        }, WHEEL_BATCH_INTERVAL_MS)
      }, { passive: false })

      videoWrapper.addEventListener('mouseleave', function () { isMouseDownOnVideo = false })
      videoWrapper.addEventListener('contextmenu', function (e) { e.preventDefault() })
    }
  }
})()
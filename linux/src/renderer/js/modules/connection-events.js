(function () {
  window.ConnectionEvents = {
    setupConnectionManagerEvents: function (connectionManager, matrixTransformer, videoElement) {
      connectionManager.on('log', function (message) { window.UIState && window.UIState.log(message) })

      connectionManager.on('error', function (data) {
        window.UIState && window.UIState.log('错误: ' + data.message)
        window.UIState && window.UIState.updateStatus('连接错误', 'error')
      })

      connectionManager.on('latency', function (latency) {
        var el = document.getElementById('latency')
        if (el) el.textContent = latency + ' ms'
      })

      connectionManager.on('video-metadata', function () {
        window.UIState && window.UIState.log('video-metadata 事件触发')
        window.UIState && window.UIState.showVideo(videoElement, matrixTransformer)
        window.UIState && window.UIState.updateStatus('已连接')
        window.UIState && window.UIState.startFpsMonitor()
        window.setupInputEvents && window.setupInputEvents()
        if (connectionManager && connectionManager.startLatencyCheck) {
          connectionManager.startLatencyCheck()
        }
      })

      connectionManager.on('video-ready', function () {})

      connectionManager.on('data-channel-open', function () {
        ConnectionEvents.initAuxiliaryChannels(connectionManager)
        ConnectionEvents.initOptimizedVideoChannel(videoElement, connectionManager)
      })

      connectionManager.on('auxiliary-channel-ready', function () {})
      connectionManager.on('auxiliary-channel-error', function () {})

      connectionManager.on('unlock-state-changed', function (data) {
        window.UIState && window.UIState.log('收到被控端锁屏状态变更: ' + JSON.stringify(data))
        var vc = document.getElementById('videoContainer')
        if (data.isLocked) {
          window.UIState && window.UIState.updateStatus('已锁定', 'error')
          if (window.unlockUI) window.unlockUI.showOverlay()
          if (vc) vc.classList.add('video-frozen')
        } else {
          window.UIState && window.UIState.updateStatus('已连接')
          if (window.unlockUI) window.unlockUI.hideOverlay()
          if (vc) vc.classList.remove('video-frozen')
          setTimeout(function () { ConnectionEvents.requestVideoRefresh() }, 500)
        }
      })

      connectionManager.stateMachine.addListener(function (newState, oldState, data) {
        var stateEl = document.getElementById('connectionState')
        if (stateEl) stateEl.textContent = newState
        switch (newState) {
          case 'connecting':
            window.UIState && window.UIState.updateStatus('正在连接...', 'connecting')
            window.UIState && window.UIState.showPlaceholder('正在建立连接...', '请稍候')
            break
          case 'authenticating':
            window.UIState && window.UIState.showPlaceholder('正在验证身份...', '请稍候')
            break
          case 'resolution-negotiating':
            window.UIState && window.UIState.showPlaceholder('正在协商分辨率...', '请稍候')
            break
          case 'waiting-video':
            window.UIState && window.UIState.showPlaceholder('等待视频流...', '请稍候')
            break
          case 'connected':
            window.UIState && window.UIState.updateStatus('已连接')
            break
          case 'error':
            window.UIState && window.UIState.updateStatus('连接失败', 'error')
            window.UIState && window.UIState.showPlaceholder('连接失败', data && data.error ? data.error : '未知错误')
            break
        }
      })
    },

    initOptimizedVideoChannel: function (videoElement, connectionManager) {
      var remoteVideoHandler = window.remoteVideoHandler
      if (!remoteVideoHandler || !connectionManager || !connectionManager.peerConnection) return
      var optimizedCanvas = document.getElementById('optimizedCanvas')
      if (!optimizedCanvas) return

      remoteVideoHandler.initialize(videoElement, optimizedCanvas, connectionManager.peerConnection)

      connectionManager.peerConnection.ondatachannel = function (event) {
        if (event.channel.label === 'optimized-video') {
          window.UIState && window.UIState.log('收到优化视频数据通道')
          remoteVideoHandler.setupDataChannel(event.channel)
        }
      }
    },

    initAuxiliaryChannels: function (connectionManager) {
      window.auxiliaryChannelManager = new window.AuxiliaryChannelManager({ logger: { log: function (m) { window.UIState && window.UIState.log(m) }, error: console.error } })
      window.auxiliaryChannelManager.setPeerConnection(connectionManager.peerConnection)
      window.auxiliaryChannelManager.setDataChannelManager(connectionManager.dataChannelManager)

      window.fallbackHandler = new window.FallbackHandler({ logger: { log: function (m) { window.UIState && window.UIState.log(m) }, error: console.error } })
      window.fallbackHandler.setAuxiliaryChannelManager(window.auxiliaryChannelManager)

      window.auxiliaryChannelManager.on('channel-ready', function (data) { ConnectionEvents._updateAuxStatus(data.type, 'ready') })
      window.auxiliaryChannelManager.on('channel-closed', function (data) { ConnectionEvents._updateAuxStatus(data.type, 'closed') })

      window.auxiliaryChannelManager.on('clipboard-sync', function (content) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(content).catch(function () {})
        }
      })

      window.fallbackHandler.on('fallback-executed', function (data) { ConnectionEvents._updateAuxStatus(data.channelType, 'fallback') })
      window.fallbackHandler.on('retry-success', function (data) { ConnectionEvents._updateAuxStatus(data.channelType, 'ready') })

      window.auxiliaryChannelManager.loadAllParallel([window.AuxiliaryChannelType.CLIPBOARD])
    },

    _updateAuxStatus: function (channelType, status) {
      var el = document.getElementById('auxiliaryStatus')
      if (!el) return
      try {
        var statuses = JSON.parse(el.textContent || '{}')
        statuses[channelType] = status
        el.textContent = JSON.stringify(statuses)
      } catch (e) {}
    },

    requestVideoRefresh: function () {
      var cm = window.connectionManager
      if (!cm || !cm.dataChannelManager || !cm.dataChannelManager.isOpen()) return
      cm.dataChannelManager.send({ type: 'video-refresh-request', timestamp: Date.now() })
    }
  }
})()

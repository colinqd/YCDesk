/**
 * YCDesk File Transfer UI Manager
 * 
 * 文件传输管理器 —— 渲染进程
 * 负责：
 * - 发送文件（选择文件、分块读取、发送、追踪进度）
 * - 接收文件（接收 offer、确认、写入、进度显示）
 * - UI 渲染（进度面板、toast 通知）
 */

;(function () {
  var CHUNK_SIZE = 16 * 1024 // 16KB

  var FileTransferManager = {
    // 传输队列
    _sendQueue: [],
    _receiveQueue: [],
    _activeSend: null,
    _activeReceive: null,
    _isSending: false,
    _isReceiving: false,
    _pendingDownloadRequest: false,
    _downloadRequestTimer: null,

    /**
     * 初始化文件传输管理器
     */
    init: function () {
      this._setupUI()
      this._setupDragDrop()
      this._setupToolbarButton()
      this._setupDownloadButton()
      this._setupChannelListeners()
      window.UIState && window.UIState.log('文件传输管理器已初始化')
    },

    /**
     * 发送文件 —— 由工具栏按钮触发
     */
    sendFiles: function () {
      var self = this
      if (!window.electronAPI || !window.electronAPI.fileTransferSelectFiles) return

      window.electronAPI.fileTransferSelectFiles().then(function (result) {
        if (result.canceled || !result.files || result.files.length === 0) return

        result.files.forEach(function (file) {
          self._sendQueue.push(file)
          self._renderSendItem(file)
        })

        self._processSendQueue()
      }).catch(function (e) {
        window.UIState && window.UIState.log('文件选择失败: ' + e.message)
      })
    },

    /**
     * 从远程设备下载文件 —— 由"从远程下载"按钮触发
     */
    requestDownload: function () {
      if (!window.auxiliaryChannelManager || !window.auxiliaryChannelManager.isChannelReady(window.AuxiliaryChannelType.FILE_TRANSFER)) {
        window.UIState && window.UIState.log('文件传输通道不可用')
        return
      }

      this._pendingDownloadRequest = true
      if (this._downloadRequestTimer) {
        clearTimeout(this._downloadRequestTimer)
      }
      this._downloadRequestTimer = setTimeout(function () {
        this._pendingDownloadRequest = false
        this._downloadRequestTimer = null
      }.bind(this), 30000)

      window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
        action: 'file-request'
      })
      window.UIState && window.UIState.log('已发送文件下载请求')
    },

    /**
     * 处理发送队列
     */
    _processSendQueue: function () {
      var self = this
      if (this._isSending || this._sendQueue.length === 0) return

      this._isSending = true
      this._activeSend = this._sendQueue.shift()
      this._sendFileOffer(this._activeSend)
    },

    /**
     * 发送文件 offer
     */
    _sendFileOffer: function (file) {
      if (!window.auxiliaryChannelManager || !window.auxiliaryChannelManager.isChannelReady(window.AuxiliaryChannelType.FILE_TRANSFER)) {
        window.UIState && window.UIState.log('文件传输通道不可用')
        this._isSending = false
        return
      }

      window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
        action: 'file-offer',
        fileId: file.id,
        fileName: file.name,
        fileSize: file.size,
        totalChunks: file.totalChunks,
        chunkSize: CHUNK_SIZE,
        sha256: file.sha256
      })

      window.UIState && window.UIState.log('已发送文件传输请求: ' + file.name + ' (' + this._formatSize(file.size) + ')')
    },

    /**
     * 发送数据块
     */
    _sendChunks: function (file, startChunk) {
      var self = this
      var chunkIndex = startChunk || 0
      var totalChunks = file.totalChunks
      var chunkRetries = 0
      var MAX_CHUNK_RETRIES = 3
      var FILE_SEND_TIMEOUT = 5 * 60 * 1000  // 5分钟总超时
      var startTime = Date.now()

      function sendNext() {
        // 总超时检查
        if (Date.now() - startTime > FILE_SEND_TIMEOUT) {
          window.UIState && window.UIState.log('文件传输超时，已停止: ' + file.name)
          self._updateSendProgress(file.id, -1)  // -1 表示失败
          return
        }

        if (chunkIndex >= totalChunks) {
          window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
            action: 'file-complete',
            fileId: file.id,
            totalChunks: totalChunks
          })
          self._updateSendProgress(file.id, 100)
          return
        }

        // 单个块重试超限
        if (chunkRetries >= MAX_CHUNK_RETRIES) {
          window.UIState && window.UIState.log('文件块发送失败，已达最大重试次数: ' + file.name + ' (块#' + chunkIndex + ')')
          self._updateSendProgress(file.id, -1)
          return
        }

        var offset = chunkIndex * CHUNK_SIZE
        var size = Math.min(CHUNK_SIZE, file.size - offset)

        window.electronAPI.fileTransferReadChunk(file.path, offset, size).then(function (result) {
          if (!window.auxiliaryChannelManager || !window.auxiliaryChannelManager.isChannelReady(window.AuxiliaryChannelType.FILE_TRANSFER)) return

          window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
            action: 'file-chunk',
            fileId: file.id,
            chunkIndex: chunkIndex,
            data: result.data,
            bytesRead: result.bytesRead
          })

          var progress = Math.round(((chunkIndex + 1) / totalChunks) * 100)
          self._updateSendProgress(file.id, progress)

          chunkIndex++
          chunkRetries = 0  // 成功后重置重试计数
          setTimeout(sendNext, 0)
        }).catch(function (e) {
          window.UIState && window.UIState.log('文件读取失败: ' + e.message + '，重试 ' + (chunkRetries + 1) + '/' + MAX_CHUNK_RETRIES)
          chunkRetries++
          setTimeout(sendNext, 100)
        })
      }

      sendNext()
    },

    /**
     * 处理收到的文件传输消息
     */
    handleIncoming: function (data) {
      var self = this
      if (!data || !data.action) return

      switch (data.action) {
        case 'file-offer':
          this._handleFileOffer(data)
          break
        case 'file-accept':
          this._handleFileAccept(data)
          break
        case 'file-reject':
          this._handleFileReject(data)
          break
        case 'file-chunk':
          this._handleFileChunk(data)
          break
        case 'file-complete':
          this._handleFileComplete(data)
          break
        case 'file-chunk-ack':
          // 发送方收到 ack（当前简单实现不做逐个确认）
          break
      }
    },

    /**
     * 处理收到的文件 offer
     */
    _handleFileOffer: function (data) {
      var self = this
      var fileName = data.fileName
      var fileSize = this._formatSize(data.fileSize)

      if (this._pendingDownloadRequest) {
        this._acceptFile(data)
        return
      }

      this._showToast('收到文件: ' + fileName + ' (' + fileSize + ')', [
        { text: '接受', onClick: function () { self._acceptFile(data) } },
        { text: '拒绝', onClick: function () { self._rejectFile(data) } }
      ])
    },

    /**
     * 接受文件传输
     */
    _acceptFile: function (data) {
      var self = this
      if (!window.electronAPI || !window.electronAPI.fileTransferSaveFile) return

      window.electronAPI.fileTransferSaveFile({ suggestedName: data.fileName }).then(function (result) {
        if (result.canceled) {
          self._rejectFile(data)
          return
        }

        // 创建文件写入器
        window.electronAPI.fileTransferCreateWriter(data.fileId, result.savePath).then(function () {
          data.savePath = result.savePath
          data.expectedSha256 = data.sha256  // 保存用于后续哈希校验
          self._receiveQueue.push(data)
          self._renderReceiveItem(data)

          // 发送接受响应
          window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
            action: 'file-accept',
            fileId: data.fileId
          })

          self._processReceiveQueue()
        }).catch(function (e) {
          window.UIState && window.UIState.log('创建文件失败: ' + e.message)
        })
      })
    },

    /**
     * 拒绝文件传输
     */
    _rejectFile: function (data) {
      window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
        action: 'file-reject',
        fileId: data.fileId
      })
    },

    /**
     * 处理文件接受确认
     */
    _handleFileAccept: function (data) {
      if (this._activeSend && this._activeSend.id === data.fileId) {
        this._sendChunks(this._activeSend, 0)
      }
    },

    /**
     * 处理文件拒绝
     */
    _handleFileReject: function (data) {
      if (this._activeSend && this._activeSend.id === data.fileId) {
        this._updateSendProgress(data.fileId, -1)
        this._isSending = false
        this._activeSend = null
        this._processSendQueue()
      }
    },

    /**
     * 处理收到的文件块
     */
    _handleFileChunk: function (data) {
      var self = this
      if (!window.electronAPI || !window.electronAPI.fileTransferWriteChunk) return

      window.electronAPI.fileTransferWriteChunk(data.fileId, data.data, data.chunkIndex * CHUNK_SIZE).then(function () {
        if (data.totalChunks) {
          var progress = Math.round(((data.chunkIndex + 1) / data.totalChunks) * 100)
          self._updateReceiveProgress(data.fileId, progress)
        }
      }).catch(function (e) {
        window.UIState && window.UIState.log('写入文件块失败: ' + e.message)
      })
    },

    /**
     * 处理文件传输完成
     */
    _handleFileComplete: function (data) {
      var self = this
      var receiver = this._receiveQueue.find(function (r) { return r.fileId === data.fileId })

      if (receiver) {
        window.electronAPI.fileTransferCloseWriter(data.fileId, receiver.fileSize, receiver.expectedSha256).then(function (result) {
          self._updateReceiveProgress(data.fileId, 100)
          window.UIState && window.UIState.log('文件接收完成: ' + receiver.fileName + ' -> ' + (result.savePath || receiver.savePath))

          // 通知对端
          if (window.auxiliaryChannelManager) {
            window.auxiliaryChannelManager.send(window.AuxiliaryChannelType.FILE_TRANSFER, {
              action: 'file-complete-ack',
              fileId: data.fileId,
              success: result.isValid
            })
          }

          // 接收完成 toast
          self._showToast('接收完成: ' + receiver.fileName, [
            { text: '打开文件夹', onClick: function () {
              var path = result.savePath || receiver.savePath
              if (window.electronAPI && window.electronAPI.fileTransferShowInFolder) {
                window.electronAPI.fileTransferShowInFolder(path)
              }
            }}
          ])

          self._removeFromReceiveQueue(data.fileId)
        })
      }
    },

    /**
     * 处理接收队列
     */
    _processReceiveQueue: function () {
      // 接收是被动的，不需要主动处理队列
    },

    _removeFromReceiveQueue: function (fileId) {
      this._receiveQueue = this._receiveQueue.filter(function (r) { return r.fileId !== fileId })
    },

    // ========== UI ==========

    _setupUI: function () {
      // 幂等性检查 —— 如果已存在则跳过
      if (document.getElementById('fileTransferPanel')) return

      // 创建文件传输进度面板
      var panel = document.createElement('div')
      panel.id = 'fileTransferPanel'
      panel.className = 'file-transfer-panel'
      panel.innerHTML = '' +
        '<div class="ftp-header">' +
        '  <span>文件传输</span>' +
        '  <button class="ftp-toggle" onclick="document.getElementById(\'fileTransferPanel\').classList.toggle(\'collapsed\')">−</button>' +
        '</div>' +
        '<div class="ftp-body"><div class="ftp-list"></div></div>'
      document.body.appendChild(panel)

      // toast 容器
      var toast = document.createElement('div')
      toast.id = 'toastContainer'
      toast.className = 'toast-container'
      document.body.appendChild(toast)

      // 样式
      var style = document.createElement('style')
      style.textContent = '\n' +
        '.file-transfer-panel { position: fixed; bottom: 10px; right: 10px; width: 320px; background: #16213e; border: 1px solid #0f3460; border-radius: 8px; z-index: 2000; color: #fff; font-size: 13px; }\n' +
        '.file-transfer-panel.collapsed .ftp-body { display: none; }\n' +
        '.ftp-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #0f3460; }\n' +
        '.ftp-toggle { background: none; border: none; color: #aaa; cursor: pointer; font-size: 16px; }\n' +
        '.ftp-body { padding: 8px 12px; max-height: 200px; overflow-y: auto; }\n' +
        '.ftp-item { margin-bottom: 8px; }\n' +
        '.ftp-item-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }\n' +
        '.ftp-item-info { font-size: 11px; color: #888; }\n' +
        '.ftp-progress { height: 4px; background: #0f3460; border-radius: 2px; margin-top: 4px; overflow: hidden; }\n' +
        '.ftp-progress-bar { height: 100%; background: #4caf50; transition: width 0.3s; }\n' +
        '.ftp-progress-bar.error { background: #dc3545; }\n' +
        '.toast-container { position: fixed; top: 60px; right: 10px; z-index: 3000; }\n' +
        '.toast { background: #1a1a2e; border: 1px solid #0f3460; border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; color: #fff; font-size: 13px; min-width: 250px; }\n' +
        '.toast-buttons { display: flex; gap: 8px; margin-top: 8px; }\n' +
        '.toast-btn { padding: 4px 12px; border: 1px solid #0f3460; border-radius: 4px; background: transparent; color: #fff; cursor: pointer; font-size: 12px; }\n' +
        '.toast-btn:hover { background: #0f3460; }\n' +
        '.toast-btn.accept { border-color: #4caf50; color: #4caf50; }\n' +
        '.toast-btn.accept:hover { background: #4caf50; color: #fff; }\n' +
        '.toast-btn.reject { border-color: #dc3545; color: #dc3545; }\n' +
        '.toast-btn.reject:hover { background: #dc3545; color: #fff; }\n'
      document.head.appendChild(style)
    },

    _setupDragDrop: function () {
      // 先清理旧的事件监听器，防止重复绑定
      this._teardownDragDrop()
      
      var self = this
      this._dragOverHandler = function (e) {
        e.preventDefault()
        e.stopPropagation()
      }
      this._dropHandler = function (e) {
        e.preventDefault()
        e.stopPropagation()

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          var files = []
          for (var i = 0; i < e.dataTransfer.files.length; i++) {
            var f = e.dataTransfer.files[i]
            files.push({
              id: 'fdrop_' + Date.now() + '_' + i,
              name: f.name,
              path: f.path,
              size: f.size,
              totalChunks: Math.ceil(f.size / CHUNK_SIZE),
              chunkSize: CHUNK_SIZE
            })
          }

          files.forEach(function (file) {
            self._sendQueue.push(file)
            self._renderSendItem(file)
          })

          self._processSendQueue()
        }
      }

      document.addEventListener('dragover', this._dragOverHandler)
      document.addEventListener('drop', this._dropHandler)
    },

    _teardownDragDrop: function () {
      if (this._dragOverHandler) {
        document.removeEventListener('dragover', this._dragOverHandler)
        this._dragOverHandler = null
      }
      if (this._dropHandler) {
        document.removeEventListener('drop', this._dropHandler)
        this._dropHandler = null
      }
    },

    _setupChannelListeners: function () {
      var self = this
      if (!window.auxiliaryChannelManager) return

      window.auxiliaryChannelManager.on('channel-closed', function (data) {
        if (data.type === window.AuxiliaryChannelType.FILE_TRANSFER) {
          window.UIState && window.UIState.log('文件传输通道已关闭，中止传输')
          self._cleanupFailedTransfers()
        }
      })

      window.auxiliaryChannelManager.on('channel-error', function (data) {
        if (data.type === window.AuxiliaryChannelType.FILE_TRANSFER) {
          window.UIState && window.UIState.log('文件传输通道出错: ' + (data.error || '未知错误'))
          self._cleanupFailedTransfers()
        }
      })
    },

    _cleanupFailedTransfers: function () {
      // 标记当前活跃发送为失败
      if (this._activeSend) {
        this._updateSendProgress(this._activeSend.id, -1)
        this._activeSend = null
      }
      // 清空发送队列并标记所有为失败
      this._sendQueue.forEach(function (file) {
        this._updateSendProgress(file.id, -1)
      }, this)
      this._sendQueue = []
      this._isSending = false
      // 清理接收队列
      this._receiveQueue = []
    },

    _setupToolbarButton: function () {
      var btn = document.getElementById('fileTransferBtn')
      if (!btn) return

      if (this._toolbarClickHandler) {
        btn.removeEventListener('click', this._toolbarClickHandler)
      }

      var self = this
      this._toolbarClickHandler = function () { self.sendFiles() }
      btn.addEventListener('click', this._toolbarClickHandler)
    },

    _setupDownloadButton: function () {
      var btn = document.getElementById('fileDownloadBtn')
      if (!btn) return

      if (this._downloadClickHandler) {
        btn.removeEventListener('click', this._downloadClickHandler)
      }

      var self = this
      this._downloadClickHandler = function () { self.requestDownload() }
      btn.addEventListener('click', this._downloadClickHandler)
    },

    _renderSendItem: function (file) {
      var list = document.querySelector('.ftp-list')
      if (!list) return
      var div = document.createElement('div')
      div.className = 'ftp-item'
      div.id = 'ftp-send-' + file.id
      div.innerHTML = '' +
        '<div class="ftp-item-name">↑ ' + this._escapeHtml(file.name) + '</div>' +
        '<div class="ftp-item-info">' + this._formatSize(file.size) + ' · 等待中</div>' +
        '<div class="ftp-progress"><div class="ftp-progress-bar" style="width:0%"></div></div>'
      list.appendChild(div)
    },

    _renderReceiveItem: function (file) {
      var list = document.querySelector('.ftp-list')
      if (!list) return
      var div = document.createElement('div')
      div.className = 'ftp-item'
      div.id = 'ftp-recv-' + file.fileId
      div.innerHTML = '' +
        '<div class="ftp-item-name">↓ ' + this._escapeHtml(file.fileName) + '</div>' +
        '<div class="ftp-item-info">' + this._formatSize(file.fileSize) + ' · 等待中</div>' +
        '<div class="ftp-progress"><div class="ftp-progress-bar" style="width:0%"></div></div>'
      list.appendChild(div)
    },

    _updateSendProgress: function (fileId, progress) {
      var el = document.getElementById('ftp-send-' + fileId)
      if (!el) return
      var bar = el.querySelector('.ftp-progress-bar')
      var info = el.querySelector('.ftp-item-info')
      if (progress === -1) {
        if (bar) bar.classList.add('error')
        if (info) info.textContent = '已拒绝'
      } else if (bar) {
        bar.style.width = progress + '%'
      }
      if (info && progress >= 0) info.textContent = progress + '%'
      if (progress >= 100 && info) info.textContent = '完成'
    },

    _updateReceiveProgress: function (fileId, progress) {
      var el = document.getElementById('ftp-recv-' + fileId)
      if (!el) return
      var bar = el.querySelector('.ftp-progress-bar')
      var info = el.querySelector('.ftp-item-info')
      if (bar) bar.style.width = progress + '%'
      if (info) info.textContent = progress + '%'
      if (progress >= 100 && info) info.textContent = '完成'
    },

    _showToast: function (message, buttons) {
      var container = document.getElementById('toastContainer')
      if (!container) return

      var toast = document.createElement('div')
      toast.className = 'toast'
      toast.textContent = message

      if (buttons && buttons.length > 0) {
        var btnDiv = document.createElement('div')
        btnDiv.className = 'toast-buttons'
        buttons.forEach(function (b) {
          var btn = document.createElement('button')
          btn.className = 'toast-btn'
          if (b.text === '接受' || b.text === '打开文件夹') btn.classList.add('accept')
          else if (b.text === '拒绝') btn.classList.add('reject')
          btn.textContent = b.text
          btn.addEventListener('click', function () {
            if (b.onClick) b.onClick()
            toast.remove()
          })
          btnDiv.appendChild(btn)
        })
        toast.appendChild(btnDiv)
      }

      container.appendChild(toast)

      setTimeout(function () { if (toast.parentNode) toast.remove() }, 10000)
    },

    _formatSize: function (bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    },

    _escapeHtml: function (str) {
      var div = document.createElement('div')
      div.textContent = str
      return div.innerHTML
    }
  }

  window.FileTransferManager = FileTransferManager
})()
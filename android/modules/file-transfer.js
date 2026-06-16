import s from './state.js'

const CHUNK_SIZE = 16 * 1024

const FileTransferManager = {
  _channel: null,
  _sendQueue: [],
  _receiveQueue: [],
  _activeSend: null,
  _isSending: false,

  init() {
    this._setupUI()
    this._setupButton()
  },

  onChannelReady(channel) {
    this._channel = channel
    if (typeof window.log === 'function') window.log('文件传输通道已就绪')
  },

  sendFiles() {
    const input = document.getElementById('ftpFileInput')
    if (!input) return
    input.click()
  },

  _onFilesSelected(event) {
    const files = event.target.files
    if (!files || files.length === 0) return

    const self = this
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const fileInfo = {
        id: 'ft_' + Date.now() + '_' + i,
        name: f.name,
        size: f.size,
        totalChunks: Math.ceil(f.size / CHUNK_SIZE),
        file: f
      }
      self._sendQueue.push(fileInfo)
      self._renderSendItem(fileInfo)
    }

    event.target.value = ''
    self._processSendQueue()
  },

  _processSendQueue() {
    if (this._isSending || this._sendQueue.length === 0) return
    this._isSending = true
    this._activeSend = this._sendQueue.shift()
    this._sendFileOffer(this._activeSend)
  },

  _sendFileOffer(file) {
    if (!this._channel || this._channel.readyState !== 'open') {
      if (typeof window.showToast === 'function') window.showToast('文件传输通道未连接')
      this._isSending = false
      return
    }

    this._channel.send(JSON.stringify({
      action: 'file-offer',
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: file.totalChunks,
      chunkSize: CHUNK_SIZE
    }))

    if (typeof window.log === 'function') window.log('已发送文件传输请求: ' + file.name)
  },

  _sendChunks(file, startChunk) {
    const self = this
    let chunkIndex = startChunk || 0
    const totalChunks = file.totalChunks
    const reader = new FileReader()

    function sendNext() {
      if (chunkIndex >= totalChunks) {
        if (self._channel && self._channel.readyState === 'open') {
          self._channel.send(JSON.stringify({
            action: 'file-complete',
            fileId: file.id,
            totalChunks: totalChunks
          }))
        }
        self._updateSendProgress(file.id, 100)
        self._isSending = false
        self._activeSend = null
        self._processSendQueue()
        return
      }

      const offset = chunkIndex * CHUNK_SIZE
      const blob = file.file.slice(offset, offset + CHUNK_SIZE)

      reader.onload = function(e) {
        const base64 = e.target.result.split(',')[1]
        if (self._channel && self._channel.readyState === 'open') {
          self._channel.send(JSON.stringify({
            action: 'file-chunk',
            fileId: file.id,
            chunkIndex: chunkIndex,
            data: base64,
            bytesRead: base64.length
          }))
        }

        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100)
        self._updateSendProgress(file.id, progress)

        chunkIndex++
        setTimeout(sendNext, 0)
      }

      reader.readAsDataURL(blob)
    }

    sendNext()
  },

  handleIncoming(data) {
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
      case 'file-complete-ack':
        this._handleFileCompleteAck(data)
        break
      case 'file-request':
        this._handleFileRequest(data)
        break
    }
  },

  _handleFileOffer(data) {
    const self = this
    const sizeStr = this._formatSize(data.fileSize)

    this._showToast('收到文件: ' + data.fileName + ' (' + sizeStr + ')', [
      { text: '接受', cls: 'accept', onClick() { self._acceptFile(data) } },
      { text: '拒绝', cls: 'reject', onClick() { self._rejectFile(data) } }
    ])
  },

  _acceptFile(data) {
    const self = this
    data.chunks = []
    data.receivedChunks = 0
    self._receiveQueue.push(data)
    self._renderReceiveItem(data)

    if (self._channel && self._channel.readyState === 'open') {
      self._channel.send(JSON.stringify({
        action: 'file-accept',
        fileId: data.fileId
      }))
    }
  },

  _rejectFile(data) {
    if (this._channel && this._channel.readyState === 'open') {
      this._channel.send(JSON.stringify({
        action: 'file-reject',
        fileId: data.fileId
      }))
    }
  },

  _handleFileAccept(data) {
    if (this._activeSend && this._activeSend.id === data.fileId) {
      this._sendChunks(this._activeSend, 0)
    }
  },

  _handleFileReject(data) {
    if (this._activeSend && this._activeSend.id === data.fileId) {
      this._updateSendProgress(data.fileId, -1)
      this._isSending = false
      this._activeSend = null
      this._processSendQueue()
    }
  },

  _handleFileChunk(data) {
    const receiver = this._receiveQueue.find(r => r.fileId === data.fileId)
    if (!receiver) return

    receiver.chunks[data.chunkIndex] = data.data
    receiver.receivedChunks++

    if (data.totalChunks) {
      const progress = Math.round(((data.chunkIndex + 1) / data.totalChunks) * 100)
      this._updateReceiveProgress(data.fileId, progress)
    }
  },

  _handleFileComplete(data) {
    const self = this
    const receiver = this._receiveQueue.find(r => r.fileId === data.fileId)
    if (!receiver) return

    self._updateReceiveProgress(data.fileId, 100)

    // 组装文件
    const mimeType = self._guessMimeType(receiver.fileName)
    const byteArrays = receiver.chunks.map(chunk => {
      const binary = atob(chunk)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    })

    // 计算总大小
    let totalLength = 0
    byteArrays.forEach(arr => { totalLength += arr.length })
    const merged = new Uint8Array(totalLength)
    let offset = 0
    byteArrays.forEach(arr => {
      merged.set(arr, offset)
      offset += arr.length
    })

    const blob = new Blob([merged], { type: mimeType })
    const url = URL.createObjectURL(blob)

    // 下载文件
    const a = document.createElement('a')
    a.href = url
    a.download = receiver.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    if (typeof window.log === 'function') window.log('文件接收完成: ' + receiver.fileName)

    self._showToast('接收完成: ' + receiver.fileName)

    self._removeFromReceiveQueue(data.fileId)

    // 发送完成确认
    if (self._channel && self._channel.readyState === 'open') {
      self._channel.send(JSON.stringify({
        action: 'file-complete-ack',
        fileId: data.fileId,
        success: true
      }))
    }
  },

  _handleFileCompleteAck(data) {
    if (this._activeSend && this._activeSend.id === data.fileId) {
      if (typeof window.showToast === 'function') {
        window.showToast('发送完成: ' + this._activeSend.name)
      }
      this._isSending = false
      this._activeSend = null
      this._processSendQueue()
    }
  },

  _handleFileRequest(data) {
    const input = document.getElementById('ftpFileInput')
    if (!input) return
    input.click()
  },

  _removeFromReceiveQueue(fileId) {
    this._receiveQueue = this._receiveQueue.filter(r => r.fileId !== fileId)
  },

  _guessMimeType(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase()
    const map = {
      pdf: 'application/pdf',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      xml: 'application/xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime'
    }
    return map[ext] || 'application/octet-stream'
  },

  // ========== UI ==========

  _setupUI() {
    if (document.getElementById('ftpPanel')) return

    // 隐藏的文件选择器
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.id = 'ftpFileInput'
    fileInput.multiple = true
    fileInput.style.display = 'none'
    fileInput.addEventListener('change', (e) => this._onFilesSelected(e))
    document.body.appendChild(fileInput)

    // 进度面板
    const panel = document.createElement('div')
    panel.id = 'ftpPanel'
    panel.style.cssText = 'position:fixed;bottom:80px;right:10px;width:300px;background:#16213e;border:1px solid #0f3460;border-radius:8px;z-index:2000;color:#fff;font-size:13px;display:none;'
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #0f3460;">' +
      '<span>文件传输</span>' +
      '<button id="ftpCloseBtn" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;">−</button>' +
      '</div>' +
      '<div id="ftpList" style="padding:8px 12px;max-height:200px;overflow-y:auto;"></div>'
    document.body.appendChild(panel)

    document.getElementById('ftpCloseBtn').addEventListener('click', () => {
      panel.style.display = 'none'
    })

    // Toast 容器
    const toastContainer = document.createElement('div')
    toastContainer.id = 'ftpToastContainer'
    toastContainer.style.cssText = 'position:fixed;top:60px;right:10px;z-index:3000;'
    document.body.appendChild(toastContainer)
  },

  _setupButton() {
    const btn = document.getElementById('fileTransferBtn')
    if (!btn) return
    const self = this
    btn.addEventListener('click', () => { self.sendFiles() })
  },

  _renderSendItem(file) {
    const panel = document.getElementById('ftpPanel')
    const list = document.getElementById('ftpList')
    if (!list) return
    panel.style.display = 'block'

    const div = document.createElement('div')
    div.id = 'ftp-send-' + file.id
    div.style.cssText = 'margin-bottom:8px;'
    div.innerHTML =
      '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">↑ ' + this._escHtml(file.name) + '</div>' +
      '<div class="ftp-info" style="font-size:11px;color:#888;">' + this._formatSize(file.size) + ' · 等待中</div>' +
      '<div style="height:4px;background:#0f3460;border-radius:2px;margin-top:4px;overflow:hidden;">' +
      '<div class="ftp-bar" style="height:100%;background:#4caf50;width:0%;transition:width 0.3s;"></div>' +
      '</div>'
    list.appendChild(div)
  },

  _renderReceiveItem(file) {
    const panel = document.getElementById('ftpPanel')
    const list = document.getElementById('ftpList')
    if (!list) return
    panel.style.display = 'block'

    const div = document.createElement('div')
    div.id = 'ftp-recv-' + file.fileId
    div.style.cssText = 'margin-bottom:8px;'
    div.innerHTML =
      '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">↓ ' + this._escHtml(file.fileName) + '</div>' +
      '<div class="ftp-info" style="font-size:11px;color:#888;">' + this._formatSize(file.fileSize) + ' · 等待中</div>' +
      '<div style="height:4px;background:#0f3460;border-radius:2px;margin-top:4px;overflow:hidden;">' +
      '<div class="ftp-bar" style="height:100%;background:#4caf50;width:0%;transition:width 0.3s;"></div>' +
      '</div>'
    list.appendChild(div)
  },

  _updateSendProgress(fileId, progress) {
    const el = document.getElementById('ftp-send-' + fileId)
    if (!el) return
    const bar = el.querySelector('.ftp-bar')
    const info = el.querySelector('.ftp-info')
    if (progress === -1) {
      if (bar) bar.style.background = '#dc3545'
      if (info) info.textContent = '已拒绝'
    } else {
      if (bar) bar.style.width = progress + '%'
      if (info) info.textContent = progress >= 100 ? '完成' : progress + '%'
    }
  },

  _updateReceiveProgress(fileId, progress) {
    const el = document.getElementById('ftp-recv-' + fileId)
    if (!el) return
    const bar = el.querySelector('.ftp-bar')
    const info = el.querySelector('.ftp-info')
    if (bar) bar.style.width = progress + '%'
    if (info) info.textContent = progress >= 100 ? '完成' : progress + '%'
  },

  _showToast(message, buttons) {
    const container = document.getElementById('ftpToastContainer')
    if (!container) return

    const toast = document.createElement('div')
    toast.style.cssText = 'background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;padding:12px 16px;margin-bottom:8px;color:#fff;font-size:13px;min-width:250px;'
    toast.textContent = message

    if (buttons && buttons.length > 0) {
      const btnDiv = document.createElement('div')
      btnDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;'
      buttons.forEach(b => {
        const btn = document.createElement('button')
        btn.style.cssText = 'padding:4px 12px;border:1px solid #0f3460;border-radius:4px;background:transparent;color:#fff;cursor:pointer;font-size:12px;'
        if (b.cls === 'accept') btn.style.cssText += 'border-color:#4caf50;color:#4caf50;'
        if (b.cls === 'reject') btn.style.cssText += 'border-color:#dc3545;color:#dc3545;'
        btn.textContent = b.text
        btn.addEventListener('click', () => {
          if (b.onClick) b.onClick()
          toast.remove()
        })
        btnDiv.appendChild(btn)
      })
      toast.appendChild(btnDiv)
    }

    container.appendChild(toast)
    setTimeout(() => { if (toast.parentNode) toast.remove() }, 10000)
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  },

  _escHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }
}

export default FileTransferManager
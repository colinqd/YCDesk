class FrameCapturer {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.frameRate = options.frameRate || 30
    this.captureInterval = null
    this.onFrame = null
    this.canvas = null
    this.ctx = null
    this.lastFrameData = null
    this.currentStream = null
    this.videoElement = null
    this._isManualMode = false  // 手动触发模式（由 transmitter 调度）

    // OffscreenCanvas + Worker 支持
    this._useWorker = false
    this._captureWorker = null
    this._offscreenCanvas = null
    this._pendingFrame = null
    this._initOffscreenWorker()
  }

  _initOffscreenWorker() {
    // 检测 OffscreenCanvas 支持
    if (typeof OffscreenCanvas === 'undefined') return

    try {
      // 使用内联 Blob URL 创建 Worker（兼容 Electron 环境）
      var workerCode = document.querySelector('script[data-worker="capture"]')
      var blobUrl = null

      if (workerCode) {
        blobUrl = URL.createObjectURL(new Blob([workerCode.textContent], { type: 'application/javascript' }))
      } else {
        // 降级：尝试从文件加载 worker 脚本
        try {
          blobUrl = 'capture-worker.js'
        } catch (e) {
          return
        }
      }

      this._captureWorker = new Worker(blobUrl)
      if (blobUrl && blobUrl.indexOf('blob:') === 0) {
        URL.revokeObjectURL(blobUrl)
      }

      this._captureWorker.onmessage = function(e) {
        var msg = e.data
        if (msg.type === 'frame' && this._pendingFrame) {
          var resolve = this._pendingFrame
          this._pendingFrame = null
          resolve(msg)
        }
      }.bind(this)

      this._captureWorker.onerror = function(e) {
        console.error('[FrameCapturer] Worker error:', e.message)
        this._useWorker = false
        this._captureWorker = null
      }.bind(this)

      this._useWorker = true
    } catch (e) {
      // OffscreenCanvas 或 Worker 不支持，静默降级到主线程模式
      this._useWorker = false
      this._captureWorker = null
    }
  }

  async startCapture(sourceId, width, height) {
    this.stopCapture()

    this.videoElement = document.createElement('video')
    this.videoElement.style.cssText = 'position:absolute;top:-9999px;left:-9999px;'

    this.currentStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: width,
          maxHeight: height,
          maxFrameRate: this.frameRate
        }
      }
    })

    this.videoElement.srcObject = this.currentStream
    await this.videoElement.play()

    var actualWidth = this.videoElement.videoWidth || width
    var actualHeight = this.videoElement.videoHeight || height

    if (this._useWorker && this._captureWorker) {
      // OffscreenCanvas 模式：将 canvas 转移到 Worker
      try {
        this._offscreenCanvas = new OffscreenCanvas(actualWidth, actualHeight)
        this._captureWorker.postMessage({
          type: 'init',
          canvas: this._offscreenCanvas,
          width: actualWidth,
          height: actualHeight
        }, [this._offscreenCanvas])
        // _offscreenCanvas 现在被转移，不能再使用
      } catch (e) {
        console.error('[FrameCapturer] OffscreenCanvas transfer failed:', e.message)
        this._useWorker = false
      }
    }

    if (!this._useWorker) {
      this.canvas = document.createElement('canvas')
      this.canvas.width = actualWidth
      this.canvas.height = actualHeight
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    }

    // 不再使用 setInterval 自动捕获，改为由调用方手动触发
    this._isManualMode = true

    return {
      width: actualWidth,
      height: actualHeight
    }
  }

  captureFrame() {
    if (!this.videoElement) return null

    if (this._useWorker && this._captureWorker) {
      // Worker 模式：异步捕获
      this._captureFrameWorker()
      return null
    }

    // 主线程模式：同步捕获
    if (!this.ctx) return null

    this.ctx.drawImage(this.videoElement, 0, 0)

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const currentData = imageData.data

    this.lastFrameData = new Uint8ClampedArray(currentData)

    if (this.onFrame) {
      this.onFrame({
        imageData: imageData,
        width: this.canvas.width,
        height: this.canvas.height,
        timestamp: Date.now()
      })
    }

    return imageData
  }

  async _captureFrameWorker() {
    if (!this.videoElement || !this._captureWorker) return

    try {
      // 从 video 元素创建 ImageBitmap（零拷贝）
      var bitmap = await createImageBitmap(this.videoElement)

      this._captureWorker.postMessage({
        type: 'capture',
        frame: bitmap,
        timestamp: Date.now()
      }, [bitmap])

      // 等待 Worker 返回 ImageData
      var result = await new Promise(function(resolve) {
        this._pendingFrame = resolve
      }.bind(this))

      if (result && result.imageData) {
        if (this.onFrame) {
          this.onFrame({
            imageData: result.imageData,
            width: result.width,
            height: result.height,
            timestamp: result.timestamp
          })
        }
      }
    } catch (e) {
      // Worker 捕获失败，降级到主线程
      console.error('[FrameCapturer] Worker capture failed, falling back:', e.message)
      this._useWorker = false
      this.canvas = document.createElement('canvas')
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
      this.captureFrame()
    }
  }

  stopCapture() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval)
      this.captureInterval = null
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop())
      this.currentStream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    if (this._captureWorker) {
      this._captureWorker.terminate()
      this._captureWorker = null
    }
    this._offscreenCanvas = null
    this._useWorker = false

    this.lastFrameData = null
  }

  getResolution() {
    return {
      width: this.canvas ? this.canvas.width : this.width,
      height: this.canvas ? this.canvas.height : this.height
    }
  }
}
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

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.videoElement.videoWidth || width
    this.canvas.height = this.videoElement.videoHeight || height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })

    this.captureInterval = setInterval(() => {
      this.captureFrame()
    }, 1000 / this.frameRate)

    return {
      width: this.canvas.width,
      height: this.canvas.height
    }
  }

  captureFrame() {
    if (!this.videoElement || !this.ctx) return null

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

    this.lastFrameData = null
  }

  getResolution() {
    return {
      width: this.canvas ? this.canvas.width : this.width,
      height: this.canvas ? this.canvas.height : this.height
    }
  }
}

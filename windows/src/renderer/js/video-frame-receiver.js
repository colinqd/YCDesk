class VideoFrameReceiver {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.canvas = options.canvas || null
    this.ctx = null
    this.lastFrame = null
    this.lastKeyFrame = null
    this.currentFrameId = 0
    this.pendingFrames = new Map()
    this.maxPendingFrames = 30
    this.onFrameRendered = null
    this.onStatsUpdate = null
    this.stats = {
      framesReceived: 0,
      keyFramesReceived: 0,
      deltaFramesReceived: 0,
      bytesReceived: 0,
      framesDecoded: 0,
      avgDecodeTime: 0
    }
  }

  initialize(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })
    this.logger.log('[VideoFrameReceiver] 初始化完成')
  }

  handleMessage(data) {
    if (data.type !== 'video-frame') return

    var startTime = performance.now()

    try {
      this.processFrame(data)
      this.stats.framesDecoded++

      var decodeTime = performance.now() - startTime
      this.stats.avgDecodeTime =
        (this.stats.avgDecodeTime * (this.stats.framesDecoded - 1) + decodeTime)
        / this.stats.framesDecoded

      if (this.onFrameRendered) {
        this.onFrameRendered({
          width: data.width,
          height: data.height,
          frameId: data.frameId,
          isKeyFrame: data.isKeyFrame
        })
      }
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] 处理帧失败: ' + e.message)
    }

    this.updateStats(data)
  }

  processFrame(frameData) {
    this.currentFrameId = frameData.frameId
    this.stats.framesReceived++

    if (frameData.isKeyFrame) {
      this.decodeKeyFrame(frameData)
      this.lastKeyFrame = frameData
    } else {
      this.decodeDeltaFrame(frameData)
    }

    this.lastFrame = frameData
  }

  decodeKeyFrame(frameData) {
    this.stats.keyFramesReceived++

    if (!this.ctx) return

    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    for (var i = 0; i < frameData.regions.length; i++) {
      this.renderRegion(frameData.regions[i])
    }
  }

  decodeDeltaFrame(frameData) {
    this.stats.deltaFramesReceived++

    for (var i = 0; i < frameData.regions.length; i++) {
      this.renderRegion(frameData.regions[i])
    }
  }

  renderRegion(region) {
    if (!this.ctx) return

    var x = region.x
    var y = region.y
    var width = region.width
    var height = region.height
    var data = region.data

    try {
      if (data.type === 'jpeg' || data.type === 'image/jpeg') {
        var img = new Image()
        img.src = data.data
        img.onload = function() {
          this.ctx.drawImage(img, x, y, width, height)
        }.bind(this)
      } else if (data.type === 'rle') {
        var decompressed = this.decompressRLE(data.data, width, height)
        this.renderPixelData(decompressed, x, y, width, height)
      } else {
        this.renderPixelData(data.data, x, y, width, height)
      }
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] 渲染区域失败 (' + x + ',' + y + '): ' + e.message)
    }
  }

  renderPixelData(pixelData, x, y, width, height) {
    if (!this.ctx) return

    var dataArr
    if (pixelData instanceof Array) {
      dataArr = new Uint8ClampedArray(pixelData)
    } else if (pixelData instanceof Uint8ClampedArray) {
      dataArr = pixelData
    } else {
      dataArr = new Uint8ClampedArray(pixelData)
    }

    if (dataArr.length < width * height * 4) {
      var padded = new Uint8ClampedArray(width * height * 4)
      padded.set(dataArr.subarray(0, Math.min(dataArr.length, padded.length)))
      dataArr = padded
    }

    try {
      var imageData = new ImageData(dataArr, width, height)

      var tempCanvas = document.createElement('canvas')
      tempCanvas.width = width
      tempCanvas.height = height
      var tempCtx = tempCanvas.getContext('2d')
      tempCtx.putImageData(imageData, 0, 0)

      this.ctx.drawImage(tempCanvas, x, y)
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] renderPixelData 失败: ' + e.message)
    }
  }

  decompressRLE(compressed, width, height) {
    var result = []
    var i = 0

    while (i < compressed.length) {
      var byte = compressed[i]

      if (byte & 0x80) {
        var runLength = byte & 0x7F
        i++
        if (i < compressed.length) {
          var value = compressed[i]
          i++
          for (var j = 0; j < runLength; j++) {
            result.push(value)
          }
        }
      } else {
        var count = byte
        i++
        for (var j = 0; j < count && i < compressed.length; j++) {
          result.push(compressed[i])
          i++
        }
      }
    }

    return result
  }

  updateStats(frameData) {
    this.stats.bytesReceived += JSON.stringify(frameData).length

    if (this.onStatsUpdate) {
      this.onStatsUpdate(Object.assign({}, this.stats))
    }
  }

  getStats() {
    return Object.assign({}, this.stats)
  }

  setCanvasSize(width, height) {
    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  clear() {
    if (this.ctx) {
      this.ctx.fillStyle = '#000'
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.lastFrame = null
    this.lastKeyFrame = null
    this.currentFrameId = 0
    this.pendingFrames.clear()
  }

  reset() {
    this.clear()
    this.stats = {
      framesReceived: 0,
      keyFramesReceived: 0,
      deltaFramesReceived: 0,
      bytesReceived: 0,
      framesDecoded: 0,
      avgDecodeTime: 0
    }
  }
}

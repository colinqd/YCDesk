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
    this.imagePool = []
    this.imagePoolIndex = 0
    this.maxImagePool = 3
    this.canvasPool = null
    this.canvasPoolCtx = null
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
    this.logger.log('[VideoFrameReceiver] 初始化完成 (二进制协议)')
  }

  handleMessage(rawData) {
    var startTime = performance.now()

    try {
      var frameData

      // 判断是二进制帧还是 JSON 帧（向后兼容）
      if (rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
        frameData = this.deserializeFrameBinary(rawData)
      } else if (typeof rawData === 'string') {
        try {
          frameData = JSON.parse(rawData)
          if (frameData.type !== 'video-frame') return
        } catch (e) {
          return
        }
      } else {
        return
      }

      this.processFrame(frameData)
      this.stats.framesDecoded++

      var decodeTime = performance.now() - startTime
      this.stats.avgDecodeTime =
        (this.stats.avgDecodeTime * (this.stats.framesDecoded - 1) + decodeTime)
        / this.stats.framesDecoded

      if (this.onFrameRendered) {
        this.onFrameRendered({
          width: frameData.width,
          height: frameData.height,
          frameId: frameData.frameId,
          isKeyFrame: frameData.isKeyFrame
        })
      }
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] 处理帧失败: ' + e.message)
    }

    this.updateStats(rawData)
  }

  // ========== 二进制帧反序列化 ==========

  deserializeFrameBinary(buffer) {
    var data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer)
    var view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    var offset = 0

    // 帧头
    var msgType = view.getUint8(offset)
    offset += 1
    if (msgType !== 0x01) {
      throw new Error('未知帧类型: ' + msgType)
    }

    var frameId = view.getUint32(offset, true)
    offset += 4
    var flags = view.getUint8(offset)
    offset += 1
    var isKeyFrame = (flags & 0x01) !== 0
    var width = view.getUint16(offset, true)
    offset += 2
    var height = view.getUint16(offset, true)
    offset += 2
    var regionCount = view.getUint16(offset, true)
    offset += 2

    var regions = []
    for (var i = 0; i < regionCount; i++) {
      var regionX = view.getUint16(offset, true)
      offset += 2
      var regionY = view.getUint16(offset, true)
      offset += 2
      var regionW = view.getUint16(offset, true)
      offset += 2
      var regionH = view.getUint16(offset, true)
      offset += 2

      var dataType = view.getUint8(offset)
      offset += 1
      var dataLen = view.getUint32(offset, true)
      offset += 4

      var regionData
      if (dataType === 0) {
        // JPEG: 原始二进制数据（ArrayBuffer），构建 Blob 避免 Base64 开销
        var jpegBytes = data.slice(offset, offset + dataLen)
        regionData = { type: 'jpeg', data: new Blob([jpegBytes], { type: 'image/jpeg' }) }
      } else if (dataType === 1) {
        // RLE compressed - 保持 Uint8Array 避免 Array 转换
        regionData = {
          type: 'rle',
          data: new Uint8Array(data.subarray(offset, offset + dataLen))
        }
      } else {
        // Raw pixel data
        regionData = {
          type: 'raw',
          data: Array.from(data.subarray(offset, offset + dataLen))
        }
      }
      offset += dataLen

      regions.push({
        x: regionX,
        y: regionY,
        width: regionW,
        height: regionH,
        data: regionData
      })
    }

    return {
      type: 'video-frame',
      frameId: frameId,
      timestamp: Date.now(),
      width: width,
      height: height,
      isKeyFrame: isKeyFrame,
      regionCount: regionCount,
      regions: regions
    }
  }

  utf8ToString(data) {
    var decoder = new TextDecoder('utf-8')
    return decoder.decode(data)
  }

  // ========== 帧处理 ==========

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
        this._renderJpegRegion(data, x, y, width, height)
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

  _renderJpegRegion(data, x, y, width, height) {
    var ctx = this.ctx

    // 使用 createImageBitmap 替代 Image.onload（更快、不乱序）
    if (typeof createImageBitmap !== 'undefined') {
      createImageBitmap(data.data instanceof Blob ? data.data : data.data, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'pixelated'
      }).then(function(bitmap) {
        ctx.drawImage(bitmap, x, y, width, height)
        bitmap.close()
      }).catch(function() {
        // 降级：使用 Image 加载
        this._renderJpegFallback(data, x, y, width, height)
      }.bind(this))
    } else {
      this._renderJpegFallback(data, x, y, width, height)
    }
  }

  _renderJpegFallback(data, x, y, width, height) {
    var ctx = this.ctx
    var img = this._getPooledImage()
    img.onload = function() {
      ctx.drawImage(img, x, y, width, height)
      img.onload = null
      // 释放 Blob URL
      if (img.src && img.src.indexOf('blob:') === 0) {
        URL.revokeObjectURL(img.src)
      }
    }.bind(this)

    if (data.data instanceof Blob) {
      img.src = URL.createObjectURL(data.data)
    } else if (typeof data.data === 'string') {
      // 向后兼容：旧格式 data URL
      img.src = data.data
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

      var tempCanvas = this._getPooledCanvas(width, height)
      var tempCtx = this.canvasPoolCtx
      tempCtx.putImageData(imageData, 0, 0)

      this.ctx.drawImage(tempCanvas, x, y)
    } catch (e) {
      this.logger.error('[VideoFrameReceiver] renderPixelData 失败: ' + e.message)
    }
  }

  decompressRLE(compressed, width, height) {
    var data = compressed instanceof Uint8Array ? compressed : new Uint8Array(compressed)
    var expectedSize = width * height * 4
    var result = new Uint8Array(expectedSize)
    var ri = 0
    var i = 0

    while (i < data.length && ri < expectedSize) {
      var byte = data[i]

      if (byte & 0x80) {
        var runLength = byte & 0x7F
        i++
        if (i < data.length) {
          var value = data[i]
          i++
          var end = Math.min(ri + runLength, expectedSize)
          while (ri < end) {
            result[ri++] = value
          }
        }
      } else {
        var count = byte
        i++
        var end = Math.min(ri + count, i + count, expectedSize)
        while (ri < end && i < data.length) {
          result[ri++] = data[i++]
        }
      }
    }

    return result
  }

  updateStats(rawData) {
    var byteSize = 0
    if (rawData instanceof ArrayBuffer) {
      byteSize = rawData.byteLength
    } else if (rawData instanceof Uint8Array) {
      byteSize = rawData.byteLength
    } else if (typeof rawData === 'string') {
      byteSize = rawData.length
    }
    this.stats.bytesReceived += byteSize

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

  _getPooledImage() {
    if (this.imagePoolIndex >= this.imagePool.length) {
      if (this.imagePool.length < this.maxImagePool) {
        var img = new Image()
        this.imagePool.push(img)
      } else {
        this.imagePoolIndex = 0
      }
    }
    return this.imagePool[this.imagePoolIndex++ % this.maxImagePool]
  }

  _getPooledCanvas(width, height) {
    if (!this.canvasPool || this.canvasPool.width < width || this.canvasPool.height < height) {
      this.canvasPool = document.createElement('canvas')
      this.canvasPool.width = width
      this.canvasPool.height = height
      this.canvasPoolCtx = this.canvasPool.getContext('2d')
    }
    return this.canvasPool
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
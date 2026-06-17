class FrameDiffer {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.previousFrame = null
    this.frameCounter = 0
    this.keyFrameInterval = options.keyFrameInterval || 120
    this.jpegQuality = options.jpegQuality || 0.7
    this.compressionLevel = options.compressionLevel || 5

    // 自适应关键帧间隔
    this.adaptiveKeyFrame = options.adaptiveKeyFrame !== false
    this.minKeyFrameInterval = 60
    this.maxKeyFrameInterval = 300
    this.currentLossRate = 0

    // 像素差异提取缓冲区（预分配减少 GC）
    this._pixelBuffer = null
    this._maxPixelBuffer = 0

    // 预分配关键帧编码 Canvas（复用避免每次创建）
    this._compressCanvas = null
    this._compressCtx = null
  }

  async computeDiff(currentFrame, dirtyRegions, isKeyFrame) {
    const result = {
      frameId: ++this.frameCounter,
      timestamp: currentFrame.timestamp,
      regions: [],
      isKeyFrame: isKeyFrame || this.frameCounter % this.keyFrameInterval === 0,
      width: this.width,
      height: this.height
    }

    const currentData = currentFrame.imageData.data
    const previousData = this.previousFrame ? this.previousFrame.imageData.data : null

    if (result.isKeyFrame) {
      const compressed = await this.compressFrame(currentFrame)
      result.regions.push({
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        data: compressed
      })
    } else {
      for (const region of dirtyRegions) {
        const regionData = this.extractRegion(currentData, previousData, region, this.width)
        if (regionData) {
          result.regions.push({
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
            data: regionData
          })
        }
      }
    }

    this.previousFrame = {
      imageData: {
        data: new Uint8ClampedArray(currentData),
        width: this.width,
        height: this.height
      }
    }

    // 自适应关键帧间隔
    if (this.adaptiveKeyFrame && this.currentLossRate > 0.1) {
      this.keyFrameInterval = Math.max(this.minKeyFrameInterval, this.maxKeyFrameInterval - Math.round(this.currentLossRate * 200))
    } else if (this.adaptiveKeyFrame) {
      this.keyFrameInterval = Math.min(this.maxKeyFrameInterval, this.keyFrameInterval + 10)
    }

    return result
  }

  extractRegion(currentData, previousData, region, frameWidth) {
    const x = region.x
    const y = region.y
    const width = region.width
    const height = region.height
    const pixelCount = width * height

    // 预分配/复用像素缓冲区
    const maxNeeded = pixelCount * 5 // 每像素5字节 (x:2, y:2, rgb:1 packed)
    if (!this._pixelBuffer || this._maxPixelBuffer < maxNeeded) {
      this._pixelBuffer = new Uint8Array(maxNeeded)
      this._maxPixelBuffer = maxNeeded
    }

    let bufIdx = 0

    // 使用 Uint32Array 视图批量比较像素（4字节一次 = RGBA）
    const cur32 = new Uint32Array(currentData.buffer, currentData.byteOffset, currentData.length / 4)
    const prev32 = previousData ? new Uint32Array(previousData.buffer, previousData.byteOffset, previousData.length / 4) : null

    for (let py = y; py < y + height; py++) {
      const rowOffset = py * frameWidth
      for (let px = x; px < x + width; px++) {
        const idx = rowOffset + px

        // 使用 Uint32 比较（忽略 alpha 通道差异）
        const curPixel = cur32[idx]
        if (prev32 && curPixel === prev32[idx]) {
          continue
        }

        // 只存储变化像素的相对坐标和 RGB 值
        const relX = px - x
        const relY = py - y

        this._pixelBuffer[bufIdx++] = relX & 0xFF
        this._pixelBuffer[bufIdx++] = (relX >> 8) & 0xFF
        this._pixelBuffer[bufIdx++] = relY & 0xFF
        this._pixelBuffer[bufIdx++] = curPixel & 0xFF       // R
        this._pixelBuffer[bufIdx++] = (curPixel >> 8) & 0xFF // G
        this._pixelBuffer[bufIdx++] = (curPixel >> 16) & 0xFF // B
        // 不再存储 alpha

        if (bufIdx > this._maxPixelBuffer - 12) {
          // 缓冲区溢出保护
          break
        }
      }
    }

    if (bufIdx === 0) {
      return null
    }

    return this.compressRLE(this._pixelBuffer.subarray(0, bufIdx))
  }

  setLossRate(rate) {
    this.currentLossRate = Math.max(0, Math.min(1, rate))
  }

  compressRLE(data) {
    if (data.length < 4) {
      return { type: 'raw', data: new Uint8Array(data) }
    }

    const compressed = []
    let i = 0

    while (i < data.length) {
      let runLength = 1
      const runValue = data[i]

      while (i + runLength < data.length &&
             data[i + runLength] === runValue &&
             runLength < 127) {
        runLength++
      }

      if (runLength >= 4) {
        compressed.push(0x80 | runLength)
        compressed.push(runValue)
      } else {
        for (let j = 0; j < runLength; j++) {
          compressed.push(data[i + j])
        }
      }

      i += runLength
    }

    return {
      type: 'rle',
      data: new Uint8Array(compressed),
      originalSize: data.length
    }
  }

  compressFrame(frame) {
    return new Promise((resolve) => {
      // 复用预分配的 canvas，避免每次创建
      if (!this._compressCanvas) {
        this._compressCanvas = document.createElement('canvas')
        this._compressCanvas.width = frame.width
        this._compressCanvas.height = frame.height
        this._compressCtx = this._compressCanvas.getContext('2d')
      }

      const ctx = this._compressCtx
      const imageData = new ImageData(
        new Uint8ClampedArray(frame.imageData.data),
        frame.width,
        frame.height
      )
      ctx.putImageData(imageData, 0, 0)

      // 使用 toBlob 获取原始 JPEG 二进制（无 Base64 开销）
      this._compressCanvas.toBlob((blob) => {
        // 将 Blob 转为 ArrayBuffer 以便二进制传输
        const reader = new FileReader()
        reader.onloadend = function() {
          resolve({
            type: 'jpeg',
            data: reader.result,  // ArrayBuffer - 原始 JPEG 二进制
            quality: this.jpegQuality
          })
        }.bind(this)
        reader.readAsArrayBuffer(blob)
      }, 'image/jpeg', this.jpegQuality)
    })
  }

  reset() {
    this.previousFrame = null
    this.frameCounter = 0
  }
}

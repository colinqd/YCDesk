class FrameDiffer {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.previousFrame = null
    this.frameCounter = 0
    this.keyFrameInterval = options.keyFrameInterval || 120
    this.jpegQuality = options.jpegQuality || 0.7
    this.compressionLevel = options.compressionLevel || 5
  }

  computeDiff(currentFrame, dirtyRegions, isKeyFrame) {
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
      result.regions.push({
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        data: this.compressFrame(currentFrame)
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

    return result
  }

  extractRegion(currentData, previousData, region, frameWidth) {
    const x = region.x
    const y = region.y
    const width = region.width
    const height = region.height
    const pixels = []

    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) {
        const idx = (py * frameWidth + px) * 4
        const r = currentData[idx]
        const g = currentData[idx + 1]
        const b = currentData[idx + 2]

        if (previousData) {
          const pr = previousData[idx]
          const pg = previousData[idx + 1]
          const pb = previousData[idx + 2]

          if (Math.abs(r - pr) < 5 && Math.abs(g - pg) < 5 && Math.abs(b - pb) < 5) {
            continue
          }
        }

        pixels.push(px - x, py - y, r, g, b)
      }
    }

    if (pixels.length === 0) {
      return null
    }

    return this.compressRLE(new Uint8Array(pixels))
  }

  compressRLE(data) {
    if (data.length < 4) {
      return { type: 'raw', data: Array.from(data) }
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
      data: compressed,
      originalSize: data.length
    }
  }

  compressFrame(frame) {
    const canvas = document.createElement('canvas')
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')

    const imageData = new ImageData(
      new Uint8ClampedArray(frame.imageData.data),
      frame.width,
      frame.height
    )
    ctx.putImageData(imageData, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', this.jpegQuality)

    return {
      type: 'jpeg',
      data: dataUrl,
      quality: this.jpegQuality
    }
  }

  reset() {
    this.previousFrame = null
    this.frameCounter = 0
  }
}

class DirtyRegionDetector {
  constructor(options = {}) {
    this.width = options.width || 1920
    this.height = options.height || 1080
    this.gridSize = options.gridSize || 64
    this.threshold = options.threshold || 10
    this.dirtyGrids = new Set()
    this.lastCleanGrids = new Map()
    this.enableGridMode = options.enableGridMode !== false
    this.enableInputDriven = options.enableInputDriven !== false
    this.pendingRegions = []
    this.aggregationWindow = options.aggregationWindow || 16
    this.lastFlushTime = 0
  }

  detectDirtyRegions(currentFrame, previousFrame) {
    if (!previousFrame) {
      return [this.createRegion(0, 0, this.width, this.height)]
    }

    if (this.enableGridMode) {
      return this.detectGridMode(currentFrame.imageData.data, previousFrame.imageData.data, currentFrame.width, currentFrame.height)
    } else {
      return this.detectPixelMode(currentFrame.imageData.data, previousFrame.imageData.data, currentFrame.width, currentFrame.height)
    }
  }

  detectGridMode(currentData, previousData, width, height) {
    const gridWidth = Math.ceil(width / this.gridSize)
    const gridHeight = Math.ceil(height / this.gridSize)
    const dirtyGrids = []

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const startX = gx * this.gridSize
        const startY = gy * this.gridSize
        const endX = Math.min(startX + this.gridSize, width)
        const endY = Math.min(startY + this.gridSize, height)

        let diffCount = 0
        let sampleCount = 0

        for (let y = startY; y < endY; y += 4) {
          for (let x = startX; x < endX; x += 4) {
            const idx = (y * width + x) * 4
            const r1 = currentData[idx]
            const g1 = currentData[idx + 1]
            const b1 = currentData[idx + 2]
            const r2 = previousData[idx]
            const g2 = previousData[idx + 1]
            const b2 = previousData[idx + 2]

            if (Math.abs(r1 - r2) > this.threshold ||
                Math.abs(g1 - g2) > this.threshold ||
                Math.abs(b1 - b2) > this.threshold) {
              diffCount++
            }
            sampleCount++
          }
        }

        if (sampleCount > 0 && diffCount / sampleCount > 0.1) {
          dirtyGrids.push({
            x: startX,
            y: startY,
            width: endX - startX,
            height: endY - startY
          })
        }
      }
    }

    return this.mergeAdjacentRegions(dirtyGrids)
  }

  detectPixelMode(currentData, previousData, width, height) {
    const dirtyPixels = []

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4
        const r1 = currentData[idx]
        const g1 = currentData[idx + 1]
        const b1 = currentData[idx + 2]
        const r2 = previousData[idx]
        const g2 = previousData[idx + 1]
        const b2 = previousData[idx + 2]

        if (Math.abs(r1 - r2) > this.threshold ||
            Math.abs(g1 - g2) > this.threshold ||
            Math.abs(b1 - b2) > this.threshold) {
          dirtyPixels.push({ x, y })
        }
      }
    }

    return this.clusterPixelsToRegions(dirtyPixels)
  }

  mergeAdjacentRegions(regions) {
    if (regions.length === 0) return []

    regions.sort((a, b) => a.y - b.y || a.x - b.x)

    const merged = []
    let current = { x: regions[0].x, y: regions[0].y, width: regions[0].width, height: regions[0].height }

    for (let i = 1; i < regions.length; i++) {
      const region = regions[i]

      if (region.y <= current.y + current.height &&
          region.x <= current.x + current.width + this.gridSize) {
        const newRight = Math.max(current.x + current.width, region.x + region.width)
        const newBottom = Math.max(current.y + current.height, region.y + region.height)
        current.x = Math.min(current.x, region.x)
        current.y = Math.min(current.y, region.y)
        current.width = newRight - current.x
        current.height = newBottom - current.y
      } else {
        merged.push(current)
        current = { x: region.x, y: region.y, width: region.width, height: region.height }
      }
    }
    merged.push(current)

    return merged
  }

  clusterPixelsToRegions(pixels) {
    if (pixels.length === 0) return []

    const visited = new Set()
    const regions = []

    for (const pixel of pixels) {
      const key = pixel.x + ',' + pixel.y
      if (visited.has(key)) continue

      const cluster = []
      const queue = [pixel]

      while (queue.length > 0) {
        const p = queue.shift()
        const k = p.x + ',' + p.y
        if (visited.has(k)) continue
        visited.add(k)
        cluster.push(p)

        for (const np of pixels) {
          const nk = np.x + ',' + np.y
          if (visited.has(nk)) continue
          if (Math.abs(np.x - p.x) <= 4 && Math.abs(np.y - p.y) <= 4) {
            queue.push(np)
          }
        }
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of cluster) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }

      regions.push({
        x: minX,
        y: minY,
        width: maxX - minX + 4,
        height: maxY - minY + 4
      })
    }

    return this.mergeAdjacentRegions(regions)
  }

  createRegion(x, y, width, height) {
    return { x, y, width, height }
  }

  markInputDrivenRegion(x, y, type) {
    let region

    switch (type) {
      case 'mousemove':
        region = { x: x - 20, y: y - 20, width: 40, height: 40 }
        break
      case 'click':
        region = { x: x - 50, y: y - 50, width: 100, height: 100 }
        break
      case 'keydown':
        region = { x: 0, y: 0, width: this.width, height: 100 }
        break
      case 'scroll':
        region = { x: 0, y: 0, width: this.width, height: this.height }
        break
      default:
        region = { x: x - 30, y: y - 30, width: 60, height: 60 }
    }

    this.pendingRegions.push(region)

    const now = Date.now()
    if (now - this.lastFlushTime > this.aggregationWindow) {
      this.lastFlushTime = now
      const regions = this.pendingRegions.splice(0, this.pendingRegions.length)
      return this.mergeAdjacentRegions(regions)
    }

    return null
  }

  getAndClearPendingRegions() {
    const now = Date.now()
    if (now - this.lastFlushTime > this.aggregationWindow && this.pendingRegions.length > 0) {
      this.lastFlushTime = now
      const regions = this.pendingRegions.splice(0, this.pendingRegions.length)
      return this.mergeAdjacentRegions(regions)
    }
    return []
  }
}

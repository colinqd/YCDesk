class CanvasObjectPool {
  constructor(options = {}) {
    this.maxPoolSize = options.maxPoolSize || 8
    this.minPoolSize = options.minPoolSize || 2
    this.expandStep = options.expandStep || 2
    this.maxIdleTime = options.maxIdleTime || 30000
    this.pool = []
    this.activeCount = 0
    this.totalCreated = 0
    this.totalReused = 0
    this.totalDiscarded = 0
    this.lastAccessTime = Date.now()
    this.cleanupTimer = null
    this.logFn = options.log || null
  }

  acquire(width, height) {
    this.lastAccessTime = Date.now()
    var suitable = null
    for (var i = 0; i < this.pool.length; i++) {
      var item = this.pool[i]
      if (!item.inUse && item.canvas.width >= width && item.canvas.height >= height) {
        if (!suitable || (item.canvas.width * item.canvas.height < suitable.canvas.width * suitable.canvas.height)) {
          suitable = item
          if (item.canvas.width === width && item.canvas.height === height) break
        }
      }
    }
    if (suitable) { suitable.inUse = true; this.activeCount++; this.totalReused++; return suitable }
    if (this.pool.length >= this.maxPoolSize) {
      var oldestIdle = null
      var oldestIdx = -1
      for (var j = 0; j < this.pool.length; j++) {
        if (!this.pool[j].inUse && (!oldestIdle || this.pool[j].createdAt < oldestIdle.createdAt)) {
          oldestIdle = this.pool[j]; oldestIdx = j
        }
      }
      if (oldestIdle) { this.pool.splice(oldestIdx, 1); this.totalDiscarded++ }
    }
    var canvas = document.createElement('canvas')
    canvas.width = Math.max(width, 1)
    canvas.height = Math.max(height, 1)
    var newItem = { canvas: canvas, ctx: canvas.getContext('2d'), inUse: true, createdAt: Date.now() }
    this.pool.push(newItem)
    this.activeCount++
    this.totalCreated++
    return newItem
  }

  release(item) {
    if (!item || !item.inUse) return
    item.inUse = false; this.activeCount--; this.lastAccessTime = Date.now()
  }

  releaseAll() {
    for (var i = 0; i < this.pool.length; i++) this.pool[i].inUse = false
    this.activeCount = 0; this.lastAccessTime = Date.now()
  }

  preWarm(count, width, height) {
    var toCreate = Math.min(count, this.maxPoolSize - this.pool.length)
    for (var i = 0; i < toCreate; i++) {
      var canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      this.pool.push({ canvas: canvas, ctx: canvas.getContext('2d'), inUse: false, createdAt: Date.now() })
      this.totalCreated++
    }
  }

  startCleanupTimer(interval) {
    this.stopCleanupTimer()
    var self = this
    this.cleanupTimer = setInterval(function() { self.cleanup() }, interval || 15000)
  }

  stopCleanupTimer() { if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null } }

  cleanup() {
    var now = Date.now()
    var removed = 0
    for (var i = this.pool.length - 1; i >= 0; i--) {
      if (this.pool[i].inUse) continue
      if (this.pool.length <= this.minPoolSize) break
      if (now - this.pool[i].createdAt > this.maxIdleTime) { this.pool.splice(i, 1); removed++ }
    }
    if (removed > 0 && this.logFn) this.logFn('[CanvasObjectPool] 清理了 ' + removed + ' 个空闲对象，池大小: ' + this.pool.length)
  }

  resize(width, height) {
    for (var i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].inUse) { this.pool[i].canvas.width = width; this.pool[i].canvas.height = height; this.pool[i].createdAt = Date.now() }
    }
  }

  getStats() {
    return {
      poolSize: this.pool.length, activeCount: this.activeCount, idleCount: this.pool.length - this.activeCount,
      totalCreated: this.totalCreated, totalReused: this.totalReused, totalDiscarded: this.totalDiscarded,
      reuseRate: this.totalCreated > 0 ? (this.totalReused / (this.totalCreated + this.totalReused)).toFixed(2) : '0.00',
      maxPoolSize: this.maxPoolSize, minPoolSize: this.minPoolSize
    }
  }

  destroy() {
    this.stopCleanupTimer()
    this.pool = []; this.activeCount = 0; this.totalCreated = 0; this.totalReused = 0; this.totalDiscarded = 0
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = CanvasObjectPool }
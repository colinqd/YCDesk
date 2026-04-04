class MatrixTransformer {
  constructor() {
    this.remoteScreenWidth = 1920
    this.remoteScreenHeight = 1080
    this.displayWidth = 1280
    this.displayHeight = 720
    this.videoWidth = 1920
    this.videoHeight = 1080
    this.scale = 1
    this.panX = 0
    this.panY = 0
  }

  setScreenSize(width, height) {
    this.displayWidth = width
    this.displayHeight = height
  }

  setRemoteScreenSize(width, height) {
    this.remoteScreenWidth = width
    this.remoteScreenHeight = height
  }

  applyContainerSize(videoContainer, videoWrapper, screenContainer) {
    videoWrapper.style.width = '100%'
    videoWrapper.style.height = '100%'
    videoWrapper.style.left = '0px'
    videoWrapper.style.top = '0px'
    
    videoContainer.style.width = '100%'
    videoContainer.style.height = '100%'
    videoContainer.style.left = '0px'
    videoContainer.style.top = '0px'
    
    if (screenContainer && this.scale === 1) {
      const rect = screenContainer.getBoundingClientRect()
      this.baseWidth = rect.width
      this.baseHeight = rect.height
      this.displayWidth = rect.width
      this.displayHeight = rect.height
    }
  }

  updatePan(deltaX, deltaY) {
    this.panX += deltaX
    this.panY += deltaY
  }

  updateScale(newScale, clientX, clientY, containerRect) {
    const oldScale = this.scale
    this.scale = Math.max(0.1, Math.min(5, newScale))
    
    const centerX = clientX - containerRect.left
    const centerY = clientY - containerRect.top
    
    const scaleDiff = this.scale / oldScale
    this.panX = centerX - (centerX - this.panX) * scaleDiff
    this.panY = centerY - (centerY - this.panY) * scaleDiff
  }

  applyTransform(element) {
    const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`
    element.style.transform = transform
    element.style.transformOrigin = '0 0'
  }

  containerToRemote(containerX, containerY) {
    if (!this.displayWidth || !this.displayHeight) {
      return null
    }

    const videoRatio = this.videoWidth / this.videoHeight
    const containerRatio = this.displayWidth / this.displayHeight

    let renderWidth, renderHeight, offsetX, offsetY

    if (videoRatio > containerRatio) {
      renderWidth = this.displayWidth
      renderHeight = this.displayWidth / videoRatio
      offsetX = 0
      offsetY = (this.displayHeight - renderHeight) / 2
    } else {
      renderHeight = this.displayHeight
      renderWidth = this.displayHeight * videoRatio
      offsetY = 0
      offsetX = (this.displayWidth - renderWidth) / 2
    }

    const x = containerX / this.scale - offsetX
    const y = containerY / this.scale - offsetY

    if (x < 0 || x > renderWidth || y < 0 || y > renderHeight) {
      return null
    }

    return {
      x: x * (this.remoteScreenWidth / renderWidth),
      y: y * (this.remoteScreenHeight / renderHeight)
    }
  }
}

if (typeof window !== 'undefined') {
  window.MatrixTransformer = MatrixTransformer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MatrixTransformer;
}

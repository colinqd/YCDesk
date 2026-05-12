class ResolutionNegotiator {
  constructor(options = {}) {
    this.dataChannelManager = null;
    this.localWindowSize = null;
    this.remoteScreenSize = null;
    this.negotiatedSize = null;
    this.timeout = options.timeout || 5000;
    this.logger = options.logger || console;
    this.pendingResolve = null;
    this.timeoutTimer = null;
  }

  setDataChannelManager(dcm) {
    this.dataChannelManager = dcm;
  }

  getLocalWindowSize() {
    return {
      width: window.innerWidth - 40,
      height: window.innerHeight - 120,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  getLocalWindowSizeFromElement(wrapperElement) {
    if (!wrapperElement) {
      return this.getLocalWindowSize();
    }
    
    return {
      width: wrapperElement.clientWidth,
      height: wrapperElement.clientHeight,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  async negotiate(wrapperElement = null) {
    this.localWindowSize = wrapperElement 
      ? this.getLocalWindowSizeFromElement(wrapperElement)
      : this.getLocalWindowSize();
    
    this.logger.log(`[ResolutionNegotiator] 开始协商, 本地窗口: ${this.localWindowSize.width}x${this.localWindowSize.height}`);
    
    return new Promise((resolve, reject) => {
      this.pendingResolve = { resolve, reject };
      
      if (!this.dataChannelManager || !this.dataChannelManager.isOpen()) {
        reject(new Error('数据通道未打开'));
        return;
      }
      
      this.dataChannelManager.send({
        type: 'resolution-request',
        width: this.localWindowSize.width,
        height: this.localWindowSize.height,
        devicePixelRatio: this.localWindowSize.devicePixelRatio,
        timestamp: Date.now()
      }, true);
      
      this.timeoutTimer = setTimeout(() => {
        this.logger.log('[ResolutionNegotiator] 协商超时, 使用默认值');
        this.negotiatedSize = this.calculateDefaultSize();
        resolve(this.negotiatedSize);
        this.pendingResolve = null;
      }, this.timeout);
    });
  }

  handleResponse(data) {
    if (!this.pendingResolve) {
      this.logger.log('[ResolutionNegotiator] 收到响应但没有等待中的请求');
      return;
    }
    
    clearTimeout(this.timeoutTimer);
    
    this.remoteScreenSize = {
      width: data.width,
      height: data.height,
      originalWidth: data.originalWidth,
      originalHeight: data.originalHeight
    };
    
    this.negotiatedSize = this.calculateOptimalSize(
      this.localWindowSize,
      this.remoteScreenSize
    );
    
    this.logger.log(`[ResolutionNegotiator] 协商完成: 远程=${data.width}x${data.height}, 显示=${this.negotiatedSize.width}x${this.negotiatedSize.height}`);
    
    this.pendingResolve.resolve(this.negotiatedSize);
    this.pendingResolve = null;
  }

  calculateOptimalSize(local, remote) {
    if (!remote || !remote.width || !remote.height) {
      return this.calculateDefaultSize();
    }
    
    const localRatio = local.width / local.height;
    const remoteRatio = remote.width / remote.height;
    
    let displayWidth, displayHeight, scale;
    
    if (remoteRatio > localRatio) {
      displayWidth = local.width;
      displayHeight = local.width / remoteRatio;
      scale = local.width / remote.width;
    } else {
      displayHeight = local.height;
      displayWidth = local.height * remoteRatio;
      scale = local.height / remote.height;
    }
    
    return {
      width: displayWidth,
      height: displayHeight,
      scale: scale,
      remoteWidth: remote.width,
      remoteHeight: remote.height,
      originalWidth: remote.originalWidth || remote.width,
      originalHeight: remote.originalHeight || remote.height
    };
  }

  calculateDefaultSize() {
    return {
      width: this.localWindowSize.width,
      height: this.localWindowSize.height,
      scale: 1,
      remoteWidth: this.localWindowSize.width,
      remoteHeight: this.localWindowSize.height
    };
  }

  getNegotiatedSize() {
    return this.negotiatedSize;
  }

  getRemoteScreenSize() {
    return this.remoteScreenSize;
  }

  reset() {
    this.localWindowSize = null;
    this.remoteScreenSize = null;
    this.negotiatedSize = null;
    this.pendingResolve = null;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}

class ResolutionHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.virtualDisplay = null;
    this.videoEncoder = null;
    this.currentResolution = null;
  }

  handleRequest(data, sendResponse) {
    this.logger.log(`[ResolutionHandler] 收到分辨率请求: ${data.width}x${data.height}, DPR=${data.devicePixelRatio}`);
    
    const physicalScreen = this.getPhysicalScreenSize();
    
    const virtualSize = this.calculateVirtualDisplay(
      data.width,
      data.height,
      data.devicePixelRatio,
      physicalScreen
    );
    
    this.configureVirtualDisplay(virtualSize);
    
    this.currentResolution = virtualSize;
    
    const response = {
      type: 'resolution-response',
      width: virtualSize.width,
      height: virtualSize.height,
      originalWidth: physicalScreen.width,
      originalHeight: physicalScreen.height,
      timestamp: Date.now()
    };
    
    this.logger.log(`[ResolutionHandler] 发送分辨率响应: ${virtualSize.width}x${virtualSize.height}`);
    
    if (sendResponse) {
      sendResponse(response);
    }
    
    return response;
  }

  getPhysicalScreenSize() {
    if (window.electronAPI && window.electronAPI.getScreenSize) {
      const size = window.electronAPI.getScreenSize();
      return {
        width: size.width,
        height: size.height,
        scaleFactor: size.scaleFactor
      };
    }
    
    return {
      width: screen.width,
      height: screen.height,
      scaleFactor: 1
    };
  }

  calculateVirtualDisplay(clientWidth, clientHeight, clientDPR, physicalScreen) {
    const maxWidth = Math.min(clientWidth * clientDPR, physicalScreen.width);
    const maxHeight = Math.min(clientHeight * clientDPR, physicalScreen.height);
    
    const aspectRatio = physicalScreen.width / physicalScreen.height;
    
    let virtualWidth, virtualHeight;
    
    if (maxWidth / maxHeight > aspectRatio) {
      virtualHeight = maxHeight;
      virtualWidth = Math.round(maxHeight * aspectRatio);
    } else {
      virtualWidth = maxWidth;
      virtualHeight = Math.round(maxWidth / aspectRatio);
    }
    
    virtualWidth = Math.min(virtualWidth, 1920);
    virtualHeight = Math.min(virtualHeight, 1080);
    
    virtualWidth = Math.round(virtualWidth / 2) * 2;
    virtualHeight = Math.round(virtualHeight / 2) * 2;
    
    return {
      width: virtualWidth,
      height: virtualHeight,
      physicalWidth: physicalScreen.width,
      physicalHeight: physicalScreen.height
    };
  }

  async configureVirtualDisplay(size) {
    this.logger.log(`[ResolutionHandler] 配置虚拟显示器: ${size.width}x${size.height}`);
    
    if (this.virtualDisplay && this.virtualDisplay.resize) {
      await this.virtualDisplay.resize(size.width, size.height);
    }
    
    if (this.videoEncoder) {
      await this.configureVideoEncoder(size);
    }
  }

  async configureVideoEncoder(size) {
    if (!this.videoEncoder) return;
    
    const bitrate = this.calculateBitrate(size);
    
    this.logger.log(`[ResolutionHandler] 配置视频编码器: ${size.width}x${size.height}, bitrate=${bitrate}`);
    
    await this.videoEncoder.configure({
      width: size.width,
      height: size.height,
      frameRate: 30,
      bitrate: bitrate
    });
  }

  calculateBitrate(size) {
    const pixels = size.width * size.height;
    const baseBitrate = 2000000;
    const pixelFactor = pixels / (1920 * 1080);
    return Math.round(baseBitrate * pixelFactor);
  }

  setVideoEncoder(encoder) {
    this.videoEncoder = encoder;
  }

  setVirtualDisplay(display) {
    this.virtualDisplay = display;
  }

  getCurrentResolution() {
    return this.currentResolution;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ResolutionNegotiator, ResolutionHandler };
} else {
  window.ResolutionNegotiator = ResolutionNegotiator;
  window.ResolutionHandler = ResolutionHandler;
}
/**
 * DiffTransportManager - 差异传输管理器
 * 协调检测器、编码器，与WebRTC数据通道集成
 */
class DiffTransportManager {
    constructor(options = {}) {
        this.options = {
            enabled: options.enabled || true,
            mode: options.mode || 'sender',
            frameRate: options.frameRate || 30,
            quality: options.quality || 0.8,
            format: options.format || 'jpeg',
            blockSize: options.blockSize || 16,
            diffThreshold: options.diffThreshold || 15,
            minBandwidth: options.minBandwidth || 100000,
            maxBandwidth: options.maxBandwidth || 2000000,
            adaptiveQuality: options.adaptiveQuality || true,
            ...options
        };
        
        this.mode = this.options.mode;
        
        this.detector = null;
        this.encoder = null;
        this.decoder = null;
        
        this.sourceCanvas = null;
        this.sourceVideo = null;
        this.targetCanvas = null;
        
        this.dataChannel = null;
        
        this.frameId = 0;
        this.lastFrameTime = 0;
        this.isRunning = false;
        this.animationFrameId = null;
        
        this.bandwidthEstimator = {
            bytesSent: 0,
            bytesReceived: 0,
            lastEstimate: 0,
            history: [],
            windowSize: 10
        };
        
        this.stats = {
            framesCaptured: 0,
            framesSent: 0,
            framesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            fullFrames: 0,
            diffFrames: 0,
            skippedFrames: 0
        };
        
        this.eventListeners = new Map();
    }
    
    async initSender(sourceCanvas, sourceVideo) {
        this.mode = 'sender';
        this.sourceCanvas = sourceCanvas;
        this.sourceVideo = sourceVideo;
        
        const width = sourceVideo.videoWidth || sourceCanvas.width;
        const height = sourceVideo.videoHeight || sourceCanvas.height;
        
        this.detector = new DiffDetector({
            blockSize: this.options.blockSize,
            threshold: this.options.diffThreshold
        });
        this.detector.init(width, height);
        
        this.encoder = new DiffEncoder({
            quality: this.options.quality,
            format: this.options.format
        });
        
        console.log('DiffTransportManager: 发送端初始化完成', { width, height });
        this._emit('initialized', { mode: 'sender', width, height });
    }
    
    async initReceiver(targetCanvas) {
        this.mode = 'receiver';
        this.targetCanvas = targetCanvas;
        
        const width = targetCanvas.width;
        const height = targetCanvas.height;
        
        this.decoder = new DiffDecoder({
            smoothing: this.options.smoothing
        });
        this.decoder.init(targetCanvas, width, height);
        
        console.log('DiffTransportManager: 接收端初始化完成', { width, height });
        this._emit('initialized', { mode: 'receiver', width, height });
    }
    
    setDataChannel(dataChannel) {
        this.dataChannel = dataChannel;
        
        if (this.mode === 'receiver') {
            dataChannel.addEventListener('message', this._onDataChannelMessage.bind(this));
        }
        
        dataChannel.addEventListener('open', () => {
            console.log('DiffTransportManager: 数据通道已打开');
            this._emit('channel-open');
        });
        
        dataChannel.addEventListener('close', () => {
            console.log('DiffTransportManager: 数据通道已关闭');
            this._emit('channel-close');
        });
        
        dataChannel.addEventListener('error', (error) => {
            console.error('DiffTransportManager: 数据通道错误', error);
            this._emit('channel-error', error);
        });
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        
        if (this.mode === 'sender') {
            this._startCapture();
        }
        
        console.log('DiffTransportManager: 已启动');
        this._emit('started');
    }
    
    stop() {
        this.isRunning = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        console.log('DiffTransportManager: 已停止');
        this._emit('stopped');
    }
    
    _startCapture() {
        const captureFrame = async () => {
            if (!this.isRunning) return;
            
            const now = performance.now();
            const elapsed = now - this.lastFrameTime;
            const frameInterval = 1000 / this.options.frameRate;
            
            if (elapsed >= frameInterval) {
                this.lastFrameTime = now - (elapsed % frameInterval);
                await this._captureAndSend();
            }
            
            this.animationFrameId = requestAnimationFrame(captureFrame);
        };
        
        this.animationFrameId = requestAnimationFrame(captureFrame);
    }
    
    async _captureAndSend() {
        if (!this.sourceCanvas || !this.detector || !this.encoder) {
            return;
        }
        
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            this.stats.skippedFrames++;
            return;
        }
        
        this.stats.framesCaptured++;
        
        const diffResult = this.detector.detect(this.sourceCanvas);
        
        if (!diffResult.changed) {
            this.stats.skippedFrames++;
            return;
        }
        
        const encodedRegions = await this.encoder.encodeRegionsToBase64(
            this.sourceCanvas,
            diffResult.regions
        );
        
        if (encodedRegions.length === 0) {
            this.stats.skippedFrames++;
            return;
        }
        
        const message = this.encoder.createDiffMessage(
            this.frameId++,
            Date.now(),
            encodedRegions,
            diffResult.regions[0]?.type === 'full'
        );
        
        this._sendDiffMessage(message);
        
        this.stats.framesSent++;
        this.stats.bytesSent += JSON.stringify(message).length;
        
        if (message.isFullFrame) {
            this.stats.fullFrames++;
        } else {
            this.stats.diffFrames++;
        }
        
        if (this.options.adaptiveQuality) {
            this._adjustQuality();
        }
        
        this._emit('frame-sent', {
            frameId: message.frameId,
            regions: encodedRegions.length,
            isFullFrame: message.isFullFrame,
            size: JSON.stringify(message).length
        });
    }
    
    _sendDiffMessage(message) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }
        
        try {
            const jsonStr = JSON.stringify(message);
            
            if (jsonStr.length > 65535) {
                this._sendChunkedMessage(message);
            } else {
                this.dataChannel.send(jsonStr);
            }
        } catch (error) {
            console.error('DiffTransportManager: 发送消息失败', error);
        }
    }
    
    _sendChunkedMessage(message) {
        const jsonStr = JSON.stringify(message);
        const chunkSize = 16000;
        const totalChunks = Math.ceil(jsonStr.length / chunkSize);
        const messageId = Date.now();
        
        for (let i = 0; i < totalChunks; i++) {
            const chunk = {
                type: 'chunked-diff-frame',
                messageId,
                chunkIndex: i,
                totalChunks,
                data: jsonStr.slice(i * chunkSize, (i + 1) * chunkSize)
            };
            this.dataChannel.send(JSON.stringify(chunk));
        }
    }
    
    async _onDataChannelMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'diff-frame') {
                await this._handleDiffFrame(message);
            } else if (message.type === 'chunked-diff-frame') {
                await this._handleChunkedMessage(message);
            }
        } catch (error) {
            console.error('DiffTransportManager: 处理消息失败', error);
        }
    }
    
    chunkBuffer = new Map();
    
    async _handleChunkedMessage(message) {
        const { messageId, chunkIndex, totalChunks, data } = message;
        
        if (!this.chunkBuffer.has(messageId)) {
            this.chunkBuffer.set(messageId, {
                chunks: new Array(totalChunks),
                received: 0
            });
        }
        
        const buffer = this.chunkBuffer.get(messageId);
        buffer.chunks[chunkIndex] = data;
        buffer.received++;
        
        if (buffer.received === totalChunks) {
            const completeJson = buffer.chunks.join('');
            this.chunkBuffer.delete(messageId);
            
            try {
                const diffFrame = JSON.parse(completeJson);
                await this._handleDiffFrame(diffFrame);
            } catch (error) {
                console.error('DiffTransportManager: 重组消息失败', error);
            }
        }
    }
    
    async _handleDiffFrame(message) {
        if (!this.decoder) {
            return;
        }
        
        this.stats.framesReceived++;
        this.stats.bytesReceived += JSON.stringify(message).length;
        
        const success = await this.decoder.decodeFrame(message);
        
        if (success) {
            this._emit('frame-received', {
                frameId: message.frameId,
                timestamp: message.timestamp,
                isFullFrame: message.isFullFrame,
                regions: message.regions.length
            });
        }
    }
    
    _adjustQuality() {
        const stats = this.getStats();
        const avgFrameSize = stats.framesSent > 0 ? stats.bytesSent / stats.framesSent : 0;
        
        const targetBytesPerFrame = this.options.maxBandwidth / this.options.frameRate / 8;
        
        if (avgFrameSize > targetBytesPerFrame * 1.2) {
            this.encoder.options.quality = Math.max(0.3, this.encoder.options.quality - 0.05);
        } else if (avgFrameSize < targetBytesPerFrame * 0.5) {
            this.encoder.options.quality = Math.min(0.95, this.encoder.options.quality + 0.02);
        }
    }
    
    sendFullFrame() {
        if (this.mode !== 'sender' || !this.sourceCanvas) {
            return;
        }
        
        this.detector.reset();
    }
    
    getStats() {
        const baseStats = { ...this.stats };
        
        if (this.detector) {
            baseStats.detector = this.detector.getStats();
        }
        
        if (this.encoder) {
            baseStats.encoder = this.encoder.getStats();
        }
        
        if (this.decoder) {
            baseStats.decoder = this.decoder.getStats();
        }
        
        baseStats.bandwidth = {
            sent: this.stats.bytesSent,
            received: this.stats.bytesReceived,
            estimate: this.bandwidthEstimator.lastEstimate
        };
        
        baseStats.skipRatio = this.stats.framesCaptured > 0 
            ? this.stats.skippedFrames / this.stats.framesCaptured 
            : 0;
        
        return baseStats;
    }
    
    resetStats() {
        this.stats = {
            framesCaptured: 0,
            framesSent: 0,
            framesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            fullFrames: 0,
            diffFrames: 0,
            skippedFrames: 0
        };
        
        if (this.detector) this.detector.resetStats();
        if (this.encoder) this.encoder.resetStats();
        if (this.decoder) this.decoder.resetStats();
    }
    
    setQuality(quality) {
        if (this.encoder) {
            this.encoder.options.quality = Math.max(0.1, Math.min(1.0, quality));
        }
    }
    
    setFrameRate(frameRate) {
        this.options.frameRate = Math.max(1, Math.min(60, frameRate));
    }
    
    setThreshold(threshold) {
        if (this.detector) {
            this.detector.options.threshold = Math.max(1, Math.min(100, threshold));
        }
    }
    
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const callbacks = this.eventListeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    _emit(event, data) {
        if (this.eventListeners.has(event)) {
            for (const callback of this.eventListeners.get(event)) {
                callback(data);
            }
        }
    }
    
    destroy() {
        this.stop();
        
        if (this.detector) {
            this.detector.destroy();
            this.detector = null;
        }
        
        if (this.encoder) {
            this.encoder.destroy();
            this.encoder = null;
        }
        
        if (this.decoder) {
            this.decoder.destroy();
            this.decoder = null;
        }
        
        this.dataChannel = null;
        this.sourceCanvas = null;
        this.sourceVideo = null;
        this.targetCanvas = null;
        
        this.eventListeners.clear();
        this.chunkBuffer.clear();
        
        console.log('DiffTransportManager: 已销毁');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffTransportManager;
}

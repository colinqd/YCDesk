/**
 * DiffDecoder - 差异解码器
 * 解码差异区域并合成到目标画布
 */
class DiffDecoder {
    constructor(options = {}) {
        this.options = {
            smoothing: options.smoothing || false,
            ...options
        };
        
        this.targetCanvas = null;
        this.targetCtx = null;
        this.width = 0;
        this.height = 0;
        
        this.imageCache = new Map();
        this.pendingDecodes = 0;
        
        this.stats = {
            totalRegions: 0,
            totalBytes: 0,
            decodedFrames: 0,
            decodeTime: 0
        };
    }
    
    init(canvas, width, height) {
        this.targetCanvas = canvas;
        this.width = width;
        this.height = height;
        
        if (canvas) {
            this.targetCtx = canvas.getContext('2d', { willReadFrequently: true });
            if (this.options.smoothing) {
                this.targetCtx.imageSmoothingEnabled = true;
                this.targetCtx.imageSmoothingQuality = 'high';
            } else {
                this.targetCtx.imageSmoothingEnabled = false;
            }
        }
        
        this.clearCache();
        this.resetStats();
    }
    
    async decodeRegion(region) {
        const { x, y, width, height, encodedWidth, encodedHeight, format, data } = region;
        
        const startTime = performance.now();
        
        this.stats.totalRegions++;
        this.stats.totalBytes += data ? data.length : 0;
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                if (this.targetCtx) {
                    if (encodedWidth !== width || encodedHeight !== height) {
                        this.targetCtx.drawImage(
                            img,
                            0, 0, encodedWidth, encodedHeight,
                            x, y, width, height
                        );
                    } else {
                        this.targetCtx.drawImage(img, x, y, width, height);
                    }
                }
                
                const decodeTime = performance.now() - startTime;
                this.stats.decodeTime += decodeTime;
                
                URL.revokeObjectURL(img.src);
                resolve({ x, y, width, height, decodeTime });
            };
            
            img.onerror = (e) => {
                reject(new Error(`Failed to decode region at (${x}, ${y})`));
            };
            
            if (data instanceof Blob) {
                img.src = URL.createObjectURL(data);
            } else {
                img.src = `data:image/${format};base64,${data}`;
            }
        });
    }
    
    async decodeFrame(diffMessage) {
        if (!diffMessage || !diffMessage.regions) {
            return false;
        }
        
        const { frameId, timestamp, isFullFrame, regions } = diffMessage;
        
        this.stats.decodedFrames++;
        
        if (isFullFrame && regions.length === 1) {
            const region = regions[0];
            if (region.x === 0 && region.y === 0 && 
                region.width === this.width && region.height === this.height) {
                await this.decodeRegion(region);
                return true;
            }
        }
        
        const decodePromises = regions.map(region => this.decodeRegion(region));
        
        try {
            await Promise.all(decodePromises);
            return true;
        } catch (error) {
            console.error('DiffDecoder: 解码帧失败', error);
            return false;
        }
    }
    
    async decodeFromBase64(regionData) {
        return this.decodeRegion(regionData);
    }
    
    clearCanvas() {
        if (this.targetCtx) {
            this.targetCtx.clearRect(0, 0, this.width, this.height);
        }
    }
    
    fillCanvas(color = '#000000') {
        if (this.targetCtx) {
            this.targetCtx.fillStyle = color;
            this.targetCtx.fillRect(0, 0, this.width, this.height);
        }
    }
    
    clearCache() {
        this.imageCache.clear();
    }
    
    getStats() {
        return {
            ...this.stats,
            avgDecodeTime: this.stats.totalRegions > 0 
                ? this.stats.decodeTime / this.stats.totalRegions 
                : 0,
            avgRegionSize: this.stats.totalRegions > 0 
                ? this.stats.totalBytes / this.stats.totalRegions 
                : 0
        };
    }
    
    resetStats() {
        this.stats = {
            totalRegions: 0,
            totalBytes: 0,
            decodedFrames: 0,
            decodeTime: 0
        };
    }
    
    destroy() {
        this.clearCache();
        this.targetCanvas = null;
        this.targetCtx = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffDecoder;
}

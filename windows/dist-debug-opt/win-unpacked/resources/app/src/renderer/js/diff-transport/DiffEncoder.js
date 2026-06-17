/**
 * DiffEncoder - 差异编码器
 * 将变化区域编码为二进制数据，支持多种编码格式
 */
class DiffEncoder {
    constructor(options = {}) {
        this.options = {
            quality: options.quality || 0.8,
            format: options.format || 'jpeg',
            maxRegionSize: options.maxRegionSize || 512 * 512,
            minRegionSize: options.minRegionSize || 16 * 16,
            ...options
        };
        
        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
        
        this.stats = {
            totalRegions: 0,
            totalBytes: 0,
            encodedFrames: 0
        };
    }
    
    encodeRegion(sourceCanvas, region) {
        const { x, y, width, height } = region;
        
        if (width <= 0 || height <= 0) {
            return null;
        }
        
        if (width * height < this.options.minRegionSize) {
            return null;
        }
        
        let encodeWidth = width;
        let encodeHeight = height;
        
        if (width * height > this.options.maxRegionSize) {
            const scale = Math.sqrt(this.options.maxRegionSize / (width * height));
            encodeWidth = Math.floor(width * scale);
            encodeHeight = Math.floor(height * scale);
        }
        
        this.tempCanvas.width = encodeWidth;
        this.tempCanvas.height = encodeHeight;
        
        this.tempCtx.drawImage(
            sourceCanvas,
            x, y, width, height,
            0, 0, encodeWidth, encodeHeight
        );
        
        return new Promise((resolve) => {
            const mimeType = `image/${this.options.format}`;
            const quality = this.options.quality;
            
            this.tempCanvas.toBlob((blob) => {
                if (!blob) {
                    resolve(null);
                    return;
                }
                
                this.stats.totalRegions++;
                this.stats.totalBytes += blob.size;
                
                resolve({
                    blob,
                    originalX: x,
                    originalY: y,
                    originalWidth: width,
                    originalHeight: height,
                    encodedWidth: encodeWidth,
                    encodedHeight: encodeHeight,
                    format: this.options.format
                });
            }, mimeType, quality);
        });
    }
    
    async encodeRegions(sourceCanvas, regions) {
        if (!regions || regions.length === 0) {
            return [];
        }
        
        this.stats.encodedFrames++;
        
        const encodedRegions = [];
        
        for (const region of regions) {
            const encoded = await this.encodeRegion(sourceCanvas, region);
            if (encoded) {
                encodedRegions.push(encoded);
            }
        }
        
        return encodedRegions;
    }
    
    async encodeToBase64(sourceCanvas, region) {
        const { x, y, width, height } = region;
        
        if (width <= 0 || height <= 0) {
            return null;
        }
        
        let encodeWidth = width;
        let encodeHeight = height;
        
        if (width * height > this.options.maxRegionSize) {
            const scale = Math.sqrt(this.options.maxRegionSize / (width * height));
            encodeWidth = Math.floor(width * scale);
            encodeHeight = Math.floor(height * scale);
        }
        
        this.tempCanvas.width = encodeWidth;
        this.tempCanvas.height = encodeHeight;
        
        this.tempCtx.drawImage(
            sourceCanvas,
            x, y, width, height,
            0, 0, encodeWidth, encodeHeight
        );
        
        const mimeType = `image/${this.options.format}`;
        const dataUrl = this.tempCanvas.toDataURL(mimeType, this.options.quality);
        
        const base64Data = dataUrl.split(',')[1];
        
        this.stats.totalRegions++;
        this.stats.totalBytes += base64Data.length;
        
        return {
            data: base64Data,
            originalX: x,
            originalY: y,
            originalWidth: width,
            originalHeight: height,
            encodedWidth: encodeWidth,
            encodedHeight: encodeHeight,
            format: this.options.format
        };
    }
    
    async encodeRegionsToBase64(sourceCanvas, regions) {
        if (!regions || regions.length === 0) {
            return [];
        }
        
        this.stats.encodedFrames++;
        
        const encodedRegions = [];
        
        for (const region of regions) {
            const encoded = await this.encodeToBase64(sourceCanvas, region);
            if (encoded) {
                encodedRegions.push(encoded);
            }
        }
        
        return encodedRegions;
    }
    
    createDiffMessage(frameId, timestamp, encodedRegions, isFullFrame = false) {
        return {
            type: 'diff-frame',
            frameId,
            timestamp,
            isFullFrame,
            regions: encodedRegions.map(r => ({
                x: r.originalX,
                y: r.originalY,
                width: r.originalWidth,
                height: r.originalHeight,
                encodedWidth: r.encodedWidth,
                encodedHeight: r.encodedHeight,
                format: r.format,
                data: r.data
            }))
        };
    }
    
    getStats() {
        return {
            ...this.stats,
            avgRegionSize: this.stats.totalRegions > 0 
                ? this.stats.totalBytes / this.stats.totalRegions 
                : 0,
            avgFrameSize: this.stats.encodedFrames > 0 
                ? this.stats.totalBytes / this.stats.encodedFrames 
                : 0
        };
    }
    
    resetStats() {
        this.stats = {
            totalRegions: 0,
            totalBytes: 0,
            encodedFrames: 0
        };
    }
    
    destroy() {
        this.tempCanvas = null;
        this.tempCtx = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffEncoder;
}

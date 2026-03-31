/**
 * DiffDetector - 画面差异检测器
 * 检测画面变化区域，输出变化矩形列表
 */
class DiffDetector {
    constructor(options = {}) {
        this.options = {
            blockSize: options.blockSize || 16,
            threshold: options.threshold || 15,
            minChangedBlocks: options.minChangedBlocks || 4,
            mergeThreshold: options.mergeThreshold || 2,
            ...options
        };
        
        this.previousImageData = null;
        this.width = 0;
        this.height = 0;
        this.tempCanvas = null;
        this.tempCtx = null;
        
        this.stats = {
            totalFrames: 0,
            changedFrames: 0,
            totalBlocks: 0,
            changedBlocks: 0
        };
    }
    
    init(width, height) {
        this.width = width;
        this.height = height;
        this.tempCanvas = document.createElement('canvas');
        this.tempCanvas.width = width;
        this.tempCanvas.height = height;
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
        this.previousImageData = null;
        this.resetStats();
    }
    
    detect(videoFrame) {
        if (!this.tempCtx || !videoFrame) {
            return { changed: false, regions: [] };
        }
        
        this.stats.totalFrames++;
        
        this.tempCtx.drawImage(videoFrame, 0, 0, this.width, this.height);
        const currentImageData = this.tempCtx.getImageData(0, 0, this.width, this.height);
        
        if (!this.previousImageData) {
            this.previousImageData = currentImageData;
            return { 
                changed: true, 
                regions: [{ 
                    x: 0, 
                    y: 0, 
                    width: this.width, 
                    height: this.height,
                    type: 'full'
                }] 
            };
        }
        
        const changedBlocks = this._detectChangedBlocks(
            this.previousImageData.data,
            currentImageData.data
        );
        
        if (changedBlocks.length === 0) {
            this.previousImageData = currentImageData;
            return { changed: false, regions: [] };
        }
        
        this.stats.changedFrames++;
        this.stats.changedBlocks += changedBlocks.length;
        
        const regions = this._mergeBlocksToRegions(changedBlocks);
        
        this.previousImageData = currentImageData;
        
        return { changed: true, regions };
    }
    
    _detectChangedBlocks(prevData, currData) {
        const { blockSize, threshold, minChangedBlocks } = this.options;
        const changedBlocks = [];
        
        const blocksX = Math.ceil(this.width / blockSize);
        const blocksY = Math.ceil(this.height / blockSize);
        
        this.stats.totalBlocks = blocksX * blocksY;
        
        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const startX = bx * blockSize;
                const startY = by * blockSize;
                const endX = Math.min(startX + blockSize, this.width);
                const endY = Math.min(startY + blockSize, this.height);
                
                let diffSum = 0;
                let pixelCount = 0;
                
                for (let y = startY; y < endY; y += 2) {
                    for (let x = startX; x < endX; x += 2) {
                        const idx = (y * this.width + x) * 4;
                        
                        const dr = Math.abs(currData[idx] - prevData[idx]);
                        const dg = Math.abs(currData[idx + 1] - prevData[idx + 1]);
                        const db = Math.abs(currData[idx + 2] - prevData[idx + 2]);
                        
                        diffSum += (dr + dg + db) / 3;
                        pixelCount++;
                    }
                }
                
                if (pixelCount > 0 && (diffSum / pixelCount) > threshold) {
                    changedBlocks.push({ bx, by, startX, startY, endX, endY });
                }
            }
        }
        
        return changedBlocks.length >= minChangedBlocks ? changedBlocks : [];
    }
    
    _mergeBlocksToRegions(blocks) {
        if (blocks.length === 0) return [];
        
        const { blockSize, mergeThreshold } = this.options;
        const regions = [];
        const used = new Set();
        
        for (const block of blocks) {
            const key = `${block.bx},${block.by}`;
            if (used.has(key)) continue;
            
            let minX = block.startX;
            let minY = block.startY;
            let maxX = block.endX;
            let maxY = block.endY;
            
            used.add(key);
            
            let expanded = true;
            while (expanded) {
                expanded = false;
                
                for (const other of blocks) {
                    const otherKey = `${other.bx},${other.by}`;
                    if (used.has(otherKey)) continue;
                    
                    const distance = this._blockDistance(
                        minX / blockSize, minY / blockSize,
                        maxX / blockSize, maxY / blockSize,
                        other.bx, other.by
                    );
                    
                    if (distance <= mergeThreshold) {
                        minX = Math.min(minX, other.startX);
                        minY = Math.min(minY, other.startY);
                        maxX = Math.max(maxX, other.endX);
                        maxY = Math.max(maxY, other.endY);
                        used.add(otherKey);
                        expanded = true;
                    }
                }
            }
            
            regions.push({
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                type: 'diff'
            });
        }
        
        return this._mergeOverlappingRegions(regions);
    }
    
    _blockDistance(minBX, minBY, maxBX, maxBY, bx, by) {
        const cx = (minBX + maxBX) / 2;
        const cy = (minBY + maxBY) / 2;
        return Math.max(Math.abs(cx - bx), Math.abs(cy - by));
    }
    
    _mergeOverlappingRegions(regions) {
        if (regions.length <= 1) return regions;
        
        const merged = [];
        const used = new Set();
        
        for (let i = 0; i < regions.length; i++) {
            if (used.has(i)) continue;
            
            let region = { ...regions[i] };
            used.add(i);
            
            let changed = true;
            while (changed) {
                changed = false;
                
                for (let j = 0; j < regions.length; j++) {
                    if (used.has(j)) continue;
                    
                    const other = regions[j];
                    if (this._regionsOverlap(region, other)) {
                        region.x = Math.min(region.x, other.x);
                        region.y = Math.min(region.y, other.y);
                        region.width = Math.max(region.x + region.width, other.x + other.width) - region.x;
                        region.height = Math.max(region.y + region.height, other.y + other.height) - region.y;
                        used.add(j);
                        changed = true;
                    }
                }
            }
            
            merged.push(region);
        }
        
        return merged;
    }
    
    _regionsOverlap(r1, r2) {
        return !(r1.x + r1.width < r2.x || 
                 r2.x + r2.width < r1.x || 
                 r1.y + r1.height < r2.y || 
                 r2.y + r2.height < r1.y);
    }
    
    getStats() {
        return {
            ...this.stats,
            changeRatio: this.stats.totalFrames > 0 
                ? this.stats.changedFrames / this.stats.totalFrames 
                : 0,
            avgChangedBlocks: this.stats.changedFrames > 0 
                ? this.stats.changedBlocks / this.stats.changedFrames 
                : 0
        };
    }
    
    resetStats() {
        this.stats = {
            totalFrames: 0,
            changedFrames: 0,
            totalBlocks: 0,
            changedBlocks: 0
        };
    }
    
    reset() {
        this.previousImageData = null;
        this.resetStats();
    }
    
    destroy() {
        this.tempCanvas = null;
        this.tempCtx = null;
        this.previousImageData = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffDetector;
}

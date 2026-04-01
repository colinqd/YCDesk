class MatrixTransformer {
    constructor() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.remoteScreenWidth = 1920;
        this.remoteScreenHeight = 1080;
        
        this.displayX = 0;
        this.displayY = 0;
        this.displayWidth = 0;
        this.displayHeight = 0;
        
        this.scaleFactor = 1;
        this.workArea = null;
        this.videoWidth = 0;
        this.videoHeight = 0;
        
        this._matrix = null;
        this._inverseMatrix = null;
        this._matrixDirty = true;
    }
    
    setScreenSize(width, height) {
        this.screenWidth = width;
        this.screenHeight = height;
        this._matrixDirty = true;
        this._updateDisplayRect();
    }
    
    setRemoteScreenSize(width, height) {
        this.remoteScreenWidth = width;
        this.remoteScreenHeight = height;
        this._updateDisplayRect();
    }
    
    _updateDisplayRect() {
        console.log('_updateDisplayRect: screenWidth=' + this.screenWidth + ', screenHeight=' + this.screenHeight +
            ', remoteScreenWidth=' + this.remoteScreenWidth + ', remoteScreenHeight=' + this.remoteScreenHeight);
        
        if (this.screenWidth === 0 || this.screenHeight === 0) {
            this.displayX = 0;
            this.displayY = 0;
            this.displayWidth = 0;
            this.displayHeight = 0;
            console.log('_updateDisplayRect: screen 尺寸为 0，跳过计算');
            return;
        }
        
        if (this.remoteScreenWidth === 0 || this.remoteScreenHeight === 0) {
            this.displayX = 0;
            this.displayY = 0;
            this.displayWidth = this.screenWidth;
            this.displayHeight = this.screenHeight;
            console.log('_updateDisplayRect: remoteScreen 尺寸为 0，使用 screen 尺寸');
            return;
        }
        
        const screenAspect = this.screenWidth / this.screenHeight;
        const remoteAspect = this.remoteScreenWidth / this.remoteScreenHeight;
        
        if (remoteAspect > screenAspect) {
            this.displayWidth = this.screenWidth;
            this.displayHeight = this.screenWidth / remoteAspect;
            this.displayX = 0;
            this.displayY = (this.screenHeight - this.displayHeight) / 2;
        } else {
            this.displayHeight = this.screenHeight;
            this.displayWidth = this.screenHeight * remoteAspect;
            this.displayX = (this.screenWidth - this.displayWidth) / 2;
            this.displayY = 0;
        }
        
        console.log('_updateDisplayRect: 计算结果 - displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight +
            ', displayX=' + this.displayX + ', displayY=' + this.displayY);
    }
    
    _updateMatrices() {
        if (!this._matrixDirty) return;
        
        this._matrix = {
            a: this.scale,
            b: 0,
            c: this.panX,
            d: 0,
            e: this.scale,
            f: this.panY
        };
        
        const invScale = 1.0 / this.scale;
        this._inverseMatrix = {
            a: invScale,
            b: 0,
            c: -this.panX * invScale,
            d: 0,
            e: invScale,
            f: -this.panY * invScale
        };
        
        this._matrixDirty = false;
    }
    
    containerToDisplay(containerX, containerY) {
        return {
            x: containerX - this.displayX,
            y: containerY - this.displayY
        };
    }
    
    displayToContainer(displayX, displayY) {
        return {
            x: displayX + this.displayX,
            y: displayY + this.displayY
        };
    }
    
    displayToRemote(displayX, displayY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null;
        }
        
        const remoteX = (displayX / this.displayWidth) * this.remoteScreenWidth;
        const remoteY = (displayY / this.displayHeight) * this.remoteScreenHeight;
        
        return { x: remoteX, y: remoteY };
    }
    
    containerToRemote(containerX, containerY) {
        if (this.displayWidth === 0 || this.displayHeight === 0) {
            return null;
        }
        
        const display = this.containerToDisplay(containerX, containerY);
        
        if (display.x < 0 || display.x > this.displayWidth ||
            display.y < 0 || display.y > this.displayHeight) {
            return null;
        }
        
        const centerX = this.displayWidth / 2;
        const centerY = this.displayHeight / 2;
        
        const transformedX = centerX + (display.x - centerX - this.panX) / this.scale;
        const transformedY = centerY + (display.y - centerY - this.panY) / this.scale;
        
        return this.displayToRemote(transformedX, transformedY);
    }
    
    viewToVideo(viewX, viewY) {
        this._updateMatrices();
        const m = this._inverseMatrix;
        return {
            x: m.a * viewX + m.b * viewY + m.c,
            y: m.d * viewX + m.e * viewY + m.f
        };
    }
    
    videoToView(videoX, videoY) {
        this._updateMatrices();
        const m = this._matrix;
        return {
            x: m.a * videoX + m.b * videoY + m.c,
            y: m.d * videoX + m.e * videoY + m.f
        };
    }
    
    videoToRemote(videoX, videoY) {
        if (this.videoWidth === 0 || this.videoHeight === 0) {
            return { x: 0, y: 0 };
        }
        return {
            x: (videoX / this.videoWidth) * this.remoteScreenWidth,
            y: (videoY / this.videoHeight) * this.remoteScreenHeight
        };
    }
    
    remoteToVideo(remoteX, remoteY) {
        return {
            x: (remoteX / this.remoteScreenWidth) * this.videoWidth,
            y: (remoteY / this.remoteScreenHeight) * this.videoHeight
        };
    }
    
    viewToRemote(viewX, viewY) {
        const video = this.viewToVideo(viewX, viewY);
        return this.videoToRemote(video.x, video.y);
    }
    
    remoteToView(remoteX, remoteY) {
        const video = this.remoteToVideo(remoteX, remoteY);
        return this.videoToView(video.x, video.y);
    }
    
    updateScale(newScale, centerX, centerY) {
        const displayX = centerX - this.displayX;
        const displayY = centerY - this.displayY;
        
        const unscaledX = (displayX - this.panX) / this.scale;
        const unscaledY = (displayY - this.panY) / this.scale;
        
        this.scale = Math.max(0.5, Math.min(3.0, newScale));
        
        this.panX = displayX - unscaledX * this.scale;
        this.panY = displayY - unscaledY * this.scale;
        
        this._matrixDirty = true;
        this.clampPan();
    }
    
    updatePan(deltaX, deltaY) {
        this.panX += deltaX;
        this.panY += deltaY;
        this._matrixDirty = true;
        this.clampPan();
    }
    
    clampPan() {
        this._matrixDirty = true;
    }
    
    applyTransform(element) {
        element.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
        element.style.transformOrigin = '0 0';
    }
    
    applyContainerSize(containerElement, wrapperElement) {
        console.log('applyContainerSize: displayWidth=' + this.displayWidth + ', displayHeight=' + this.displayHeight + 
            ', displayX=' + this.displayX + ', displayY=' + this.displayY);
        
        if (this.displayWidth > 0 && this.displayHeight > 0) {
            containerElement.style.width = this.displayWidth + 'px';
            containerElement.style.height = this.displayHeight + 'px';
            containerElement.style.left = this.displayX + 'px';
            containerElement.style.top = this.displayY + 'px';
            
            console.log('applyContainerSize: 设置 container 尺寸为 ' + this.displayWidth + 'x' + this.displayHeight + 
                ', 位置 (' + this.displayX + ', ' + this.displayY + ')');
            
            if (wrapperElement) {
                wrapperElement.style.width = '100%';
                wrapperElement.style.height = '100%';
                wrapperElement.style.left = '0px';
                wrapperElement.style.top = '0px';
            }
        } else {
            console.log('applyContainerSize: displayWidth 或 displayHeight 为 0，跳过设置');
        }
    }
    
    reset() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this._matrixDirty = true;
    }
    
    fullReset() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.remoteScreenWidth = 1920;
        this.remoteScreenHeight = 1080;
        this.displayX = 0;
        this.displayY = 0;
        this.displayWidth = 0;
        this.displayHeight = 0;
        this._matrixDirty = true;
    }
}
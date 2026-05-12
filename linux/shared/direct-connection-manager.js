class DirectConnectionManager extends BaseConnectionManager {
    constructor(options = {}) {
        super(options);
        this.role = null;
        this.websocket = null;
        this.isController = false;
        this.address = null;
        this.port = null;
    }

    async connectAsController(address, port) {
        this.role = 'controller';
        this.isController = true;
        this.address = address;
        this.port = port;
        
        this.log(`作为控制端连接到 ${address}:${port}`);
        
        return this.connect({
            credentials: {
                role: 'controller',
                address,
                port
            }
        });
    }

    async connectAsControlled(address, port) {
        this.role = 'controlled';
        this.isController = false;
        this.address = address;
        this.port = port;
        
        this.log(`作为被控端连接到 ${address}:${port}`);
        
        return this.connect({
            credentials: {
                role: 'controlled',
                address,
                port
            }
        });
    }

    async establishSignaling(config) {
        this.log('建立WebSocket信令通道');
        
        return new Promise((resolve, reject) => {
            const wsUrl = `ws://${this.address}:${this.port}`;
            this.log('连接到WebSocket:', wsUrl);
            
            try {
                this.websocket = new WebSocket(wsUrl);
                
                this.websocket.onopen = () => {
                    this.log('WebSocket已连接');
                    resolve();
                };
                
                this.websocket.onmessage = (event) => {
                    this.handleWebSocketMessage(event.data);
                };
                
                this.websocket.onerror = (error) => {
                    this.error('WebSocket错误:', error);
                };
                
                this.websocket.onclose = (event) => {
                    this.log('WebSocket已关闭:', event.code, event.reason);
                    this.emit('websocket-close', event);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async authenticate(credentials) {
        this.log('发送角色信息');
        this.sendSignalingMessage({
            type: 'role',
            role: this.role
        });
        return { success: true };
    }

    async negotiateCapabilities() {
        this.log('协商能力');
        return {
            video: true,
            audio: false,
            clipboard: true
        };
    }

    sendSignalingMessage(message) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            this.error('WebSocket未连接，无法发送消息');
            return;
        }
        
        this.websocket.send(JSON.stringify(message));
    }

    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            this.log('收到信令消息:', message.type);
            
            switch (message.type) {
                case 'offer':
                    this.handleOffer(message.offer);
                    break;
                case 'answer':
                    this.handleAnswer(message.answer);
                    break;
                case 'ice-candidate':
                    this.handleIceCandidate(message.candidate);
                    break;
                case 'role-ack':
                    this.log('角色确认收到');
                    this.emit('role-ack');
                    break;
                default:
                    this.log('未知信令消息类型:', message.type);
            }
        } catch (error) {
            this.error('解析WebSocket消息失败:', error);
        }
    }

    async handleOffer(offer) {
        this.log('收到offer，作为被控端处理');
        
        try {
            await this.createPeerConnection({ video: true });
            
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.sendSignalingMessage({
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            });
            
            this.log('answer已发送');
            
            await this.startScreenCapture();
            
        } catch (error) {
            this.error('处理offer失败:', error);
        }
    }

    async startScreenCapture() {
        this.log('开始屏幕捕获');
        
        try {
            if (typeof navigator.mediaDevices.getDisplayMedia !== 'undefined') {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });
                
                stream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, stream);
                });
                
                this.log('屏幕捕获成功');
            } else if (window.electronAPI) {
                const sources = await window.electronAPI.getSources();
                
                if (sources && sources.length > 0) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sources[0].id,
                                maxWidth: 1920,
                                maxHeight: 1080,
                                maxFrameRate: 30
                            }
                        }
                    });
                    
                    stream.getTracks().forEach(track => {
                        this.peerConnection.addTrack(track, stream);
                    });
                    
                    this.log('屏幕捕获成功（Electron）');
                }
            } else {
                throw new Error('不支持屏幕捕获');
            }
        } catch (error) {
            this.error('屏幕捕获失败:', error);
            throw error;
        }
    }

    async connect(config) {
        this.config = config;
        this.stateMachine.transition(ConnectionState.CONNECTING);
        
        try {
            await this.establishSignaling(config);
            this.stateMachine.transition(ConnectionState.AUTHENTICATING);
            
            await this.authenticate(config.credentials || {});
            this.stateMachine.transition(ConnectionState.NEGOTIATING);
            
            const capabilities = await this.negotiateCapabilities();
            this.stateMachine.transition(ConnectionState.CREATING_CHANNEL);
            
            if (this.isController) {
                await this.createPeerConnection(capabilities);
                await this.createDataChannel();
                
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.sendSignalingMessage({
                    type: 'offer',
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp
                    }
                });
                
                this.log('offer已发送，等待answer...');
                
                await this.waitForDataChannelOpen();
                this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING);
                
                const displaySize = await this.negotiateResolution();
                this.adjustVideoContainer(displaySize);
                
                this.stateMachine.transition(ConnectionState.WAITING_VIDEO);
                await this.waitForFirstFrame();
                
                this.stateMachine.transition(ConnectionState.DISPLAYING_FIRST_FRAME);
                this.stateMachine.transition(ConnectionState.LOADING_AUXILIARY);
                this.loadAuxiliaryChannelsParallel();
                this.stateMachine.transition(ConnectionState.CONNECTED);
                
            } else {
                await new Promise((resolve) => {
                    this.once('role-ack', () => {
                        resolve();
                    });
                });
                
                this.log('等待offer...');
                
                await new Promise((resolve) => {
                    this.once('data-channel-open', () => {
                        this.stateMachine.transition(ConnectionState.RESOLUTION_NEGOTIATING);
                        
                        this.dataChannelManager.setOnMessage((data) => {
                            if (data.type === 'resolution-request') {
                                this.handleResolutionRequest(data);
                                this.once('video-ready', () => {
                                    this.stateMachine.transition(ConnectionState.CONNECTED);
                                    resolve();
                                });
                            } else {
                                this.handleDataChannelMessage(data);
                            }
                        });
                    });
                });
            }
            
            return { success: true };
            
        } catch (error) {
            this.error('连接失败:', error);
            this.stateMachine.transition(ConnectionState.ERROR, { error: error.message });
            throw error;
        }
    }

    once(event, callback) {
        const onceCallback = (data) => {
            this.off(event, onceCallback);
            callback(data);
        };
        this.on(event, onceCallback);
    }

    handleResolutionRequest(data) {
        this.log('收到分辨率请求:', data);
        
        const remoteSize = this.getPhysicalScreenSize();
        
        if (this.dataChannelManager) {
            this.dataChannelManager.send({
                type: 'resolution-response',
                width: remoteSize.width,
                height: remoteSize.height,
                originalWidth: remoteSize.originalWidth,
                originalHeight: remoteSize.originalHeight
            }, true);
        }
    }

    getPhysicalScreenSize() {
        if (window.electronAPI && window.electronAPI.getScreenSize) {
            const size = window.electronAPI.getScreenSize();
            return {
                width: size.width,
                height: size.height,
                originalWidth: size.width,
                originalHeight: size.height
            };
        }
        
        return {
            width: screen.width,
            height: screen.height,
            originalWidth: screen.width,
            originalHeight: screen.height
        };
    }

    async disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        return super.disconnect();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DirectConnectionManager };
} else {
    window.DirectConnectionManager = DirectConnectionManager;
}
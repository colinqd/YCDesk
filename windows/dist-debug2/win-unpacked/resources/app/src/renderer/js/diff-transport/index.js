/**
 * DiffTransport - 差异传输模块入口
 * 提供与现有 WebRTC 代码的无侵入式集成
 */
const DiffTransport = {
    DiffDetector: null,
    DiffEncoder: null,
    DiffDecoder: null,
    DiffTransportManager: null,
    
    initialized: false,
    
    init() {
        if (this.initialized) return;
        
        this.DiffDetector = DiffDetector;
        this.DiffEncoder = DiffEncoder;
        this.DiffDecoder = DiffDecoder;
        this.DiffTransportManager = DiffTransportManager;
        
        this.initialized = true;
        console.log('DiffTransport: 模块已初始化');
    },
    
    createSender(options = {}) {
        this.init();
        return new DiffTransportManager({
            mode: 'sender',
            ...options
        });
    },
    
    createReceiver(options = {}) {
        this.init();
        return new DiffTransportManager({
            mode: 'receiver',
            ...options
        });
    },
    
    async integrateWithPeerConnection(peerConnection, options = {}) {
        this.init();
        
        const manager = new DiffTransportManager(options);
        
        const dataChannel = peerConnection.createDataChannel('diff-transport', {
            ordered: true,
            maxRetransmits: 0
        });
        
        manager.setDataChannel(dataChannel);
        
        return manager;
    },
    
    async integrateWithExistingDataChannel(dataChannel, options = {}) {
        this.init();
        
        const manager = new DiffTransportManager(options);
        manager.setDataChannel(dataChannel);
        
        return manager;
    }
};

if (typeof window !== 'undefined') {
    window.DiffTransport = DiffTransport;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffTransport;
}

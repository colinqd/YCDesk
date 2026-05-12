const io = require('socket.io-client');

class SignalingServer {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.deviceId = null;
    this.logger = null;
    this.callbacks = {
      onIncomingConnection: null,
      onConnectionResult: null,
      onOffer: null,
      onAnswer: null,
      onIceCandidate: null
    };
  }

  init(deviceId, logger) {
    this.deviceId = deviceId;
    this.logger = logger;
  }

  updateDeviceId(newDeviceId) {
    this.deviceId = newDeviceId;
    this._log('info', '设备ID已更新:', newDeviceId);
    if (this.socket && this.isConnected) {
      this.socket.emit('register', this.deviceId);
      this._log('info', '设备已重新注册:', this.deviceId);
    }
  }

  _log(level, message, data) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, data);
    }
  }

  async connect(serverUrl) {
    if (this.socket && this.socket.connected) {
      this._log('info', '已经连接到信令服务器');
      return { success: true, message: '已连接' };
    }

    try {
      this._log('info', '正在连接信令服务器:', serverUrl);

      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000
      });

      return new Promise((resolve) => {
        this.socket.on('connect', () => {
          this.isConnected = true;
          this._log('info', '信令服务器连接成功，Socket ID:', this.socket.id);
          
          this.socket.emit('register', this.deviceId);
          this._log('info', '设备已注册:', this.deviceId);
          
          resolve({ success: true, message: '连接成功' });
        });

        this.socket.on('connect_error', (error) => {
          this.isConnected = false;
          this._log('error', '信令服务器连接失败:', error.message);
          resolve({ success: false, error: error.message });
        });

        this.socket.on('disconnect', (reason) => {
          this.isConnected = false;
          this._log('info', '信令服务器断开连接:', reason);
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
          this._log('info', '正在尝试重连... (第' + attemptNumber + '次)');
        });

        this.socket.on('reconnect_failed', () => {
          this.isConnected = false;
          this._log('error', '重连失败，请检查服务器地址和网络连接');
        });

        this.socket.on('incoming-connection', (data) => {
          this._log('info', '收到连接请求:', data);
          if (this.callbacks.onIncomingConnection) {
            this.callbacks.onIncomingConnection(data);
          }
        });

        this.socket.on('connection-result', (data) => {
          this._log('info', '收到连接结果:', data);
          if (this.callbacks.onConnectionResult) {
            this.callbacks.onConnectionResult(data);
          }
        });

        this.socket.on('offer', (data) => {
          this._log('info', '收到Offer:', data);
          if (this.callbacks.onOffer) {
            this.callbacks.onOffer(data);
          }
        });

        this.socket.on('answer', (data) => {
          this._log('info', '收到Answer:', data);
          if (this.callbacks.onAnswer) {
            this.callbacks.onAnswer(data);
          }
        });

        this.socket.on('ice-candidate', (data) => {
          this._log('info', '收到ICE候选:', data);
          if (this.callbacks.onIceCandidate) {
            this.callbacks.onIceCandidate(data);
          }
        });
      });
    } catch (error) {
      this._log('error', '连接信令服务器异常:', error.message);
      return { success: false, error: error.message };
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this._log('info', '已断开信令服务器连接');
    }
  }

  sendConnectRequest(toDeviceId) {
    if (!this.socket || !this.isConnected) {
      this._log('error', '信令服务器未连接，无法发送连接请求');
      return { success: false, error: '未连接到信令服务器' };
    }

    try {
      this.socket.emit('connect-request', {
        fromDeviceId: this.deviceId,
        toDeviceId: toDeviceId
      });
      this._log('info', '发送连接请求:', this.deviceId, '->', toDeviceId);
      return { success: true, message: '连接请求已发送' };
    } catch (error) {
      this._log('error', '发送连接请求失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  sendConnectionResponse(sessionId, accepted, fromDeviceId, toDeviceId) {
    if (!this.socket || !this.isConnected) {
      this._log('error', '信令服务器未连接，无法发送连接响应');
      return { success: false, error: '未连接到信令服务器' };
    }

    try {
      this.socket.emit('connection-response', {
        sessionId: sessionId,
        accepted: accepted,
        fromDeviceId: fromDeviceId,
        toDeviceId: toDeviceId
      });
      this._log('info', '发送连接响应:', sessionId, '->', accepted ? 'accepted' : 'rejected');
      return { success: true, message: '连接响应已发送' };
    } catch (error) {
      this._log('error', '发送连接响应失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  sendOffer(sessionId, offer, toDeviceId) {
    if (!this.socket || !this.isConnected) {
      this._log('error', '信令服务器未连接，无法发送offer');
      return { success: false, error: '未连接到信令服务器' };
    }

    try {
      this.socket.emit('offer', {
        sessionId: sessionId,
        offer: offer,
        toDeviceId: toDeviceId
      });
      this._log('info', '发送Offer:', sessionId, '->', toDeviceId);
      return { success: true, message: 'Offer已发送' };
    } catch (error) {
      this._log('error', '发送Offer失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  sendAnswer(sessionId, answer, toDeviceId) {
    if (!this.socket || !this.isConnected) {
      this._log('error', '信令服务器未连接，无法发送answer');
      return { success: false, error: '未连接到信令服务器' };
    }

    try {
      this.socket.emit('answer', {
        sessionId: sessionId,
        answer: answer,
        toDeviceId: toDeviceId
      });
      this._log('info', '发送Answer:', sessionId, '->', toDeviceId);
      return { success: true, message: 'Answer已发送' };
    } catch (error) {
      this._log('error', '发送Answer失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  sendIceCandidate(sessionId, candidate, toDeviceId) {
    if (!this.socket || !this.isConnected) {
      this._log('error', '信令服务器未连接，无法发送ICE候选');
      return { success: false, error: '未连接到信令服务器' };
    }

    try {
      this.socket.emit('ice-candidate', {
        sessionId: sessionId,
        candidate: candidate,
        toDeviceId: toDeviceId
      });
      this._log('info', '发送ICE候选:', sessionId, '->', toDeviceId);
      return { success: true, message: 'ICE候选已发送' };
    } catch (error) {
      this._log('error', '发送ICE候选失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  onIncomingConnection(callback) {
    this.callbacks.onIncomingConnection = callback;
  }

  onConnectionResult(callback) {
    this.callbacks.onConnectionResult = callback;
  }

  onOffer(callback) {
    this.callbacks.onOffer = callback;
  }

  onAnswer(callback) {
    this.callbacks.onAnswer = callback;
  }

  onIceCandidate(callback) {
    this.callbacks.onIceCandidate = callback;
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      deviceId: this.deviceId,
      socketId: this.socket ? this.socket.id : null
    };
  }
}

module.exports = new SignalingServer();

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

class SignalingServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      cert: options.cert || null,
      key: options.key || null,
      noHttps: options.noHttps || false
    };
    
    this.app = express();
    this.server = null;
    this.io = null;
    this.devices = new Map();
    this.sessions = new Map();
    this.cleanupInterval = null;
    this.protocol = 'http';
    this.wsProtocol = 'ws';
    this.isRunning = false;
    
    this.onLog = options.onLog || console.log;
  }

  log(message, type = 'info') {
    this.onLog(message, type);
  }

  start() {
    if (this.isRunning) {
      this.log('服务器已经在运行中', 'warning');
      return false;
    }

    try {
      this._createServer();
      this._setupMiddleware();
      this._setupWebSocket();
      this._setupSocketIO();
      this._startServer();
      this._startCleanup();
      this.isRunning = true;
      return true;
    } catch (error) {
      this.log('启动服务器失败: ' + error.message, 'error');
      return false;
    }
  }

  stop() {
    if (!this.isRunning) {
      this.log('服务器未在运行', 'warning');
      return;
    }

    this.log('正在停止服务器...', 'info');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    if (this.server) {
      this.server.close(() => {
        this.log('服务器已停止', 'info');
      });
      this.server = null;
    }

    this.devices.clear();
    this.sessions.clear();
    this.isRunning = false;
  }

  _createServer() {
    if (!this.options.noHttps && this.options.cert && this.options.key) {
      try {
        const httpsOptions = {
          cert: fs.readFileSync(path.resolve(this.options.cert)),
          key: fs.readFileSync(path.resolve(this.options.key))
        };
        this.server = https.createServer(httpsOptions, this.app);
        this.protocol = 'https';
        this.wsProtocol = 'wss';
        this.log('使用 HTTPS/WSS 模式', 'info');
      } catch (error) {
        this.log('加载证书失败，回退到 HTTP 模式: ' + error.message, 'error');
        this.server = http.createServer(this.app);
      }
    } else {
      this.server = http.createServer(this.app);
      this.log('使用 HTTP/WS 模式', 'info');
    }
  }

  _setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());

    this.app.get('/', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YCDesk 信令服务器</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 20px; }
    .status { padding: 15px; background: #d4edda; color: #155724; border-radius: 5px; margin-bottom: 20px; }
    .info { margin: 10px 0; color: #666; }
    .device-list { margin-top: 20px; }
    .device-item { padding: 10px; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <h1>YCDesk 信令服务器</h1>
    <div class="status">服务器运行中</div>
    <div class="info">协议: ${this.protocol}://</div>
    <div class="info">端口: ${this.options.port}</div>
    <div class="info">在线设备: ${this.devices.size}</div>
  </div>
</body>
</html>`);
    });
  }

  _setupWebSocket() {
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ noServer: true });
    
    this.server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });
    
    wss.on('connection', (ws, req) => {
      this.log('原始 WebSocket 连接: ' + req.socket.remoteAddress, 'info');
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleWebSocketMessage(ws, data);
        } catch (e) {
          this.log('解析消息失败: ' + e.message, 'error');
        }
      });
      
      ws.on('close', () => {
        this.log('原始 WebSocket 断开', 'info');
        for (const [deviceId, device] of this.devices.entries()) {
          if (device.socket === ws) {
            this.devices.delete(deviceId);
            break;
          }
        }
      });
    });
  }

  _findDeviceBySocket(ws) {
    for (const [deviceId, device] of this.devices.entries()) {
      if (device.socket === ws) {
        return deviceId;
      }
    }
    return null;
  }

  _handleWebSocketMessage(ws, data) {
    const type = data.type;
    const senderDeviceId = this._findDeviceBySocket(ws);
    
    switch (type) {
      case 'register': {
        const { deviceId } = data;
        this.devices.set(deviceId, {
          socket: ws,
          socketId: ws._socket.remoteAddress,
          deviceId: deviceId,
          lastSeen: new Date()
        });
        this.log('设备注册: ' + deviceId, 'info');
        ws.send(JSON.stringify({ type: 'registered', deviceId }));
        break;
      }
      case 'connect-request': {
        const { fromDeviceId, toDeviceId } = data;
        const sessionId = this._generateSessionId();
        this.sessions.set(sessionId, {
          fromDeviceId,
          toDeviceId,
          status: 'pending',
          createdAt: new Date()
        });

        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'incoming-connection',
              fromDeviceId,
              sessionId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('incoming-connection', {
              fromDeviceId,
              sessionId
            });
          }
          this.log('连接请求: ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        } else {
          this.log('目标设备不在线: ' + toDeviceId, 'warning');
          ws.send(JSON.stringify({
            type: 'connection-failed',
            reason: 'device-offline',
            toDeviceId
          }));
        }
        break;
      }
      case 'connection-response': {
        const { sessionId, accepted, fromDeviceId, toDeviceId } = data;
        const session = this.sessions.get(sessionId);
        if (session) {
          session.status = accepted ? 'accepted' : 'rejected';
          const fromDevice = this.devices.get(session.fromDeviceId);
          if (fromDevice) {
            if (fromDevice.socket) {
              fromDevice.socket.send(JSON.stringify({
                type: 'connection-result',
                accepted,
                sessionId,
                fromDeviceId: session.fromDeviceId,
                toDeviceId: session.toDeviceId
              }));
            } else if (fromDevice.socketId) {
              this.io.to(fromDevice.socketId).emit('connection-result', {
                accepted,
                sessionId,
                fromDeviceId: session.fromDeviceId,
                toDeviceId: session.toDeviceId
              });
            }
          }
          this.log('连接响应: ' + sessionId + ' -> ' + (accepted ? 'accepted' : 'rejected'), 'info');
        }
        break;
      }
      case 'offer': {
        const { sessionId, offer, toDeviceId } = data;
        const fromDeviceId = data.fromDeviceId || senderDeviceId;
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'offer',
              sessionId,
              offer,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('offer', {
              sessionId,
              offer,
              fromDeviceId
            });
          }
          this.log('转发Offer: ' + sessionId + ' ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        }
        break;
      }
      case 'answer': {
        const { sessionId, answer, toDeviceId } = data;
        const fromDeviceId = data.fromDeviceId || senderDeviceId;
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'answer',
              sessionId,
              answer,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('answer', {
              sessionId,
              answer,
              fromDeviceId
            });
          }
          this.log('转发Answer: ' + sessionId + ' ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        }
        break;
      }
      case 'ice-candidate': {
        const { sessionId, candidate, toDeviceId } = data;
        const fromDeviceId = data.fromDeviceId || senderDeviceId;
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'ice-candidate',
              sessionId,
              candidate,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('ice-candidate', {
              sessionId,
              candidate,
              fromDeviceId
            });
          }
        }
        break;
      }
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
        break;
      }
    }
  }

  _setupSocketIO() {
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      this.log('新连接: ' + socket.id, 'info');

      socket.on('register', (data) => {
        const { deviceId } = data;
        this.devices.set(deviceId, {
          socketId: socket.id,
          deviceId: deviceId,
          lastSeen: new Date()
        });
        this.log('设备注册: ' + deviceId, 'info');
        socket.emit('registered', { deviceId });
      });

      socket.on('connect-request', (data) => {
        const { fromDeviceId, toDeviceId } = data;
        const sessionId = this._generateSessionId();
        this.sessions.set(sessionId, {
          fromDeviceId,
          toDeviceId,
          status: 'pending',
          createdAt: new Date()
        });

        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'incoming-connection',
              fromDeviceId,
              sessionId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('incoming-connection', {
              fromDeviceId,
              sessionId
            });
          }
          this.log('连接请求: ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        } else {
          this.log('目标设备不在线: ' + toDeviceId, 'warning');
          socket.emit('connection-failed', {
            reason: 'device-offline',
            toDeviceId
          });
        }
      });

      socket.on('connection-response', (data) => {
        const { sessionId, accepted } = data;
        const session = this.sessions.get(sessionId);
        if (session) {
          session.status = accepted ? 'accepted' : 'rejected';
          const fromDevice = this.devices.get(session.fromDeviceId);
          if (fromDevice) {
            if (fromDevice.socket) {
              fromDevice.socket.send(JSON.stringify({
                type: 'connection-result',
                accepted,
                sessionId,
                fromDeviceId: session.fromDeviceId,
                toDeviceId: session.toDeviceId
              }));
            } else if (fromDevice.socketId) {
              this.io.to(fromDevice.socketId).emit('connection-result', {
                accepted,
                sessionId,
                fromDeviceId: session.fromDeviceId,
                toDeviceId: session.toDeviceId
              });
            }
          }
          this.log('连接响应: ' + sessionId + ' -> ' + (accepted ? 'accepted' : 'rejected'), 'info');
        }
      });

      socket.on('offer', (data) => {
        const { sessionId, offer, toDeviceId } = data;
        const fromDeviceId = this._findDeviceBySocketId(socket.id);
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'offer',
              sessionId,
              offer,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('offer', {
              sessionId,
              offer,
              fromDeviceId
            });
          }
          this.log('转发Offer: ' + sessionId + ' ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        }
      });

      socket.on('answer', (data) => {
        const { sessionId, answer, toDeviceId } = data;
        const fromDeviceId = this._findDeviceBySocketId(socket.id);
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'answer',
              sessionId,
              answer,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('answer', {
              sessionId,
              answer,
              fromDeviceId
            });
          }
          this.log('转发Answer: ' + sessionId + ' ' + fromDeviceId + ' -> ' + toDeviceId, 'info');
        }
      });

      socket.on('ice-candidate', (data) => {
        const { sessionId, candidate, toDeviceId } = data;
        const fromDeviceId = this._findDeviceBySocketId(socket.id);
        const toDevice = this.devices.get(toDeviceId);
        if (toDevice) {
          if (toDevice.socket) {
            toDevice.socket.send(JSON.stringify({
              type: 'ice-candidate',
              sessionId,
              candidate,
              fromDeviceId
            }));
          } else if (toDevice.socketId) {
            this.io.to(toDevice.socketId).emit('ice-candidate', {
              sessionId,
              candidate,
              fromDeviceId
            });
          }
        }
      });

      socket.on('disconnect', () => {
        for (const [deviceId, device] of this.devices.entries()) {
          if (device.socketId === socket.id) {
            this.devices.delete(deviceId);
            this.log('设备断开: ' + deviceId, 'info');
            break;
          }
        }
      });
    });
  }

  _findDeviceBySocketId(socketId) {
    for (const [deviceId, device] of this.devices.entries()) {
      if (device.socketId === socketId) {
        return deviceId;
      }
    }
    return null;
  }

  _startServer() {
    this.server.listen(this.options.port, '0.0.0.0', () => {
      this.log(`信令服务器运行在 ${this.protocol}://0.0.0.0:${this.options.port}`, 'info');
      this.log(`WebSocket 协议: ${this.wsProtocol}://`, 'info');
      this.log('服务器状态: 正常', 'info');
    });
  }

  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      for (const [sessionId, session] of this.sessions.entries()) {
        const age = now - session.createdAt;
        if (age > 300000) {
          this.sessions.delete(sessionId);
          this.log('清理过期会话: ' + sessionId, 'info');
        }
      }
    }, 60000);
  }

  _generateSessionId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
  }
}

module.exports = SignalingServer;

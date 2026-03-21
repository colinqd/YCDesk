const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const devices = new Map();
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('设备连接:', socket.id);

  socket.on('register', (deviceId) => {
    devices.set(deviceId, {
      socketId: socket.id,
      deviceId: deviceId,
      online: true,
      lastSeen: Date.now()
    });
    console.log('设备注册:', deviceId);
    
    io.emit('device-list', Array.from(devices.values()));
  });

  socket.on('connect-request', (data) => {
    const { fromDeviceId, toDeviceId } = data;
    const targetDevice = devices.get(toDeviceId);
    
    if (targetDevice && targetDevice.online) {
      io.to(targetDevice.socketId).emit('incoming-connection', {
        fromDeviceId: fromDeviceId,
        sessionId: generateSessionId()
      });
      console.log('连接请求:', fromDeviceId, '->', toDeviceId);
    } else {
      socket.emit('connection-failed', { 
        reason: '设备不在线或不存在' 
      });
    }
  });

  socket.on('connection-response', (data) => {
    const { sessionId, accepted, fromDeviceId, toDeviceId } = data;
    const fromDevice = devices.get(fromDeviceId);
    
    if (fromDevice) {
      io.to(fromDevice.socketId).emit('connection-result', {
        sessionId: sessionId,
        accepted: accepted
      });
      
      if (accepted) {
        sessions.set(sessionId, {
          controller: fromDeviceId,
          controlled: toDeviceId,
          startTime: Date.now()
        });
        console.log('连接建立:', sessionId);
      }
    }
  });

  socket.on('offer', (data) => {
    const { sessionId, offer, toDeviceId } = data;
    const targetDevice = devices.get(toDeviceId);
    if (targetDevice) {
      io.to(targetDevice.socketId).emit('offer', { sessionId, offer });
    }
  });

  socket.on('answer', (data) => {
    const { sessionId, answer, toDeviceId } = data;
    const targetDevice = devices.get(toDeviceId);
    if (targetDevice) {
      io.to(targetDevice.socketId).emit('answer', { sessionId, answer });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { sessionId, candidate, toDeviceId } = data;
    const targetDevice = devices.get(toDeviceId);
    if (targetDevice) {
      io.to(targetDevice.socketId).emit('ice-candidate', { sessionId, candidate });
    }
  });

  socket.on('disconnect', () => {
    for (const [deviceId, device] of devices) {
      if (device.socketId === socket.id) {
        devices.delete(deviceId);
        console.log('设备断开:', deviceId);
        io.emit('device-list', Array.from(devices.values()));
        break;
      }
    }
  });
});

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substr(2, 16);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`YCDesk 信令服务器运行在端口 ${PORT}`);
  console.log(`WebSocket 服务器已启动`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// 存储在线设备
const devices = new Map();

// 存储会话信息
const sessions = new Map();

app.get('/', (req, res) => {
  res.json({
    message: 'YCDesk Signaling Server',
    status: 'running',
    onlineDevices: Array.from(devices.keys())
  });
});

io.on('connection', (socket) => {
  console.log('新连接:', socket.id);

  // 设备注册
  socket.on('register', (deviceId) => {
    devices.set(deviceId, {
      socketId: socket.id,
      lastSeen: new Date()
    });
    console.log('设备注册:', deviceId, '->', socket.id);
  });

  // 连接请求
  socket.on('connect-request', (data) => {
    const { fromDeviceId, toDeviceId } = data;
    const toDevice = devices.get(toDeviceId);
    
    if (toDevice) {
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        fromDeviceId,
        toDeviceId,
        status: 'pending',
        createdAt: new Date()
      });
      
      io.to(toDevice.socketId).emit('incoming-connection', {
        fromDeviceId,
        sessionId
      });
      console.log('连接请求:', fromDeviceId, '->', toDeviceId, 'session:', sessionId);
    } else {
      // 设备不在线
      const fromDevice = devices.get(fromDeviceId);
      if (fromDevice) {
        io.to(fromDevice.socketId).emit('connection-result', {
          accepted: false,
          error: 'Device not online'
        });
      }
    }
  });

  // 连接响应
  socket.on('connection-response', (data) => {
    const { sessionId, accepted, fromDeviceId, toDeviceId } = data;
    const session = sessions.get(sessionId);
    
    if (session) {
      session.status = accepted ? 'accepted' : 'rejected';
      sessions.set(sessionId, session);
      
      const fromDevice = devices.get(fromDeviceId);
      if (fromDevice) {
        io.to(fromDevice.socketId).emit('connection-result', {
          accepted,
          sessionId
        });
      }
      console.log('连接响应:', sessionId, '->', accepted ? 'accepted' : 'rejected');
    }
  });

  // WebRTC Offer
  socket.on('offer', (data) => {
    const { sessionId, offer, toDeviceId } = data;
    const toDevice = devices.get(toDeviceId);
    
    if (toDevice) {
      io.to(toDevice.socketId).emit('offer', {
        sessionId,
        offer
      });
      console.log('转发Offer:', sessionId, '->', toDeviceId);
    }
  });

  // WebRTC Answer
  socket.on('answer', (data) => {
    const { sessionId, answer, toDeviceId } = data;
    const toDevice = devices.get(toDeviceId);
    
    if (toDevice) {
      io.to(toDevice.socketId).emit('answer', {
        sessionId,
        answer
      });
      console.log('转发Answer:', sessionId, '->', toDeviceId);
    }
  });

  // ICE Candidate
  socket.on('ice-candidate', (data) => {
    const { sessionId, candidate, toDeviceId } = data;
    const toDevice = devices.get(toDeviceId);
    
    if (toDevice) {
      io.to(toDevice.socketId).emit('ice-candidate', {
        sessionId,
        candidate
      });
      console.log('转发ICE Candidate:', sessionId, '->', toDeviceId);
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('连接断开:', socket.id);
    
    // 清理设备记录
    for (const [deviceId, device] of devices.entries()) {
      if (device.socketId === socket.id) {
        devices.delete(deviceId);
        console.log('设备断开:', deviceId);
        break;
      }
    }
  });
});

function generateSessionId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`信令服务器运行在 http://localhost:${PORT}`);
  console.log('服务器状态: 正常');
});

// 定期清理过期会话
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of sessions.entries()) {
    const age = now - session.createdAt;
    if (age > 300000) { // 5分钟过期
      sessions.delete(sessionId);
      console.log('清理过期会话:', sessionId);
    }
  }
}, 60000); // 每分钟检查一次
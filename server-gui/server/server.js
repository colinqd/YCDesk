const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  port: 3000,
  cert: null,
  key: null,
  noHttps: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    options.port = parseInt(args[i + 1]);
  } else if (args[i] === '--cert' && args[i + 1]) {
    options.cert = args[i + 1];
  } else if (args[i] === '--key' && args[i + 1]) {
    options.key = args[i + 1];
  } else if (args[i] === '--no-https') {
    options.noHttps = true;
  }
}

// 创建 HTTP 或 HTTPS 服务器
let server;
let protocol = 'http';
let wsProtocol = 'ws';

if (!options.noHttps && options.cert && options.key) {
  try {
    const httpsOptions = {
      cert: fs.readFileSync(path.resolve(options.cert)),
      key: fs.readFileSync(path.resolve(options.key))
    };
    server = https.createServer(httpsOptions, app);
    protocol = 'https';
    wsProtocol = 'wss';
    console.log('使用 HTTPS/WSS 模式');
  } catch (error) {
    console.error('加载证书失败，回退到 HTTP 模式:', error.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
  console.log('使用 HTTP/WS 模式');
}

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

// 服务器管理页面
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YCDesk 信令服务器</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    .status {
      padding: 15px;
      background: #e8f5e9;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .status-online {
      color: #2e7d32;
      font-weight: bold;
    }
    .info {
      margin: 10px 0;
    }
    .info-label {
      font-weight: bold;
      color: #666;
    }
    .info-value {
      color: #333;
    }
    .shutdown-btn {
      background: #f44336;
      color: white;
      border: none;
      padding: 12px 30px;
      font-size: 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 20px;
    }
    .shutdown-btn:hover {
      background: #d32f2f;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>YCDesk 信令服务器</h1>
    <div class="status">
      <div class="info">
        <span class="info-label">服务器状态：</span>
        <span class="status-online">运行中</span>
      </div>
      <div class="info">
        <span class="info-label">在线设备：</span>
        <span class="info-value" id="deviceCount">0</span>
      </div>
      <div class="info">
        <span class="info-label">运行端口：</span>
        <span class="info-value">${process.env.PORT || 3000}</span>
      </div>
    </div>
    <button class="shutdown-btn" onclick="shutdownServer()">关闭服务器</button>
  </div>
  <script>
    // 定期更新设备数量
    setInterval(async () => {
      const response = await fetch('/api/status');
      const data = await response.json();
      document.getElementById('deviceCount').textContent = data.onlineDevices.length;
    }, 2000);

    async function shutdownServer() {
      if (confirm('确定要关闭服务器吗？')) {
        try {
          const response = await fetch('/api/shutdown', { method: 'POST' });
          const result = await response.json();
          alert(result.message);
        } catch (error) {
          alert('服务器已关闭');
        }
      }
    }
  </script>
</body>
</html>
  `);
});

// API: 获取服务器状态
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    onlineDevices: Array.from(devices.keys()),
    port: process.env.PORT || 3000
  });
});

// API: 关闭服务器
app.post('/api/shutdown', (req, res) => {
  console.log('收到关闭服务器请求');
  res.json({ message: '服务器正在关闭...' });
  setTimeout(() => {
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  }, 1000);
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
          sessionId,
          fromDeviceId: session.fromDeviceId,
          toDeviceId: session.toDeviceId
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

const PORT = process.env.PORT || options.port;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`信令服务器运行在 ${protocol}://0.0.0.0:${PORT}`);
  console.log(`WebSocket 协议: ${wsProtocol}://`);
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
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { io } from 'socket.io-client';

let myDeviceId = '';
let socket = null;
let peerConnection = null;
let currentSessionId = null;
let incomingFromDeviceId = null;
let isController = false;
let dataChannel = null;
let connectionMode = 'signaling';
let isConnected = false;
let isMouseMode = false;

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getServerUrl() {
  return document.getElementById('serverUrl').value;
}

function getIceConfig() {
  if (connectionMode === 'direct') {
    return { iceServers: [] };
  }
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
}

function showToast(message, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function updateServerStatus(text, status) {
  const statusText = document.getElementById('serverStatusText');
  const statusBadge = document.getElementById('serverStatus');
  const statusDot = document.querySelector('.status-dot');
  
  statusText.textContent = text;
  
  const statusStyles = {
    'connected': { bg: '#e6f4ea', color: '#135429', dotColor: '#2ecc71' },
    'connecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107' },
    'disconnected': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' },
    'error': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' }
  };
  
  const style = statusStyles[status] || statusStyles['disconnected'];
  statusBadge.style.background = style.bg;
  statusBadge.style.color = style.color;
  statusDot.style.background = style.dotColor;
}

async function copyDeviceId() {
  try {
    await navigator.clipboard.writeText(myDeviceId);
    showToast('设备ID已复制');
    const el = document.getElementById('deviceId');
    const originalText = el.textContent;
    el.textContent = '已复制!';
    setTimeout(() => {
      el.textContent = originalText;
    }, 1500);
  } catch (err) {
    showToast('复制失败');
  }
}

function selectMode(mode, element) {
  connectionMode = mode;
  
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  element.classList.add('selected');
  
  document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
    radio.checked = radio.value === mode;
  });
  
  document.getElementById('signalingSettings').style.display = mode === 'signaling' ? 'block' : 'none';
  document.getElementById('directSettings').style.display = mode === 'direct' ? 'block' : 'none';
  
  if (mode === 'signaling') {
    const serverUrl = getServerUrl();
    if (serverUrl) {
      connectToServer();
    }
  } else {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    updateServerStatus('直连模式', 'connected');
  }
  
  console.log('切换连接模式:', mode);
}

function connectToServer() {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    showToast('请先输入信令服务器地址');
    return;
  }
  
  console.log('正在连接信令服务器...', serverUrl);
  updateServerStatus('连接中...', 'connecting');
  
  try {
    socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('已连接到信令服务器');
      socket.emit('register', myDeviceId);
      updateServerStatus('已连接', 'connected');
      showToast('已连接到信令服务器');
    });

    socket.on('disconnect', () => {
      console.log('与信令服务器断开连接');
      updateServerStatus('已断开', 'disconnected');
    });

    socket.on('connect_error', (error) => {
      console.log('连接错误:', error);
      updateServerStatus('连接失败', 'error');
      showToast('连接服务器失败');
    });

    socket.on('incoming-connection', (data) => {
      console.log('收到连接请求:', data);
      incomingFromDeviceId = data.fromDeviceId;
      currentSessionId = data.sessionId;
      isController = false;
      showToast(`设备 ${data.fromDeviceId} 请求连接`);
    });

    socket.on('connection-result', async (data) => {
      console.log('连接结果:', data);
      if (data.accepted) {
        isController = true;
        await startControllerConnection();
      } else {
        showToast('对方拒绝了连接请求');
      }
    });

    socket.on('offer', async (data) => {
      console.log('收到 offer:', data);
      await handleOffer(data);
    });

    socket.on('answer', async (data) => {
      console.log('收到 answer:', data);
      await handleAnswer(data);
    });

    socket.on('ice-candidate', async (data) => {
      console.log('收到 ICE candidate:', data);
      await handleIceCandidate(data);
    });
  } catch (error) {
    console.error('连接服务器错误:', error);
    showToast('连接失败');
    updateServerStatus('连接失败', 'error');
  }
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase();
  if (!targetId) {
    showToast('请输入设备 ID');
    return;
  }
  if (targetId.length !== 9) {
    showToast('设备 ID 格式不正确');
    return;
  }
  if (targetId === myDeviceId) {
    showToast('不能连接自己');
    return;
  }
  
  if (connectionMode === 'signaling') {
    if (!socket || !socket.connected) {
      showToast('未连接到信令服务器');
      return;
    }

    incomingFromDeviceId = targetId;
    socket.emit('connect-request', {
      fromDeviceId: myDeviceId,
      toDeviceId: targetId
    });

    showToast('连接请求已发送');
  } else {
    showToast('直连模式开发中');
  }
}

async function startControllerConnection() {
  console.log('作为主控端建立连接');
  await createPeerConnection();
  
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.emit('offer', {
      sessionId: currentSessionId,
      offer: offer,
      toDeviceId: incomingFromDeviceId
    });
  } catch (error) {
    console.error('创建 offer 失败:', error);
    showToast('连接失败');
  }
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(getIceConfig());

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('ice-candidate', {
        sessionId: currentSessionId,
        candidate: event.candidate,
        toDeviceId: incomingFromDeviceId
      });
    }
  };

  peerConnection.ontrack = (event) => {
    console.log('收到远程媒体流');
    const stream = event.streams[0];
    const remoteVideo = document.getElementById('remoteVideo');
    remoteVideo.srcObject = stream;
    showRemoteScreen();
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('连接状态:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      isConnected = true;
      showToast('连接成功');
    } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      isConnected = false;
      showToast('连接已断开');
      hideRemoteScreen();
    }
  };

  peerConnection.ondatachannel = (event) => {
    console.log('收到数据通道');
    dataChannel = event.channel;
    setupDataChannel();
  };

  if (isController) {
    console.log('创建数据通道（主控端）');
    dataChannel = peerConnection.createDataChannel('control');
    setupDataChannel();
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log('数据通道已打开');
  };

  dataChannel.onmessage = (event) => {
    console.log('收到数据通道消息:', event.data);
  };

  dataChannel.onclose = () => {
    console.log('数据通道已关闭');
  };

  dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error);
  };
}

async function handleOffer(data) {
  incomingFromDeviceId = data.fromDeviceId || incomingFromDeviceId;
  currentSessionId = data.sessionId;
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  
  socket.emit('answer', {
    sessionId: currentSessionId,
    answer: answer,
    toDeviceId: incomingFromDeviceId
  });
}

async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

async function handleIceCandidate(data) {
  if (data.candidate && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function showRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'none';
  document.getElementById('remoteScreen').classList.add('active');
}

function hideRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'block';
  document.getElementById('remoteScreen').classList.remove('active');
  const remoteVideo = document.getElementById('remoteVideo');
  remoteVideo.srcObject = null;
}

function showKeyboard() {
  showToast('键盘功能开发中');
}

function toggleMouse() {
  isMouseMode = !isMouseMode;
  showToast(isMouseMode ? '鼠标模式已开启' : '鼠标模式已关闭');
}

function disconnect() {
  if (confirm('确定要断开连接吗？')) {
    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    isConnected = false;
    isController = false;
    hideRemoteScreen();
    showToast('已断开连接');
  }
}

async function init() {
  console.log('YCDesk Android 初始化');
  
  try {
    const deviceInfo = await Device.getInfo();
    console.log('设备信息:', deviceInfo);
  } catch (e) {
    console.log('获取设备信息失败');
  }
  
  myDeviceId = generateDeviceId();
  document.getElementById('deviceId').textContent = myDeviceId;
  
  const networkStatus = await Network.getStatus();
  console.log('网络状态:', networkStatus);
  
  Network.addListener('networkStatusChange', (status) => {
    console.log('网络状态变化:', status);
    if (!status.connected) {
      showToast('网络已断开');
    }
  });
  
  App.addListener('backButton', ({ canGoBack }) => {
    if (isConnected) {
      disconnect();
    } else {
      App.exitApp();
    }
  });
  
  console.log('初始化完成，设备ID:', myDeviceId);
}

document.addEventListener('DOMContentLoaded', init);

window.selectMode = selectMode;
window.copyDeviceId = copyDeviceId;
window.connectDevice = connectDevice;
window.showKeyboard = showKeyboard;
window.toggleMouse = toggleMouse;
window.disconnect = disconnect;

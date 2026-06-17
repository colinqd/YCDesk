/**
 * 设备列表与历史记录管理
 *
 * 依赖 app.js 中定义的全局状态 (historyManager, log)。
 * 通过 <script> 标签加载，函数自动注册为全局。
 */

// ==================== 历史连接记录 ====================

function renderHistory(type) {
  const history = historyManager.loadHistory(type)
  const listId = type === 'direct' ? 'directHistoryList' : 'signalingHistoryList'
  const listEl = document.getElementById(listId)

  if (!listEl) return

  if (history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史连接记录</div>'
    return
  }

  listEl.innerHTML = history.map((item, index) => {
    const time = new Date(item.timestamp).toLocaleString('zh-CN')
    let targetText = ''

    if (type === 'direct') {
      targetText = `${item.ip}:${item.port}`
    } else {
      targetText = `设备: ${item.deviceId}`
    }

    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${targetText}</div>
          <div class="history-time">${time}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="reconnectFromHistory('${type}', ${index})">重连</button>
          <button class="history-btn history-btn-delete" onclick="deleteFromHistory('${type}', ${index})">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function reconnectFromHistory(type, index) {
  const item = historyManager.getHistoryItem(type, index)
  if (!item) return

  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('controllerServerUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId

    if (!signalingManager.signalingClient.isConnected()) {
      controllerConnectToServer()
    } else {
      connectDevice()
    }
  }
}

function deleteFromHistory(type, index) {
  historyManager.deleteFromHistory(type, index)
  renderHistory(type)
}

// ==================== 设备列表管理（主控端） ====================

async function loadDeviceList() {
  try {
    const result = await window.electronAPI.getDeviceList()
    if (result.success) {
      renderDeviceList(result.devices)
    } else {
      log('加载设备列表失败')
    }
  } catch (e) {
    log('加载设备列表异常: ' + e.message)
  }
}

function renderDeviceList(devices) {
  const container = document.getElementById('deviceListContainer')
  if (!container) return

  if (!devices || devices.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无已保存的设备<br>连接成功后会自动添加</div>'
    return
  }

  container.innerHTML = devices.map((device, index) => {
    const alias = device.alias || ''
    const displayName = alias ? `${alias} (${device.deviceId})` : device.deviceId
    const lastConnected = device.lastConnected ? new Date(device.lastConnected).toLocaleDateString('zh-CN') : '未连接'

    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${displayName}</div>
          <div class="history-time">最后连接: ${lastConnected}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="connectFromDeviceList('${device.deviceId}')">连接</button>
          <button class="history-btn history-btn-delete" onclick="removeDeviceFromList('${device.deviceId}')">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function manageDeviceList() {
  const panel = document.getElementById('deviceManagePanel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

async function addDeviceToList() {
  const deviceIdInput = document.getElementById('newDeviceId')
  const aliasInput = document.getElementById('newDeviceAlias')

  if (!deviceIdInput) return

  const deviceId = deviceIdInput.value.trim().toUpperCase()
  const alias = aliasInput ? aliasInput.value.trim() : ''

  if (!deviceId) {
    log('请输入设备ID')
    return
  }

  if (deviceId.length < 6 || deviceId.length > 16) {
    log('设备ID长度必须在6-16个字符之间')
    return
  }

  try {
    const serverUrl = document.getElementById('controllerServerUrl')?.value || ''
    const result = await window.electronAPI.addDevice(deviceId, alias, serverUrl)

    if (result.success) {
      log(result.message)
      renderDeviceList(result.devices)
      deviceIdInput.value = ''
      if (aliasInput) aliasInput.value = ''
    } else {
      log('添加失败: ' + result.message)
    }
  } catch (e) {
    log('添加设备异常: ' + e.message)
  }
}

async function removeDeviceFromList(deviceId) {
  if (!confirm('确定要删除设备 ' + deviceId + ' 吗？')) {
    return
  }

  try {
    const result = await window.electronAPI.removeDevice(deviceId)

    if (result.success) {
      log('设备已删除')
      renderDeviceList(result.devices)
    } else {
      log('删除失败: ' + result.message)
    }
  } catch (e) {
    log('删除设备异常: ' + e.message)
  }
}

function cancelDeviceManage() {
  const panel = document.getElementById('deviceManagePanel')
  if (panel) {
    panel.style.display = 'none'
  }

  const deviceIdInput = document.getElementById('newDeviceId')
  const aliasInput = document.getElementById('newDeviceAlias')
  if (deviceIdInput) deviceIdInput.value = ''
  if (aliasInput) aliasInput.value = ''
}

function connectFromDeviceList(deviceId) {
  const targetInput = document.getElementById('targetDeviceId')
  if (targetInput) {
    targetInput.value = deviceId
    connectDevice()
  }
}

async function saveConnectedDevice(deviceId, serverUrl) {
  try {
    await window.electronAPI.addDevice(deviceId, '', serverUrl)
    loadDeviceList()
  } catch (e) {
    log('保存设备信息失败: ' + e.message)
  }
}

// ==================== 设备列表管理（被控端已移除，无需设备列表） ====================


/**
 * YCDesk - AutoUnlockService 单元测试
 *
 * 测试自动解锁服务的锁屏/解锁事件处理、Credential Provider 调用路径、
 * robotjs 回退路径、IPC 处理器、异常处理等。
 *
 * 覆盖场景:
 *   1. 锁屏事件监听和处理（isLocked 状态、窗口通知）
 *   2. 解锁事件监听和处理
 *   3. notifyLockState 窗口通知逻辑
 *   4. Credential Provider 调用路径（成功/失败）
 *   5. robotjs 回退路径
 *   6. 异常处理（共享内存失败、IPC 失败、robotjs 不可用等）
 *   7. 密码清除逻辑
 *   8. IPC 处理器（get-state, save-password, clear-password, try, manual）
 *   9. setAutoUnlockEnabled / setRemoteWindow / setMainWindow
 *
 * 注意: 由于 vitest vi.mock 对 electron 原生模块无效，使用 Module._load
 * 拦截 require 调用实现 mock。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Module from 'module'

// 禁用 setImmediate 异步，使其同步执行以简化测试
vi.stubGlobal('setImmediate', (fn) => fn())

// ============================================================
// 创建所有 mock 函数（在拦截 require 之前）
// ============================================================

const powerMonitorOn = vi.fn()
const ipcMainHandle = vi.fn()
const screenGetPrimaryDisplay = vi.fn(() => ({ size: { width: 1920, height: 1080 } }))
const osUserInfo = vi.fn(() => ({ username: 'testuser' }))

const loggerInfo = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()

const credentialsGetUnlockPassword = vi.fn()
const credentialsUnlockWithCredentialProvider = vi.fn()
const credentialsSaveUnlockPassword = vi.fn()
const credentialsClearUnlockPassword = vi.fn()

const unlockIpcStart = vi.fn()
const unlockIpcSetCredentials = vi.fn()
const unlockIpcClearCredentials = vi.fn()

const robotjsKeyTap = vi.fn()
const robotjsMoveMouse = vi.fn()
const robotjsMouseClick = vi.fn()
const robotjsTypeString = vi.fn()

const directNotifyClients = vi.fn(() => 0)
const directNotifyServer = vi.fn(() => 0)

const svcIsServiceModeEnabled = vi.fn(() => false)
const svcIsRunning = vi.fn(() => false)
const svcSwitchToWinlogon = vi.fn(() => Promise.resolve())
const svcSwitchToDefault = vi.fn(() => Promise.resolve())

// ============================================================
// 使用 Module._load 拦截 require 调用实现 mock
// ============================================================

const originalLoad = Module._load

Module._load = function (request, parent, isMain) {
  // Mock electron
  if (request === 'electron') {
    return {
      powerMonitor: { on: powerMonitorOn },
      ipcMain: { handle: ipcMainHandle },
      screen: { getPrimaryDisplay: screenGetPrimaryDisplay },
    }
  }
  // Mock os
  if (request === 'os') {
    return {
      userInfo: osUserInfo,
      default: { userInfo: osUserInfo },
    }
  }
  // Mock robotjs
  if (request === 'robotjs') {
    return {
      keyTap: robotjsKeyTap,
      moveMouse: robotjsMoveMouse,
      mouseClick: robotjsMouseClick,
      typeString: robotjsTypeString,
    }
  }
  // Mock local modules (relative to src/main/)
  if (request === './logger' && parent && parent.filename && parent.filename.includes('src')) {
    return {
      createLogger: vi.fn(() => ({
        info: loggerInfo,
        error: loggerError,
        warn: loggerWarn,
      })),
    }
  }
  if (request === './unlock-ipc-server' && parent && parent.filename && parent.filename.includes('src')) {
    return {
      start: unlockIpcStart,
      setCredentials: unlockIpcSetCredentials,
      clearCredentials: unlockIpcClearCredentials,
    }
  }
  if (request === './credentials-manager' && parent && parent.filename && parent.filename.includes('src')) {
    return {
      getUnlockPassword: credentialsGetUnlockPassword,
      unlockWithCredentialProvider: credentialsUnlockWithCredentialProvider,
      saveUnlockPassword: credentialsSaveUnlockPassword,
      clearUnlockPassword: credentialsClearUnlockPassword,
    }
  }
  if (request === './direct-server' && parent && parent.filename && parent.filename.includes('src')) {
    return {
      notifyLockStateToClients: directNotifyClients,
      notifyLockStateToServer: directNotifyServer,
    }
  }
  if (request === './service-integration' && parent && parent.filename && parent.filename.includes('src')) {
    return {
      getServiceIntegration: vi.fn(() => ({
        isServiceModeEnabled: svcIsServiceModeEnabled,
        isRunning: svcIsRunning,
        switchToWinlogon: svcSwitchToWinlogon,
        switchToDefault: svcSwitchToDefault,
      })),
    }
  }
  return originalLoad.apply(this, arguments)
}

// ============================================================
// 引入被测模块
// ============================================================

const service = require('../auto-unlock-service')

// ============================================================
// 辅助函数
// ============================================================

/** 创建 mock 窗口对象 */
function createMockWindow(id = 1) {
  return {
    id,
    webContents: {
      send: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  }
}

/** 获取 powerMonitor 注册的回调 */
function getPowerMonitorCallback(event) {
  const calls = powerMonitorOn.mock.calls.filter(c => c[0] === event)
  return calls.length > 0 ? calls[calls.length - 1][1] : null
}

/** 获取 ipcMain.handle 注册的处理器 */
function getIpcHandler(channel) {
  const calls = ipcMainHandle.mock.calls.filter(c => c[0] === channel)
  return calls.length > 0 ? calls[calls.length - 1][1] : null
}

// ============================================================
// 测试套件
// ============================================================

describe('AutoUnlockService', () => {
  beforeEach(() => {
    // 重置服务状态
    service.isLocked = false
    service.autoUnlockEnabled = false
    service.currentRemoteWindow = null
    service.currentMainWindow = null

    // 重置 credentialsManager mock 默认行为
    credentialsGetUnlockPassword.mockReset()
    credentialsGetUnlockPassword.mockResolvedValue({ success: false, password: null })
    credentialsUnlockWithCredentialProvider.mockReset()
    credentialsUnlockWithCredentialProvider.mockResolvedValue({ success: true, message: 'OK' })
    credentialsSaveUnlockPassword.mockReset()
    credentialsSaveUnlockPassword.mockResolvedValue({ success: true })
    credentialsClearUnlockPassword.mockReset()
    credentialsClearUnlockPassword.mockResolvedValue({ success: true })

    // 重置 robotjs mock（清除自定义实现，恢复到默认 no-op）
    robotjsKeyTap.mockReset()
    robotjsMoveMouse.mockReset()
    robotjsMouseClick.mockReset()
    robotjsTypeString.mockReset()

    // 重置 logger mock
    loggerInfo.mockReset()
    loggerError.mockReset()
    loggerWarn.mockReset()

    // 重置 unlockIpc mock
    unlockIpcStart.mockReset()
    unlockIpcSetCredentials.mockReset()
    unlockIpcClearCredentials.mockReset()

    // 重置 direct-server mock
    directNotifyClients.mockReset()
    directNotifyClients.mockReturnValue(0)
    directNotifyServer.mockReset()
    directNotifyServer.mockReturnValue(0)

    // 重置 service-integration mock
    svcIsServiceModeEnabled.mockReset()
    svcIsServiceModeEnabled.mockReturnValue(false)
    svcIsRunning.mockReset()
    svcIsRunning.mockReturnValue(false)
    svcSwitchToWinlogon.mockReset()
    svcSwitchToWinlogon.mockResolvedValue()
    svcSwitchToDefault.mockReset()
    svcSwitchToDefault.mockResolvedValue()

    // 注意：不重置 powerMonitorOn 和 ipcMainHandle ——
    // 它们保存了 setupListeners() 注册的事件回调，必须在所有测试中保持有效
  })

  // ==========================================================
  // 1. 锁屏事件监听和处理
  // ==========================================================
  describe('锁屏事件处理', () => {
    it('锁屏事件应设置 isLocked=true', () => {
      const cb = getPowerMonitorCallback('lock-screen')
      expect(cb).toBeDefined()

      cb()

      expect(service.isLocked).toBe(true)
    })

    it('锁屏时应通知主窗口停止屏幕捕获', () => {
      const mockWindow = createMockWindow()
      service.setMainWindow(mockWindow)

      const cb = getPowerMonitorCallback('lock-screen')
      cb()

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'screen-capture-control',
        { action: 'stop' }
      )
    })

    it('主窗口已销毁时锁屏不发送停止通知', () => {
      const mockWindow = createMockWindow()
      mockWindow.isDestroyed.mockReturnValue(true)
      service.setMainWindow(mockWindow)

      const cb = getPowerMonitorCallback('lock-screen')
      cb()

      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        'screen-capture-control',
        { action: 'stop' }
      )
    })

    it('主窗口为 null 时锁屏不抛出异常', () => {
      service.currentMainWindow = null

      const cb = getPowerMonitorCallback('lock-screen')
      expect(() => cb()).not.toThrow()
      expect(service.isLocked).toBe(true)
    })
  })

  // ==========================================================
  // 2. 解锁事件监听和处理
  // ==========================================================
  describe('解锁事件处理', () => {
    it('解锁事件应设置 isLocked=false', () => {
      service.isLocked = true

      const cb = getPowerMonitorCallback('unlock-screen')
      expect(cb).toBeDefined()

      cb()

      expect(service.isLocked).toBe(false)
    })

    it('解锁时应通知主窗口恢复屏幕捕获', () => {
      const mockWindow = createMockWindow()
      service.setMainWindow(mockWindow)

      const cb = getPowerMonitorCallback('unlock-screen')
      cb()

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'screen-capture-control',
        { action: 'start' }
      )
    })

    it('主窗口已销毁时解锁不发送恢复通知', () => {
      const mockWindow = createMockWindow()
      mockWindow.isDestroyed.mockReturnValue(true)
      service.setMainWindow(mockWindow)

      const cb = getPowerMonitorCallback('unlock-screen')
      cb()

      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        'screen-capture-control',
        { action: 'start' }
      )
    })
  })

  // ==========================================================
  // 3. notifyLockState 窗口通知逻辑
  // ==========================================================
  describe('notifyLockState', () => {
    it('应向有效的 remoteWindow 发送 unlock-state-changed 事件', () => {
      const mockRemote = createMockWindow()
      service.setRemoteWindow(mockRemote)
      service.isLocked = true
      service.autoUnlockEnabled = true

      service.notifyLockState()

      expect(mockRemote.webContents.send).toHaveBeenCalledWith(
        'unlock-state-changed',
        { isLocked: true, autoUnlockEnabled: true }
      )
    })

    it('应向有效的 mainWindow 发送 unlock-state-changed 事件', () => {
      const mockMain = createMockWindow()
      service.setMainWindow(mockMain)
      service.isLocked = false

      service.notifyLockState()

      expect(mockMain.webContents.send).toHaveBeenCalledWith(
        'unlock-state-changed',
        { isLocked: false, autoUnlockEnabled: false }
      )
    })

    it('应跳过已销毁的 remoteWindow', () => {
      const mockRemote = createMockWindow()
      mockRemote.isDestroyed.mockReturnValue(true)
      service.setRemoteWindow(mockRemote)

      service.notifyLockState()

      expect(mockRemote.webContents.send).not.toHaveBeenCalled()
    })

    it('应跳过已销毁的 mainWindow', () => {
      const mockMain = createMockWindow()
      mockMain.isDestroyed.mockReturnValue(true)
      service.setMainWindow(mockMain)

      service.notifyLockState()

      expect(mockMain.webContents.send).not.toHaveBeenCalled()
    })

    it('remoteWindow 为 null 时不抛出异常', () => {
      service.currentRemoteWindow = null
      expect(() => service.notifyLockState()).not.toThrow()
    })

    it('应调用 TCP 旁路通知', () => {
      directNotifyClients.mockReturnValue(2)

      service.notifyLockState()

      expect(directNotifyClients).toHaveBeenCalled()
    })

    it('TCP 旁路通知失败时不抛出异常', () => {
      directNotifyClients.mockImplementation(() => {
        throw new Error('TCP error')
      })
      directNotifyServer.mockImplementation(() => {
        throw new Error('TCP error')
      })

      expect(() => service.notifyLockState()).not.toThrow()
    })

    it('服务模式通知失败时不抛出异常', () => {
      svcIsServiceModeEnabled.mockReturnValue(true)
      svcIsRunning.mockReturnValue(true)
      svcSwitchToWinlogon.mockRejectedValue(new Error('switch failed'))

      service.isLocked = true
      expect(() => service.notifyLockState()).not.toThrow()
    })
  })

  // ==========================================================
  // 4. Credential Provider 调用路径
  // ==========================================================
  describe('tryAutoUnlock - Credential Provider 路径', () => {
    it('屏幕未锁定时返回失败', async () => {
      service.isLocked = false

      const result = await service.tryAutoUnlock()

      expect(result).toEqual({ success: false, message: '屏幕未锁定' })
    })

    it('无保存密码时返回失败', async () => {
      service.isLocked = true
      credentialsGetUnlockPassword.mockResolvedValue({
        success: false,
        password: null,
      })

      const result = await service.tryAutoUnlock()

      expect(result).toEqual({ success: false, message: '未保存解锁密码' })
    })

    it('Credential Provider 成功时应返回成功', async () => {
      service.isLocked = true
      credentialsGetUnlockPassword.mockResolvedValue({
        success: true,
        password: 'testpwd',
      })
      credentialsUnlockWithCredentialProvider.mockResolvedValue({
        success: true,
        message: 'Credential Provider 解锁已触发',
      })

      const result = await service.tryAutoUnlock()

      expect(result.success).toBe(true)
      expect(result.message).toContain('Credential Provider')
      expect(credentialsUnlockWithCredentialProvider).toHaveBeenCalledWith(
        'testuser',
        'testpwd'
      )
    })
  })

  // ==========================================================
  // 5. robotjs 回退路径
  // ==========================================================
  describe('tryAutoUnlock - robotjs 回退路径', () => {
    it('Credential Provider 失败时应回退到 robotjs 模拟输入', async () => {
      service.isLocked = true
      credentialsGetUnlockPassword.mockResolvedValue({
        success: true,
        password: 'testpwd',
      })
      credentialsUnlockWithCredentialProvider.mockResolvedValue({
        success: false,
        message: '不可用',
      })

      const result = await service.tryAutoUnlock()

      expect(result.success).toBe(true)
      expect(result.message).toBe('自动解锁成功')
      expect(robotjsTypeString).toHaveBeenCalledWith('testpwd')
      expect(robotjsKeyTap).toHaveBeenCalledWith('enter')
    })
  })

  // ==========================================================
  // 6. manualUnlock
  // ==========================================================
  describe('manualUnlock', () => {
    it('密码为空时返回失败', async () => {
      const result = await service.manualUnlock('')

      expect(result).toEqual({ success: false, message: '密码不能为空' })
    })

    it('通过 Credential Provider 成功解锁', async () => {
      credentialsUnlockWithCredentialProvider.mockResolvedValue({
        success: true,
        message: 'OK',
      })

      const result = await service.manualUnlock('mypassword')

      expect(result.success).toBe(true)
      expect(result.message).toContain('Credential Provider')
      expect(credentialsUnlockWithCredentialProvider).toHaveBeenCalledWith(
        'testuser',
        'mypassword'
      )
    })

    it('Credential Provider 失败时回退到 robotjs', async () => {
      credentialsUnlockWithCredentialProvider.mockResolvedValue({
        success: false,
        message: '不可用',
      })

      const result = await service.manualUnlock('mypassword')

      expect(result.success).toBe(true)
      expect(result.message).toBe('解锁成功')
      expect(robotjsTypeString).toHaveBeenCalledWith('mypassword')
      expect(robotjsKeyTap).toHaveBeenCalledWith('enter')
    })

    it('unlockWithCredentialProvider 抛出异常时返回失败', async () => {
      credentialsUnlockWithCredentialProvider.mockRejectedValue(
        new Error('IPC 连接失败')
      )

      const result = await service.manualUnlock('mypassword')

      expect(result.success).toBe(false)
      expect(result.message).toContain('IPC 连接失败')
    })
  })

  // ==========================================================
  // 7. 异常处理
  // ==========================================================
  describe('异常处理', () => {
    it('tryAutoUnlock 中 unlockWithCredentialProvider 抛出异常时返回失败', async () => {
      service.isLocked = true
      credentialsGetUnlockPassword.mockResolvedValue({
        success: true,
        password: 'testpwd',
      })
      credentialsUnlockWithCredentialProvider.mockRejectedValue(
        new Error('共享内存写入失败')
      )

      const result = await service.tryAutoUnlock()

      expect(result.success).toBe(false)
      expect(result.message).toContain('共享内存写入失败')
    })

    it('simulatePasswordInput 中 robotjs 输入失败时抛出异常', async () => {
      robotjsTypeString.mockImplementation(() => {
        throw new Error('键盘输入失败')
      })

      // source code catches typeString error and throws new Error('密码输入失败')
      await expect(service.simulatePasswordInput('testpwd')).rejects.toThrow('密码输入失败')
    })

    it('simulatePasswordInput 中 Enter 失败时抛出异常', async () => {
      robotjsKeyTap.mockImplementation((key) => {
        if (key === 'enter') throw new Error('按键失败')
      })

      // source code catches keyTap error and throws new Error('Enter 失败')
      await expect(service.simulatePasswordInput('testpwd')).rejects.toThrow('Enter 失败')
    })

    it('simulatePasswordInput 中 ESC 和点击失败时不影响主流程', async () => {
      robotjsKeyTap.mockImplementation((key) => {
        if (key === 'escape') throw new Error('ESC failed')
      })
      robotjsMouseClick.mockImplementation(() => {
        throw new Error('click failed')
      })

      await expect(service.simulatePasswordInput('testpwd')).resolves.toBeUndefined()
      expect(robotjsTypeString).toHaveBeenCalledWith('testpwd')
      expect(robotjsKeyTap).toHaveBeenCalledWith('enter')
    })

    it('tryAutoUnlock 中密码为空字符串时返回失败', async () => {
      service.isLocked = true
      credentialsGetUnlockPassword.mockResolvedValue({
        success: true,
        password: '',
      })

      const result = await service.tryAutoUnlock()

      expect(result.success).toBe(false)
      expect(result.message).toBe('未保存解锁密码')
    })
  })

  // ==========================================================
  // 8. IPC 处理器
  // ==========================================================
  describe('IPC 处理器', () => {
    describe('auto-unlock:get-state', () => {
      it('应返回当前锁定状态和自动解锁启用状态', async () => {
        service.isLocked = true
        service.autoUnlockEnabled = true
        credentialsGetUnlockPassword.mockResolvedValue({
          success: true,
          password: 'savedpwd',
        })

        const handler = getIpcHandler('auto-unlock:get-state')
        const result = await handler()

        expect(result).toEqual({
          isLocked: true,
          autoUnlockEnabled: true,
          hasSavedPassword: true,
        })
      })

      it('无保存密码时 hasSavedPassword 为 false', async () => {
        credentialsGetUnlockPassword.mockResolvedValue({
          success: false,
          password: null,
        })

        const handler = getIpcHandler('auto-unlock:get-state')
        const result = await handler()

        expect(result.hasSavedPassword).toBe(false)
      })
    })

    describe('auto-unlock:try', () => {
      it('应调用 tryAutoUnlock 并返回结果', async () => {
        service.isLocked = true
        credentialsGetUnlockPassword.mockResolvedValue({
          success: true,
          password: 'pwd',
        })
        credentialsUnlockWithCredentialProvider.mockResolvedValue({
          success: true,
        })

        const handler = getIpcHandler('auto-unlock:try')
        const result = await handler()

        expect(result.success).toBe(true)
      })
    })

    describe('auto-unlock:manual', () => {
      it('应调用 manualUnlock 并返回结果', async () => {
        credentialsUnlockWithCredentialProvider.mockResolvedValue({
          success: true,
        })

        const handler = getIpcHandler('auto-unlock:manual')
        const result = await handler({}, 'mypwd')

        expect(result.success).toBe(true)
      })
    })

    describe('auto-unlock:save-password', () => {
      it('应调用 credentialsManager.saveUnlockPassword', async () => {
        credentialsSaveUnlockPassword.mockResolvedValue({
          success: true,
          message: '密码保存成功',
        })

        const handler = getIpcHandler('auto-unlock:save-password')
        const result = await handler({}, 'newpwd', true)

        expect(result.success).toBe(true)
        expect(credentialsSaveUnlockPassword).toHaveBeenCalledWith('newpwd', true)
      })
    })

    describe('auto-unlock:clear-password', () => {
      it('应调用 credentialsManager.clearUnlockPassword', async () => {
        credentialsClearUnlockPassword.mockResolvedValue({
          success: true,
          message: '密码已清除',
        })

        const handler = getIpcHandler('auto-unlock:clear-password')
        const result = await handler()

        expect(result.success).toBe(true)
        expect(credentialsClearUnlockPassword).toHaveBeenCalled()
      })

      it('清除失败时返回错误', async () => {
        credentialsClearUnlockPassword.mockResolvedValue({
          success: false,
          message: '文件删除失败',
        })

        const handler = getIpcHandler('auto-unlock:clear-password')
        const result = await handler()

        expect(result.success).toBe(false)
        expect(result.message).toBe('文件删除失败')
      })
    })
  })

  // ==========================================================
  // 9. 设置方法
  // ==========================================================
  describe('设置方法', () => {
    it('setAutoUnlockEnabled 应设置启用状态', () => {
      expect(service.autoUnlockEnabled).toBe(false)

      service.setAutoUnlockEnabled(true)

      expect(service.autoUnlockEnabled).toBe(true)
    })

    it('setRemoteWindow 应设置远程窗口引用', () => {
      const mockWindow = createMockWindow()
      service.setRemoteWindow(mockWindow)

      expect(service.currentRemoteWindow).toBe(mockWindow)
    })

    it('setMainWindow 应设置主窗口引用', () => {
      const mockWindow = createMockWindow()
      service.setMainWindow(mockWindow)

      expect(service.currentMainWindow).toBe(mockWindow)
    })

    it('setMainWindow 接受 null 参数', () => {
      service.setMainWindow(null)

      expect(service.currentMainWindow).toBeNull()
    })
  })
})
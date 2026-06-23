/**
 * YCDesk - ElevationManager 单元测试
 *
 * 测试提权管理器、服务安装/卸载、状态查询、权限检查等功能。
 * 使用 vi.spyOn mock Node.js 内置模块（fs）的方法，
 * 使用 vi.mock mock child_process 模块（因为源码使用了解构导入）。
 *
 * 覆盖场景:
 *   1. 并发提权请求通过 FIFO 队列顺序执行（P0-02 修复验证）
 *   2. _runElevated 串行化行为
 *   3. installService() 路径查找和错误处理
 *   4. uninstallService() 路径查找和错误处理
 *   5. queryServiceStatus() 各状态（RUNNING/STOPPED/STOP_PENDING/START_PENDING/1060）
 *   6. _findNodeExe() 各路径查找优先级
 *   7. isElevated() 权限检查
 *   8. SCM 错误码处理（1056/1060/1062）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import * as cp from 'child_process'
import os from 'os'

// Mock child_process 模块
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn()
}))

const { ElevationManager } = require('../elevation-manager.js')

function createManager() {
  return new ElevationManager({ logger: { log: () => {}, error: () => {} } })
}

function setupElevatedInternalMock(manager, resultOverride) {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
  vi.spyOn(fs, 'readFileSync').mockReturnValue('')
  vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
  vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

  const defaultOutput = { success: true, output: '', stderr: '', exitCode: 0 }
  const output = { ...defaultOutput, ...resultOverride }

  vi.spyOn(manager, '_readElevatedOutput').mockReturnValue(output)
  vi.spyOn(manager, '_cleanupTmpFiles').mockImplementation(() => {})

  return output
}

describe('ElevationManager', () => {
  let manager

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.YCDESK_NODE_EXE
    process.env.LOCALAPPDATA = 'C:\\Users\\TestUser\\AppData\\Local'
    process.env.ProgramFiles = 'C:\\Program Files'
    manager = createManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==================== 1. 并发提权 FIFO 队列 ====================

  describe('_runElevated 串行化（P0-02）', () => {
    it('并发提权请求应通过 FIFO 队列顺序执行', async () => {
      const callOrder = []

      vi.spyOn(manager, '_runElevatedInternal').mockImplementation((cmd, name) => {
        callOrder.push(name)
        return Promise.resolve({ success: true, output: 'ok' })
      })

      const p1 = manager._runElevated('cmd1', 'op1')
      const p2 = manager._runElevated('cmd2', 'op2')
      const p3 = manager._runElevated('cmd3', 'op3')

      await Promise.all([p1, p2, p3])

      expect(callOrder).toEqual(['op1', 'op2', 'op3'])
    })

    it('后一个请求应等待前一个请求完成才开始执行', async () => {
      const callOrder = []
      let resolveFirst

      vi.spyOn(manager, '_runElevatedInternal').mockImplementation((cmd, name) => {
        callOrder.push(name)
        if (name === 'op1') {
          return new Promise(resolve => {
            resolveFirst = () => {
              callOrder.push('op1-done')
              resolve({ success: true, output: 'ok' })
            }
          })
        }
        callOrder.push(name + '-done')
        return Promise.resolve({ success: true, output: 'ok' })
      })

      manager._runElevated('cmd1', 'op1')
      manager._runElevated('cmd2', 'op2')

      // _runElevated 通过 Promise.then 链式调用，需要等待 microtask 执行
      await Promise.resolve()

      expect(callOrder).toEqual(['op1'])

      resolveFirst()
      // 等待 op1 的 promise resolve 后 op2 的 microtask 执行
      await Promise.resolve()

      expect(callOrder).toEqual(['op1', 'op1-done', 'op2', 'op2-done'])
    })

    it('前一个请求失败不应阻塞后续请求', async () => {
      const callOrder = []

      vi.spyOn(manager, '_runElevatedInternal').mockImplementation((cmd, name) => {
        callOrder.push(name)
        if (name === 'op1') {
          return Promise.reject(new Error('op1 failed'))
        }
        return Promise.resolve({ success: true, output: 'ok' })
      })

      manager._runElevated('cmd1', 'op1')
      const p2 = manager._runElevated('cmd2', 'op2')

      await p2

      expect(callOrder).toEqual(['op1', 'op2'])
    })

    it('多条并发请求保持 FIFO 顺序（5 个请求）', async () => {
      const callOrder = []

      vi.spyOn(manager, '_runElevatedInternal').mockImplementation((cmd, name) => {
        callOrder.push(name)
        return Promise.resolve({ success: true, output: 'ok' })
      })

      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(manager._runElevated(`cmd${i}`, `op${i}`))
      }

      await Promise.all(promises)

      expect(callOrder).toEqual(['op0', 'op1', 'op2', 'op3', 'op4'])
    })
  })

  // ==================== 2. _runElevatedInternal ====================

  describe('_runElevatedInternal', () => {
    it('应使用 LOCALAPPDATA 下的 elevate-tmp 目录', async () => {
      setupElevatedInternalMock(manager)
      cp.execSync.mockReturnValue('')

      await manager._runElevatedInternal('echo test', '测试操作')

      const mkdirCalls = fs.mkdirSync.mock.calls
      const dirArg = mkdirCalls.find(c => typeof c[0] === 'string' && c[0].includes('elevate-tmp'))
      expect(dirArg).toBeTruthy()
      expect(dirArg[0]).toContain('YCDesk')
      expect(dirArg[0]).toContain('elevate-tmp')
    })

    it('bat 文件写入失败时应返回错误', async () => {
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('disk full')
      })

      const result = await manager._runElevatedInternal('echo test', '测试操作')

      expect(result.success).toBe(false)
      expect(result.error).toContain('无法创建执行脚本')
    })

    it('PowerShell 退出码 999 应返回 UAC 取消错误', async () => {
      setupElevatedInternalMock(manager)
      const psError = new Error('UAC rejected')
      psError.status = 999
      cp.execSync.mockImplementation(() => { throw psError })

      const result = await manager._runElevatedInternal('echo test', '测试操作')

      expect(result.success).toBe(false)
      expect(result.error).toContain('UAC 提权被取消或超时')
    })

    it('PowerShell 正常退出应返回成功', async () => {
      setupElevatedInternalMock(manager, { success: true, output: 'done', exitCode: 0 })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('echo test', '测试操作')

      expect(result.success).toBe(true)
    })

    it('exitCode 文件不存在时应用 PowerShell 退出码兜底', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: '', stderr: '', exitCode: -1
      })
      const psError = new Error('command failed')
      psError.status = 1
      cp.execSync.mockImplementation(() => { throw psError })

      const result = await manager._runElevatedInternal('invalid-cmd', '测试操作')

      expect(result.success).toBe(false)
      expect(result.error).toContain('退出码 1')
    })
  })

  // ==================== 3. SCM 错误码处理 ====================

  describe('SCM 错误码处理', () => {
    it('错误码 1060（服务未安装）应返回成功', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: '', stderr: '[SC] OpenService FAILED 1060', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc stop test', '停止服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务未安装')
    })

    it('错误码 1056（服务已在运行）应返回成功', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: '', stderr: '[SC] StartService FAILED 1056', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc start test', '启动服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务已在运行中')
    })

    it('错误码 1062（服务未在运行）应返回成功', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: '', stderr: '[SC] ControlService FAILED 1062', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc stop test', '停止服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务未在运行')
    })

    it('stdout 中的 1060 也应被识别', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: 'FAILED 1060: The specified service does not exist', stderr: '', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc query test', '查询服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务未安装')
    })

    it('stdout 中的 1056 也应被识别', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: 'FAILED 1056: already started', stderr: '', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc start test', '启动服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务已在运行中')
    })

    it('stdout 中的 1062 也应被识别', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: 'FAILED 1062: not started', stderr: '', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc stop test', '停止服务')

      expect(result.success).toBe(true)
      expect(result.output).toBe('服务未在运行')
    })

    it('未知错误码应返回失败', async () => {
      setupElevatedInternalMock(manager, {
        success: false, output: '', stderr: 'FAILED 1073: The specified service already exists', exitCode: 1
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc create test', '创建服务')

      expect(result.success).toBe(false)
      expect(result.error).toContain('1073')
    })

    it('stdout 包含 INVALID 应返回失败', async () => {
      setupElevatedInternalMock(manager, {
        success: true, output: 'INVALID service configuration', stderr: '', exitCode: 0
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc install test', '安装服务')

      expect(result.success).toBe(false)
      expect(result.error).toContain('服务安装无效')
    })

    it('stdout 包含 ALREADY 应返回成功', async () => {
      setupElevatedInternalMock(manager, {
        success: true, output: 'ALREADY installed', stderr: '', exitCode: 0
      })
      cp.execSync.mockReturnValue('')

      const result = await manager._runElevatedInternal('sc install test', '安装服务')

      expect(result.success).toBe(true)
      expect(result.output).toContain('操作已完成')
    })
  })

  // ==================== 4. installService ====================

  describe('installService()', () => {
    it('CLI 文件不存在时应返回错误', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\fake\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)

      const result = await manager.installService()

      expect(result.success).toBe(false)
      expect(result.error).toContain('服务 CLI 未找到')
    })

    it('找不到 node.exe 时应返回错误', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\fake\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: false, path: null, hint: '未检测到 Node.js'
      })

      const result = await manager.installService()

      expect(result.success).toBe(false)
      expect(result.error).toBe('未检测到 Node.js')
    })

    it('正常安装应调用 _runElevated 并传递正确命令', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: true, path: 'C:\\nodejs\\node.exe', hint: null
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '安装成功' })

      const result = await manager.installService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        '"C:\\nodejs\\node.exe" "C:\\app\\elevate-cli.js" install',
        '安装服务'
      )
    })
  })

  // ==================== 5. uninstallService ====================

  describe('uninstallService()', () => {
    it('CLI 文件不存在时应返回错误', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\fake\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)

      const result = await manager.uninstallService()

      expect(result.success).toBe(false)
      expect(result.error).toContain('服务 CLI 未找到')
    })

    it('找不到 node.exe 时应回退到 sc delete', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: false, path: null, hint: '未检测到 Node.js'
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '卸载成功' })

      const result = await manager.uninstallService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        'sc delete ycdeskservice.exe',
        '卸载服务'
      )
    })

    it('正常卸载应调用 _runElevated 并传递正确命令', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: true, path: 'C:\\nodejs\\node.exe', hint: null
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '卸载成功' })

      const result = await manager.uninstallService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        '"C:\\nodejs\\node.exe" "C:\\app\\elevate-cli.js" uninstall',
        '卸载服务'
      )
    })
  })

  // ==================== 6. queryServiceStatus ====================

  describe('queryServiceStatus()', () => {
    it('RUNNING 状态应返回 installed=true, running=true', async () => {
      cp.execSync.mockReturnValue('SERVICE_NAME: ycdeskservice.exe\n        STATE              : 4  RUNNING')

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(true)
      expect(result.running).toBe(true)
    })

    it('STOPPED 状态应返回 installed=true, running=false', async () => {
      cp.execSync.mockReturnValue('SERVICE_NAME: ycdeskservice.exe\n        STATE              : 1  STOPPED')

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(true)
      expect(result.running).toBe(false)
    })

    it('STOP_PENDING 状态应返回 pending=stop', async () => {
      cp.execSync.mockReturnValue('SERVICE_NAME: ycdeskservice.exe\n        STATE              : 3  STOP_PENDING')

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(true)
      expect(result.running).toBe(false)
      expect(result.pending).toBe('stop')
    })

    it('START_PENDING 状态应返回 pending=start', async () => {
      cp.execSync.mockReturnValue('SERVICE_NAME: ycdeskservice.exe\n        STATE              : 2  START_PENDING')

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(true)
      expect(result.running).toBe(false)
      expect(result.pending).toBe('start')
    })

    it('其他已知状态应返回 installed=true, running=false', async () => {
      cp.execSync.mockReturnValue('SERVICE_NAME: ycdeskservice.exe\n        STATE              : 7  PAUSED')

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(true)
      expect(result.running).toBe(false)
    })

    it('1060 错误应返回 installed=false', async () => {
      const err = new Error('[SC] EnumQueryServicesStatus:OpenService FAILED 1060')
      err.message = '[SC] EnumQueryServicesStatus:OpenService FAILED 1060'
      cp.execSync.mockImplementation(() => { throw err })

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(false)
      expect(result.running).toBe(false)
    })

    it('其他错误应返回 error 字段', async () => {
      const err = new Error('Access Denied')
      err.message = 'Access Denied'
      cp.execSync.mockImplementation(() => { throw err })

      const result = await manager.queryServiceStatus()

      expect(result.installed).toBe(false)
      expect(result.running).toBe(false)
      expect(result.error).toBe('Access Denied')
    })
  })

  // ==================== 7. _findNodeExe ====================

  describe('_findNodeExe()', () => {
    it('优先级1: YCDESK_NODE_EXE 环境变量', () => {
      process.env.YCDESK_NODE_EXE = 'C:\\custom\\node.exe'
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === 'C:\\custom\\node.exe'
        return false
      })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe('C:\\custom\\node.exe')
    })

    it('YCDESK_NODE_EXE 指向不存在的路径时应跳过', () => {
      process.env.YCDESK_NODE_EXE = 'C:\\missing\\node.exe'
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      cp.execSync.mockImplementation(() => { throw new Error('not found') })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(false)
    })

    it('优先级2: process.execPath（dev 模式）', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === process.execPath
        return false
      })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe(process.execPath)
    })

    it('优先级3: where node 命令', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === 'C:\\where\\node.exe'
        return false
      })
      cp.execSync.mockImplementation((cmd) => {
        if (cmd === 'where node') return 'C:\\where\\node.exe\r\n'
        throw new Error('unknown')
      })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe('C:\\where\\node.exe')
    })

    it('where node 多行输出应取第一个有效路径', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === 'C:\\node2\\node.exe'
        return false
      })
      cp.execSync.mockImplementation((cmd) => {
        if (cmd === 'where node') return 'C:\\node1\\node.exe\r\nC:\\node2\\node.exe\r\n'
        throw new Error('unknown')
      })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe('C:\\node2\\node.exe')
    })

    it('优先级4: 常见安装路径', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === 'C:\\Program Files\\nodejs\\node.exe'
        return false
      })
      cp.execSync.mockImplementation(() => { throw new Error('not found') })

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe('C:\\Program Files\\nodejs\\node.exe')
    })

    it('优先级5: PATH 环境变量兜底', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') return p === 'C:\\pathnode\\node.exe'
        return false
      })
      cp.execSync.mockImplementation(() => { throw new Error('not found') })
      process.env.PATH = 'C:\\pathnode;C:\\other'

      const result = manager._findNodeExe()

      expect(result.ok).toBe(true)
      expect(result.path).toBe('C:\\pathnode\\node.exe')
    })

    it('所有路径都找不到应返回失败并给出提示', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      cp.execSync.mockImplementation(() => { throw new Error('not found') })
      process.env.PATH = ''

      const result = manager._findNodeExe()

      expect(result.ok).toBe(false)
      expect(result.path).toBeNull()
      expect(result.hint).toContain('nodejs.org')
      expect(result.hint).toContain('YCDESK_NODE_EXE')
    })
  })

  // ==================== 8. isElevated ====================

  describe('isElevated()', () => {
    it('net session 成功应返回 true', () => {
      cp.execSync.mockReturnValue('')

      const result = manager.isElevated()

      expect(result).toBe(true)
      expect(cp.execSync).toHaveBeenCalledWith('net session', { stdio: 'ignore' })
    })

    it('net session 失败应返回 false', () => {
      cp.execSync.mockImplementation(() => { throw new Error('Access Denied') })

      const result = manager.isElevated()

      expect(result).toBe(false)
    })
  })

  // ==================== 9. _readElevatedOutput ====================

  describe('_readElevatedOutput()', () => {
    it('应正确读取 exitCode、stdout、stderr', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.exit.txt')) return '0'
        if (typeof filePath === 'string' && filePath.includes('.out.txt')) return 'hello world'
        if (typeof filePath === 'string' && filePath.includes('.err.txt')) return 'some error'
        return ''
      })

      const result = manager._readElevatedOutput(
        'C:\\tmp\\test.out.txt',
        'C:\\tmp\\test.err.txt',
        'C:\\tmp\\test.exit.txt'
      )

      expect(result.exitCode).toBe(0)
      expect(result.output).toBe('hello world')
      expect(result.stderr).toBe('some error')
      expect(result.success).toBe(true)
    })

    it('exitCode 非零时应返回 success=false', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.exit.txt')) return '1'
        return ''
      })

      const result = manager._readElevatedOutput('test.out.txt', 'test.err.txt', 'test.exit.txt')

      expect(result.exitCode).toBe(1)
      expect(result.success).toBe(false)
    })

    it('exitCode 文件缺失时应返回 -1', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        return typeof filePath === 'string' && !filePath.includes('.exit.txt')
      })
      vi.spyOn(fs, 'readFileSync').mockReturnValue('')

      const result = manager._readElevatedOutput('test.out.txt', 'test.err.txt', 'test.exit.txt')

      expect(result.exitCode).toBe(-1)
    })

    it('exitCode 内容非数字时应返回 -1', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.exit.txt')) return 'abc'
        return ''
      })

      const result = manager._readElevatedOutput('test.out.txt', 'test.err.txt', 'test.exit.txt')

      expect(result.exitCode).toBe(-1)
    })

    it('文件读取异常时应优雅失败', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('read error') })

      const result = manager._readElevatedOutput('test.out.txt', 'test.err.txt', 'test.exit.txt')

      expect(result.exitCode).toBe(-1)
      expect(result.output).toBe('')
      expect(result.stderr).toBe('')
    })
  })

  // ==================== 10. _cleanupTmpFiles ====================

  describe('_cleanupTmpFiles()', () => {
    it('应删除存在的文件', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

      manager._cleanupTmpFiles(['C:\\tmp\\a.bat', 'C:\\tmp\\b.out.txt'])

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2)
      expect(fs.unlinkSync).toHaveBeenCalledWith('C:\\tmp\\a.bat')
      expect(fs.unlinkSync).toHaveBeenCalledWith('C:\\tmp\\b.out.txt')
    })

    it('应跳过不存在的文件', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === 'C:\\tmp\\exists.bat')
      vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

      manager._cleanupTmpFiles(['C:\\tmp\\exists.bat', 'C:\\tmp\\missing.bat'])

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1)
      expect(fs.unlinkSync).toHaveBeenCalledWith('C:\\tmp\\exists.bat')
    })

    it('应跳过 null/undefined 文件', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

      manager._cleanupTmpFiles(['C:\\tmp\\a.bat', null, undefined])

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1)
    })

    it('删除失败时应静默忽略', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => { throw new Error('permission denied') })

      expect(() => manager._cleanupTmpFiles(['C:\\tmp\\a.bat'])).not.toThrow()
    })
  })

  // ==================== 11. startService / stopService ====================

  describe('startService()', () => {
    it('CLI 存在且 node 可用时应通过 CLI 启动', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: true, path: 'C:\\nodejs\\node.exe', hint: null
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '启动成功' })

      const result = await manager.startService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        '"C:\\nodejs\\node.exe" "C:\\app\\elevate-cli.js" start',
        '启动服务'
      )
    })

    it('CLI 不存在时应回退到 sc start', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\missing\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '启动成功' })

      const result = await manager.startService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        'sc start ycdeskservice.exe',
        '启动服务'
      )
    })

    it('CLI 存在但 node 不可用时应回退到 sc start', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: false, path: null, hint: null
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '启动成功' })

      const result = await manager.startService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        'sc start ycdeskservice.exe',
        '启动服务'
      )
    })
  })

  describe('stopService()', () => {
    it('CLI 存在且 node 可用时应通过 CLI 停止', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\app\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(manager, '_findNodeExe').mockReturnValue({
        ok: true, path: 'C:\\nodejs\\node.exe', hint: null
      })
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '停止成功' })

      const result = await manager.stopService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        '"C:\\nodejs\\node.exe" "C:\\app\\elevate-cli.js" stop',
        '停止服务'
      )
    })

    it('CLI 不存在时应回退到 sc stop', async () => {
      vi.spyOn(manager, '_getServiceCliPath').mockReturnValue('C:\\missing\\elevate-cli.js')
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      vi.spyOn(manager, '_runElevated').mockResolvedValue({ success: true, output: '停止成功' })

      const result = await manager.stopService()

      expect(result.success).toBe(true)
      expect(manager._runElevated).toHaveBeenCalledWith(
        'sc stop ycdeskservice.exe',
        '停止服务'
      )
    })
  })

  // ==================== 12. 构造函数和实例 ====================

  describe('构造函数', () => {
    it('默认 logger 不应抛出异常', () => {
      const m = new ElevationManager()
      expect(m).toBeDefined()
      expect(() => m.log('test')).not.toThrow()
    })

    it('自定义 logger 应被使用', () => {
      const logSpy = vi.fn()
      const m = new ElevationManager({ logger: { log: logSpy, error: () => {} } })
      m.log('hello')
      expect(logSpy).toHaveBeenCalledWith('[ElevationManager] hello')
    })

    it('_elevationQueue 初始应为已 resolved 的 Promise', async () => {
      const m = createManager()
      await expect(m._elevationQueue).resolves.toBeUndefined()
    })
  })
})
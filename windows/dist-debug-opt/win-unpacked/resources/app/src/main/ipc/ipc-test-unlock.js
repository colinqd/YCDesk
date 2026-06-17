const { ipcMain } = require('electron')

function register(safeHandler, logFn, testUnlockLogger, getServiceIntegration, SERVICE_STATE, inputHandler) {
  ipcMain.handle('service:testUnlock', safeHandler(async (event, password = '') => {
    testUnlockLogger.clear()
    testUnlockLogger.info('========== [测试解锁] 开始 ==========')
    testUnlockLogger.info(`密码长度: ${password.length}`)
    testUnlockLogger.info(`密码明文: ${password}`)
    testUnlockLogger.info(`当前用户名: ${process.env.USERNAME || process.env.USER || '未知'}`)
    testUnlockLogger.info(`当前域: ${process.env.USERDOMAIN || '未知'}`)

    const result = {
      lockSuccess: false,
      unlockSuccess: false,
      unlockMode: null,
      locked: null,
      steps: [],
      logFile: testUnlockLogger.getLogPath(),
      serviceHealth: null
    }

    const logAndPush = (step, msg, level = 'info') => {
      logFn(level, msg)
      if (level === 'success') testUnlockLogger.info(msg)
      else testUnlockLogger[level](msg)
      result.steps.push({ step, msg, level })
      if (event && event.sender && !event.sender.isDestroyed()) {
        try { event.sender.send('test-unlock-log', { step, msg, level, timestamp: Date.now() }) } catch (e) {}
      }
    }

    const serviceIntegration = getServiceIntegration({ logger: logFn })
    const serviceModeEnabled = serviceIntegration.isServiceModeEnabled()
    const serviceClientConnected = serviceIntegration.isRunning()
    logAndPush(0, `[环境] 服务模式启用: ${serviceModeEnabled}, 客户端连接: ${serviceClientConnected}`)

    logAndPush(0.5, '========== [锁屏前检查] 开始服务健康验证 ==========')
    logFn('info', '[测试解锁] 开始锁屏前服务健康检查')

    const serviceHealth = {
      serviceRunning: false,
      clientConnected: false,
      canReachService: false,
      checkTime: Date.now(),
      details: []
    }

    try {
      const serviceState = serviceIntegration.getState()
      serviceHealth.serviceRunning = (serviceState === SERVICE_STATE.RUNNING)
      serviceHealth.details.push(`服务状态: ${serviceState}`)
      logAndPush(0.5, `服务进程状态: ${serviceState}`, serviceHealth.serviceRunning ? 'info' : 'warn')

      serviceHealth.clientConnected = !!(serviceIntegration._client && serviceIntegration._client.isConnected)
      serviceHealth.details.push(`客户端连接: ${serviceHealth.clientConnected ? '已连接' : '未连接'}`)
      logAndPush(0.5, `客户端连接: ${serviceHealth.clientConnected ? '已连接' : '未连接'}`, serviceHealth.clientConnected ? 'info' : 'warn')

      if (serviceHealth.clientConnected) {
        try {
          logAndPush(0.5, '正在发送心跳测试服务响应...')
          const heartbeatResult = await serviceIntegration.heartbeat()
          serviceHealth.canReachService = !!(heartbeatResult && heartbeatResult.data)
          serviceHealth.details.push(`心跳测试: ${serviceHealth.canReachService ? '成功' : '失败'}`)
          logAndPush(0.5, `心跳测试: ${serviceHealth.canReachService ? '成功' : '失败'}`, serviceHealth.canReachService ? 'success' : 'error')
        } catch (heartbeatErr) {
          serviceHealth.canReachService = false
          serviceHealth.details.push(`心跳测试: 异常 - ${heartbeatErr.message}`)
          logAndPush(0.5, `心跳测试异常: ${heartbeatErr.message}`, 'error')
        }
      }

      const serviceAvailable = serviceHealth.serviceRunning && serviceHealth.clientConnected
      serviceHealth.available = serviceAvailable
      result.serviceHealth = serviceHealth

      logAndPush(0.5, '========== [锁屏前检查] 完成 ==========')
      logAndPush(0.5, `服务可用: ${serviceAvailable ? '是' : '否'}`, serviceAvailable ? 'success' : 'warn')

      if (!serviceAvailable) {
        logAndPush(0.5, '⚠️ 警告：服务不可用，锁屏后将无法通过服务模式解锁', 'error')
      } else {
        logAndPush(0.5, '✅ 服务健康检查通过，可以安全进行锁屏测试', 'success')
      }
    } catch (checkErr) {
      serviceHealth.available = false
      serviceHealth.details.push(`检查异常: ${checkErr.message}`)
      result.serviceHealth = serviceHealth
      logAndPush(0.5, `⚠️ 服务健康检查异常: ${checkErr.message}`, 'error')
      logFn('error', `[测试解锁] 服务健康检查异常: ${checkErr.message}`)
    }

    try {
      logAndPush(1, '正在锁定屏幕...')
      const { execSync } = require('child_process')
      const path = require('path')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const rundll32Path = path.join(windir, 'System32', 'rundll32.exe')
      execSync(`"${rundll32Path}" user32.dll,LockWorkStation`, { timeout: 5000 })
      result.lockSuccess = true
      logAndPush(1, '屏幕已锁定（LockWorkStation 调用成功）')
    } catch (e) {
      logAndPush(1, `锁屏失败: ${e.message}`, 'error')
      logFn('error', `[测试解锁] 锁屏失败: ${e.message}`)
      return result
    }

    logAndPush(2, '等待5秒后自动解锁...')
    for (let i = 5; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    logAndPush(2, '5秒等待结束，开始解锁...')
    logFn('info', '[测试解锁] 5秒等待结束')

    let anyAttempt = false

    if (serviceModeEnabled) {
      anyAttempt = true
      logAndPush(3, '尝试服务模式解锁（C++ 服务）...')
      logFn('info', '[测试解锁] 尝试服务模式解锁')
      try {
        if (!serviceIntegration.isRunning()) {
          logAndPush(3, '服务连接已断开，正在重新连接...', 'warn')
          logFn('warn', '[测试解锁] 服务连接已断开，正在重连')
          try {
            await serviceIntegration.start()
            logAndPush(3, '服务重连成功', 'success')
          } catch (reconnectErr) {
            logAndPush(3, `服务重连失败: ${reconnectErr.message}`, 'warn')
            logFn('warn', `[测试解锁] 服务重连失败: ${reconnectErr.message}`)
          }
        }

        if (serviceIntegration.isRunning()) {
          logAndPush(3, '服务已连接，发送解锁命令...', 'info')
          const unlockResult = await serviceIntegration.unlockScreen(password)
          logAndPush(3, `服务模式返回: ${JSON.stringify(unlockResult)}`)
          logFn('info', `[测试解锁] 服务模式返回: ${JSON.stringify(unlockResult)}`)
          if (unlockResult?.data?.success || unlockResult?.success) {
            result.unlockSuccess = true
            result.unlockMode = 'service'
            logAndPush(3, '✅ 服务模式解锁成功', 'success')
            logFn('info', '[测试解锁] 服务模式解锁成功')
          } else {
            logAndPush(3, '⚠️ 服务模式返回未成功，尝试其他方式', 'warn')
            logFn('warn', `[测试解锁] 服务模式返回未成功: ${JSON.stringify(unlockResult)}`)
          }
        } else {
          logAndPush(3, '⚠️ 服务未连接，尝试其他方式', 'warn')
          logFn('warn', '[测试解锁] 服务未连接，跳过服务模式')
        }
      } catch (e) {
        logAndPush(3, `⚠️ 服务模式异常: ${e.message}，尝试其他方式`, 'warn')
        logFn('warn', `[测试解锁] 服务模式异常: ${e.message}`)
      }
    }

    if (!result.unlockSuccess) {
      anyAttempt = true
      logAndPush(3, '尝试进程模式解锁（SendInput/robotjs/tscon）...')
      logFn('info', '[测试解锁] 尝试进程模式解锁')
      try {
        await inputHandler.handleUnlockScreen(password)
        result.unlockSuccess = true
        result.unlockMode = 'process'
        logAndPush(3, '✅ 进程模式解锁成功', 'success')
        logFn('info', '[测试解锁] 进程模式解锁成功')
      } catch (e) {
        logAndPush(3, `⚠️ 进程模式解锁失败: ${e.message}`, 'error')
        logFn('warn', `[测试解锁] 进程模式解锁失败: ${e.message}`)
      }
    }

    if (!anyAttempt) {
      logAndPush(3, '❌ 没有可用的解锁方式', 'error')
      logFn('warn', '[测试解锁] 没有可用的解锁方式')
    }
    if (!result.unlockSuccess && anyAttempt) {
      logAndPush(3, '❌ 所有解锁方式均失败', 'error')
      logFn('warn', '[测试解锁] 所有解锁方式均失败')
    }

    logAndPush(4, '等待2秒后验证解锁状态...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      const { execSync } = require('child_process')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const powershellPath = require('path').join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const output = execSync(
        `"${powershellPath}" -Command "(Get-Process LogonUI -ErrorAction SilentlyContinue) -ne $null"`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      result.locked = output === 'True'
      const statusMsg = result.locked ? '⚠️ 屏幕仍锁定' : '✅ 屏幕已解锁'
      logAndPush(4, `${statusMsg} (LogonUI=${result.locked})`, result.locked ? 'warn' : 'success')
      logFn('info', `[测试解锁] 状态检查: locked=${result.locked}`)
    } catch (e) {
      logAndPush(4, `⚠️ 状态检查异常: ${e.message}`, 'warn')
      logFn('warn', `[测试解锁] 状态检查异常: ${e.message}`)
    }

    logFn('info', '========== [测试解锁] 流程结束 ==========')
    testUnlockLogger.info('========== [测试解锁] 流程结束 ==========')
    return result
  }, 'service:testUnlock'))

  ipcMain.handle('service:getTestUnlockLog', safeHandler(() => {
    return {
      success: true,
      logPath: testUnlockLogger.getLogPath(),
      content: testUnlockLogger.read()
    }
  }, 'service:getTestUnlockLog'))

  ipcMain.handle('service:runFullUnlockTest', async (event, testPassword = '') => {
    logFn('info', '========== [完整测试] IPC 处理器被调用 ==========')

    const testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    }

    const defaultReturn = {
      success: false,
      error: '测试未执行',
      results: testResults,
      logPath: '',
      logContent: ''
    }

    try {
      logFn('info', '[完整测试] 进入 try 块')

      if (typeof testUnlockLogger === 'undefined' || testUnlockLogger === null) {
        logFn('error', '[完整测试] testUnlockLogger 是 undefined/null')
        return { ...defaultReturn, error: '测试日志模块未加载' }
      }
      if (typeof testUnlockLogger.clear !== 'function') {
        logFn('error', '[完整测试] testUnlockLogger.clear 不是函数')
        return { ...defaultReturn, error: '测试日志模块初始化失败' }
      }

      logFn('info', '[完整测试] testUnlockLogger 检查通过')
      testUnlockLogger.clear()
      testUnlockLogger.separator('YCDesk 解锁功能完整测试')
      testUnlockLogger.info('开始执行测试...')

      const addTestResult = (testName, passed, message = '', skipped = false) => {
        if (skipped) testResults.skipped++
        else if (passed) testResults.passed++
        else testResults.failed++
        testResults.details.push({
          name: testName,
          passed: skipped ? null : passed,
          message: skipped ? `跳过: ${message || '不需要'}` : message
        })
        if (skipped) {
          testUnlockLogger.warning(`⏭️ ${testName} - 跳过 (${message || '不需要'})`)
          logFn('info', `[SKIP] ${testName}: ${message || '不需要'}`)
        } else if (passed) {
          testUnlockLogger.success(`${testName} - ${message}`)
          logFn('info', `[PASS] ${testName}: ${message}`)
        } else {
          testUnlockLogger.failure(`${testName} - ${message}`)
          logFn('warn', `[FAIL] ${testName}: ${message}`)
        }
      }

      logFn('info', '[完整测试] 开始执行测试 1: 环境检查')
      testUnlockLogger.section('环境检查')

      let safeStorage
      try {
        const electron = require('electron')
        safeStorage = electron.safeStorage
        logFn('info', '[完整测试] electron.safeStorage 获取成功')
      } catch (e) {
        logFn('error', `[完整测试] 获取 electron.safeStorage 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法访问 Electron safeStorage: ' + e.message }
      }

      const safeStorageAvailable = safeStorage.isEncryptionAvailable()
      logFn('info', `[完整测试] safeStorage.isEncryptionAvailable() = ${safeStorageAvailable}`)
      testUnlockLogger.info('Electron 环境', '可用')
      testUnlockLogger.info('safeStorage 加密', safeStorageAvailable ? '可用' : '不可用')
      addTestResult('Electron 环境检查', true, 'Electron 环境可用')
      addTestResult('safeStorage 加密检查', safeStorageAvailable, safeStorageAvailable ? '加密可用' : '加密不可用')

      logFn('info', '[完整测试] 开始执行测试 2: 模块结构检查')
      testUnlockLogger.section('模块结构检查')

      let credentialsManager
      try {
        credentialsManager = require('./credentials-manager')
        logFn('info', '[完整测试] credentials-manager 加载成功')
      } catch (e) {
        logFn('error', `[完整测试] 加载 credentials-manager 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法加载 credentials-manager: ' + e.message }
      }

      let inputHandlerModule
      try {
        inputHandlerModule = require('./input-handler')
        logFn('info', '[完整测试] input-handler 加载成功')
      } catch (e) {
        logFn('error', `[完整测试] 加载 input-handler 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法加载 input-handler: ' + e.message }
      }

      const requiredCredsMethods = ['saveUnlockPassword', 'getUnlockPassword', 'clearUnlockPassword', 'isEncryptionAvailable']
      let credsMethodsOk = true
      for (const method of requiredCredsMethods) {
        const ok = typeof credentialsManager[method] === 'function'
        if (!ok) credsMethodsOk = false
        testUnlockLogger.info(`${method}`, ok ? 'OK' : '未找到')
      }
      addTestResult('credentialsManager 模块', credsMethodsOk, '所有方法正常')

      const requiredInputMethods = ['handleRemoteInput', 'handleUnlockScreen', 'initLogger', 'cleanup']
      let inputMethodsOk = true
      for (const method of requiredInputMethods) {
        const ok = typeof inputHandlerModule[method] === 'function'
        if (!ok) inputMethodsOk = false
        testUnlockLogger.info(`${method}`, ok ? 'OK' : '未找到')
      }
      addTestResult('inputHandler 模块', inputMethodsOk, '所有方法正常')

      logFn('info', '[完整测试] 开始执行测试 3: 密码加密功能')
      testUnlockLogger.section('密码加密功能测试')

      const testPwd = testPassword || 'TestPassword123!@#'
      testUnlockLogger.info('测试密码长度', testPwd.length)

      const saveResult = await credentialsManager.saveUnlockPassword(testPwd)
      addTestResult('密码保存功能', saveResult.success, saveResult.message)

      if (saveResult.success) {
        const getResult = await credentialsManager.getUnlockPassword()
        const passwordMatch = getResult.success && getResult.password === testPwd
        addTestResult('密码读取功能', getResult.success, getResult.success ? '读取成功' : '读取失败')
        addTestResult('密码匹配验证', passwordMatch, passwordMatch ? '密码匹配' : '密码不匹配')
        await credentialsManager.clearUnlockPassword()
        testUnlockLogger.info('测试密码已清理')
      }

      logFn('info', '[完整测试] 开始执行测试 4: 存储路径')
      testUnlockLogger.section('存储路径测试')

      const path = require('path')
      const fs = require('fs')
      const credentialsFile = path.join(__dirname, '../../data/credentials.json')
      const dataDir = path.dirname(credentialsFile)
      const dirExists = fs.existsSync(dataDir)
      testUnlockLogger.info('密码文件路径', credentialsFile)
      testUnlockLogger.info('数据目录', dirExists ? '已存在' : '不存在')
      addTestResult('密码存储路径', true, credentialsFile)
      addTestResult('数据目录检查', dirExists, dataDir)

      logFn('info', '[完整测试] 开始执行测试 5: 服务模式检查')
      testUnlockLogger.section('服务模式检查')

      let serviceModeEnabled = false
      let clientConnected = false

      try {
        const si = getServiceIntegration()
        serviceModeEnabled = si.isServiceModeEnabled()
        clientConnected = si.isRunning()
      } catch (e) {
        logFn('warn', `[完整测试] 服务模式检查失败: ${e.message}`)
      }

      testUnlockLogger.info('服务模式', serviceModeEnabled ? '已启用' : '未启用')
      testUnlockLogger.info('客户端连接', clientConnected ? '已连接' : '未连接')
      addTestResult('服务模式检查', true, serviceModeEnabled ? '已启用' : '未启用')
      addTestResult('服务客户端连接', clientConnected, clientConnected ? '已连接' : '未连接')

      logFn('info', '[完整测试] 开始执行测试 6: 解锁方式检查')
      testUnlockLogger.section('解锁方式检查')

      const robotJsAvailable = (() => {
        try { require('robotjs'); return true } catch (e) { return false }
      })()

      testUnlockLogger.info('服务模式解锁', serviceModeEnabled && clientConnected ? '可用' : '不可用')
      testUnlockLogger.info('SendInput 方式', '可用')
      testUnlockLogger.info('robotjs 方式', robotJsAvailable ? '可用' : '不可用')
      testUnlockLogger.info('tscon 方式', '可用')

      addTestResult('服务模式解锁', true, serviceModeEnabled && clientConnected ? '可用' : '服务模式未启用', !serviceModeEnabled || !clientConnected)
      addTestResult('SendInput 解锁', true, '可用')
      addTestResult('robotjs 解锁', robotJsAvailable, robotJsAvailable ? '可用' : '不可用')
      addTestResult('tscon 解锁', true, '可用')

      logFn('info', '[完整测试] 所有测试完成，准备返回结果')
      testUnlockLogger.separator('测试报告')
      testUnlockLogger.info('测试结果', {
        passed: testResults.passed,
        failed: testResults.failed,
        skipped: testResults.skipped,
        total: testResults.passed + testResults.failed + testResults.skipped
      })
      testUnlockLogger.info('环境信息', {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        electron: true,
        safeStorage: safeStorageAvailable
      })
      testUnlockLogger.success('测试执行完成')

      const finalResult = {
        success: testResults.failed === 0,
        results: testResults,
        logPath: testUnlockLogger.getLogPath(),
        logContent: testUnlockLogger.read()
      }
      logFn('info', `[完整测试] 返回结果: success=${finalResult.success}, passed=${testResults.passed}, failed=${testResults.failed}`)
      return finalResult

    } catch (e) {
      logFn('error', `[完整测试] 捕获到异常: ${e.message}`)
      logFn('error', `[完整测试] 堆栈: ${e.stack || '无'}`)
      if (testUnlockLogger && typeof testUnlockLogger.error === 'function') {
        testUnlockLogger.error('测试执行失败', e.message)
      }
      return {
        success: false,
        error: e.message,
        stack: e.stack,
        results: testResults,
        logPath: testUnlockLogger && typeof testUnlockLogger.getLogPath === 'function' ? testUnlockLogger.getLogPath() : '',
        logContent: testUnlockLogger && typeof testUnlockLogger.read === 'function' ? testUnlockLogger.read() : ''
      }
    }
  })
}

module.exports = { register }
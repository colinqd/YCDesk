const { ipcMain, desktopCapturer, screen } = require('electron')

function register(safeHandler, logFn) {
  ipcMain.handle('get-sources', safeHandler(async () => {
    logFn('info', '正在获取屏幕源...')
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 240 },
      fetchWindowIcons: true
    })
    logFn('info', `找到 ${sources.length} 个屏幕源`)

    var screens = []
    var windows = []
    var wechatWindows = []
    sources.forEach(function(source) {
      if (source.id.startsWith('screen:')) {
        screens.push(source.name)
      } else {
        windows.push(source.name)
        if (/微信|WeChat|wechat/i.test(source.name)) {
          wechatWindows.push(source)
        }
      }
    })

    logFn('info', `屏幕源: ${screens.length}个 [${screens.join(', ')}]`)
    logFn('info', `窗口源: ${windows.length}个 [${windows.join(', ')}]`)
    if (wechatWindows.length > 0) {
      logFn('info', `发现微信/WeChat窗口: ${wechatWindows.length}个 [${wechatWindows.map(function(w){return w.name}).join(', ')}]`)
      logFn('warn', '⚠️ 微信桌面版可能启用了反截屏保护(WDA_MONITOR)，窗口内容可能显示为黑色')
    } else {
      logFn('warn', '未发现微信/WeChat窗口在源列表中（可能微信未运行或窗口被隐藏）')
    }

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  }, 'get-sources'))

  ipcMain.handle('get-screen-size', safeHandler(() => {
    const primaryDisplay = screen.getPrimaryDisplay()
    return {
      width: primaryDisplay.size.width,
      height: primaryDisplay.size.height,
      scaleFactor: primaryDisplay.scaleFactor,
      workArea: primaryDisplay.workArea
    }
  }, 'get-screen-size'))

  ipcMain.handle('get-platform', safeHandler(() => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node
  }), 'get-platform'))

  ipcMain.handle('detect-wda-protection', safeHandler(async () => {
    logFn('info', '检测窗口反截屏保护状态...')
    var result = { success: true, protectedWindows: [], method: 'powershell' }
    try {
      var { execSync } = require('child_process')
      var psScript = `
        Add-Type -TypeDefinition '
          using System;
          using System.Runtime.InteropServices;
          public class WdaCheck {
            [DllImport("user32.dll")]
            public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
            [DllImport("user32.dll")]
            public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint dwAffinity);
          }
        '
        $wechatHwnd = [WdaCheck]::FindWindow("WeChatMainWndForPC", $null)
        $affinity = 0
        $result = @{}
        if ($wechatHwnd -ne [IntPtr]::Zero) {
          [WdaCheck]::GetWindowDisplayAffinity($wechatHwnd, [ref]$affinity)
          $result.wechatMain = @{ hwnd = $wechatHwnd.ToInt64(); wdaMonitors = ($affinity -eq 1); affinity = $affinity }
        }
        $result | ConvertTo-Json
      `
      var output = execSync(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + psScript + '"',
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      try {
        var psResult = JSON.parse(output)
        if (psResult.wechatMain) {
          result.wechatMainHwnd = psResult.wechatMain.hwnd
          result.isWdaProtected = psResult.wechatMain.wdaMonitors || false
          result.affinity = psResult.wechatMain.affinity || 0
          if (result.isWdaProtected) {
            logFn('warn', `检测到微信窗口反截屏保护(WDA_MONITOR=1)，hwnd=${result.wechatMainHwnd}`)
          } else {
            logFn('info', '微信窗口未检测到反截屏保护')
          }
        }
        result.details = psResult
      } catch (parseErr) {
        logFn('warn', '解析WDA检测结果失败: ' + parseErr.message)
      }
    } catch (e) {
      result.success = false
      result.error = e.message
      logFn('warn', 'WDA检测失败: ' + e.message)
    }
    return result
  }, 'detect-wda-protection'))

  ipcMain.handle('try-bypass-wda', safeHandler(async () => {
    logFn('info', '尝试绕过反截屏保护...')
    var result = { success: false, method: null, error: null }
    try {
      var { execSync } = require('child_process')
      var psScript = `
        Add-Type -TypeDefinition '
          using System;
          using System.Runtime.InteropServices;
          public class WdaBypass {
            [DllImport("user32.dll")]
            public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
            [DllImport("user32.dll")]
            public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);
          }
        '
        $wechatHwnd = [WdaBypass]::FindWindow("WeChatMainWndForPC", $null)
        if ($wechatHwnd -eq [IntPtr]::Zero) { Write-Host 'WECHAT_NOT_FOUND'; exit 1 }
        $ok = [WdaBypass]::SetWindowDisplayAffinity($wechatHwnd, 0)
        if ($ok) { Write-Host 'WDA_BYPASS_SUCCESS' } else { Write-Host 'WDA_BYPASS_FAILED' }
      `
      var output = execSync(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + psScript + '"',
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      if (output.includes('WDA_BYPASS_SUCCESS')) {
        result.success = true
        result.method = 'set_WDA_NONE'
        logFn('info', '已成功绕过微信反截屏保护')
      } else if (output.includes('WECHAT_NOT_FOUND')) {
        result.error = '未找到微信窗口'
        logFn('warn', '绕过失败: 未找到微信窗口')
      } else {
        result.error = output
        logFn('warn', '绕过失败: ' + output)
      }
    } catch (e) {
      result.error = e.message
      logFn('error', '绕过WDA异常: ' + e.message)
    }
    return result
  }, 'try-bypass-wda'))
}

module.exports = { register }
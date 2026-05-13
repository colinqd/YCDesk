const { ipcMain } = require('electron')

function register(safeHandler, logFn) {
  ipcMain.handle('service:lockScreen', safeHandler(async () => {
    logFn('info', '[锁屏] 请求锁定屏幕（Linux）')
    try {
      const { execSync } = require('child_process')
      let success = false
      let method = ''

      const lockCommands = [
        { cmd: 'loginctl lock-session', name: 'loginctl' },
        { cmd: 'gnome-screensaver-command -l', name: 'gnome-screensaver' },
        { cmd: 'xdg-screensaver lock', name: 'xdg-screensaver' },
        { cmd: 'dbus-send --type=method_call --dest=org.gnome.ScreenSaver /org/gnome/ScreenSaver org.gnome.ScreenSaver.Lock', name: 'gnome-dbus' }
      ]

      for (const lock of lockCommands) {
        try {
          logFn('info', `[锁屏] 尝试 ${lock.name}`)
          execSync(lock.cmd, { timeout: 3000 })
          success = true
          method = lock.name
          logFn('info', `[锁屏] ${lock.name} 调用成功`)
          break
        } catch (e) {
          logFn('warn', `[锁屏] ${lock.name} 失败: ${e.message}`)
        }
      }
      return { success, method }
    } catch (e) {
      logFn('error', `[锁屏] 失败: ${e.message}`)
      return { success: false, error: e.message }
    }
  }, 'service:lockScreen'))

  ipcMain.handle('service:isScreenLocked', safeHandler(async () => {
    logFn('info', '[状态检查] 检查屏幕锁定状态（Linux）')
    return { success: true, locked: false }
  }, 'service:isScreenLocked'))
}

module.exports = { register }
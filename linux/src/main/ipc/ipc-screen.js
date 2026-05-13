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
}

module.exports = { register }
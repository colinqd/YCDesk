/**
 * YCDesk 服务卸载脚本
 */

const Service = require('node-windows').Service
const path = require('path')
const fs = require('fs')
const os = require('os')

const svc = new Service({
  name: 'YCDeskService',
  script: path.resolve(__dirname, 'service-daemon.js')
})

svc.on('uninstall', () => {
  console.log('YCDeskService 卸载成功')
  // 清理 daemon/ 临时目录
  cleanupTempFiles()
})

svc.on('error', (err) => {
  console.error('卸载失败: ' + err.message)
  // 即使卸载失败也尝试清理
  cleanupTempFiles()
  process.exit(1)
})

/**
 * 清理服务相关的临时文件和目录
 */
function cleanupTempFiles() {
  const ycdeskDir = path.join(os.homedir(), '.ycdesk')

  // 清理 daemon/ 临时目录
  const daemonDir = path.join(ycdeskDir, 'daemon')
  try {
    if (fs.existsSync(daemonDir)) {
      fs.rmSync(daemonDir, { recursive: true, force: true })
      console.log('已清理 daemon/ 临时目录')
    }
  } catch (e) {
    console.log('清理 daemon/ 目录失败: ' + e.message)
  }

  // 清理 elevate-tmp/ 临时文件
  const elevateDir = path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    'YCDesk', 'elevate-tmp'
  )
  try {
    if (fs.existsSync(elevateDir)) {
      const files = fs.readdirSync(elevateDir)
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(elevateDir, f))
        } catch (e) {}
      })
      console.log('已清理 elevate-tmp/ 临时文件 (' + files.length + ' 个)')
    }
  } catch (e) {
    console.log('清理 elevate-tmp/ 失败: ' + e.message)
  }
}

console.log('正在卸载 YCDeskService...')
svc.uninstall()
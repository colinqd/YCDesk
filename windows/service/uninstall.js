/**
 * YCDesk 服务卸载脚本
 */

const Service = require('node-windows').Service
const path = require('path')

const svc = new Service({
  name: 'YCDeskService',
  script: path.resolve(__dirname, 'service-daemon.js')
})

svc.on('uninstall', () => {
  console.log('YCDeskService 卸载成功')
})

svc.on('error', (err) => {
  console.error('卸载失败: ' + err.message)
  process.exit(1)
})

console.log('正在卸载 YCDeskService...')
svc.uninstall()

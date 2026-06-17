/**
 * YCDesk 服务安装脚本
 * 使用 node-windows 将服务注册为 Windows Service
 */

const Service = require('node-windows').Service
const path = require('path')

const svc = new Service({
  name: 'YCDeskService',
  description: 'YCDesk 远程桌面后台服务，提供用户未登录时的自动启动与监听功能',
  script: path.resolve(__dirname, 'service-daemon.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=128'
  ]
})

svc.on('install', () => {
  console.log('YCDeskService 安装成功')
  svc.start()
})

svc.on('alreadyinstalled', () => {
  console.log('YCDeskService 已经安装')
})

svc.on('error', (err) => {
  console.error('安装失败: ' + err.message)
  process.exit(1)
})

svc.on('start', () => {
  console.log('YCDeskService 已启动')
})

console.log('正在安装 YCDeskService...')
svc.install()

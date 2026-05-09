#!/usr/bin/env node
const SignalingServer = require('../server-gui/server/server-module.js')

const args = process.argv.slice(2)
const options = { port: 3000 }

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    options.port = parseInt(args[i + 1])
  } else if (args[i] === '--cert' && args[i + 1]) {
    options.cert = args[i + 1]
  } else if (args[i] === '--key' && args[i + 1]) {
    options.key = args[i + 1]
  } else if (args[i] === '--no-https') {
    options.noHttps = true
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('YCDesk 信令服务器')
    console.log('用法: node server.js [选项]')
    console.log('  --port <port>   监听端口 (默认: 3000)')
    console.log('  --cert <path>   SSL 证书路径')
    console.log('  --key <path>    SSL 私钥路径')
    console.log('  --no-https      禁用 HTTPS')
    console.log('  --help, -h      显示帮助')
    process.exit(0)
  }
}

const server = new SignalingServer(options)
server.start()

process.on('SIGINT', () => {
  console.log('\n收到关闭信号，正在停止服务器...')
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  server.stop()
  process.exit(0)
})
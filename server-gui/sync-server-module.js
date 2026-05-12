const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, 'server', 'server-module.js')
const DEST = path.join(__dirname, 'src', 'server-module.js')

console.log('=== 同步 server-module ===')
console.log('源:', SRC)

if (!fs.existsSync(SRC)) {
  console.error('错误: 找不到源文件', SRC)
  process.exit(1)
}

fs.copyFileSync(SRC, DEST)
console.log('已同步到:', DEST)
console.log('=== 同步完成 ===')
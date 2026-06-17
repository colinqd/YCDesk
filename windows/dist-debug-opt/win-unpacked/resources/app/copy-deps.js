/**
 * 预构建脚本：将根 node_modules 中的运行时依赖复制到 windows/node_modules
 * 因为 npm workspaces 会提升依赖到根目录，而 electron-builder 从 windows/ 构建看不到它们
 */
const fs = require('fs')
const path = require('path')

const ROOT_NODE_MODULES = path.resolve(__dirname, '..', 'node_modules')
const LOCAL_NODE_MODULES = path.resolve(__dirname, 'node_modules')

// socket.io-client 及其递归依赖
const REQUIRED_PACKAGES = [
  'socket.io-client',
  '@socket.io/component-emitter',
  'engine.io-client',
  'socket.io-parser',
  'engine.io-parser',
  'debug',
  'ms',
  'ws',
  'xmlhttprequest-ssl'
]

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.cpSync(src, dst, { recursive: true, force: true })
  return true
}

console.log('=== 复制运行时依赖到 windows/node_modules ===')
let copied = 0

for (const pkg of REQUIRED_PACKAGES) {
  const src = path.join(ROOT_NODE_MODULES, pkg)
  const dst = path.join(LOCAL_NODE_MODULES, pkg)
  if (copyDir(src, dst)) {
    console.log(`  ${pkg}`)
    copied++
  }
}

console.log(`=== 完成: ${copied}/${REQUIRED_PACKAGES.length} 个包 ===`)
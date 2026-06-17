/**
 * 预构建脚本：确保 windows/service/ 的依赖已安装
 *
 * 因为 npm workspaces 会把 windows/service/ 的依赖提升到根目录，
 * 但 electron-builder 从 windows/ 构建时需要它们在本地，
 * 否则 service-app/ 资源目录会缺少 node_modules/node-windows 等。
 *
 * 行为：
 *   - 若 service/node_modules/node-windows 已存在，跳过
 *   - 否则在 service/ 下执行 npm install --omit=dev
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SERVICE_DIR = path.resolve(__dirname, 'service')
const SERVICE_NM = path.join(SERVICE_DIR, 'node_modules')
const MARKER = path.join(SERVICE_NM, 'node-windows', 'package.json')

console.log('=== 检查服务子项目依赖 ===')
console.log('  目录: ' + SERVICE_DIR)

if (fs.existsSync(MARKER)) {
  console.log('  已安装 node-windows，跳过')
  process.exit(0)
}

if (!fs.existsSync(SERVICE_DIR)) {
  console.error('  ! service 目录不存在: ' + SERVICE_DIR)
  process.exit(1)
}

if (!fs.existsSync(path.join(SERVICE_DIR, 'package.json'))) {
  console.error('  ! service/package.json 不存在')
  process.exit(1)
}

console.log('  正在安装 windows/service 依赖（首次构建或清理后）...')
try {
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: SERVICE_DIR,
    stdio: 'inherit',
    shell: true
  })
} catch (e) {
  console.error('  ! service 依赖安装失败')
  process.exit(1)
}

if (!fs.existsSync(MARKER)) {
  console.error('  ! 安装后仍未找到 node-windows')
  process.exit(1)
}

console.log('=== 服务子项目依赖安装完成 ===')

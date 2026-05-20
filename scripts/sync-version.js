/**
 * YCDesk 版本同步脚本
 *
 * 将根 package.json 的版本同步到所有工作区包的 package.json
 * 用法: node scripts/sync-version.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const rootVersion = rootPkg.version
const workspaces = rootPkg.workspaces || []

let updated = 0
for (const ws of workspaces) {
  const pkgPath = path.join(ROOT, ws, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (pkg.version !== rootVersion) {
      pkg.version = rootVersion
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      console.log(`  ✓ ${ws}: ${pkg.version} → ${rootVersion}`)
      updated++
    } else {
      console.log(`  - ${ws}: ${rootVersion} (已同步)`)
    }
  } else {
    console.log(`  ! ${ws}: package.json 不存在，跳过`)
  }
}

console.log(`\n同步完成: ${updated} 个包已更新`)

// 输出版本摘要
console.log('\n=== 当前版本 ===')
console.log(`  根版本: v${rootVersion}`)
for (const ws of workspaces) {
  const pkgPath = path.join(ROOT, ws, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    console.log(`  ${ws}: v${pkg.version}`)
  }
}

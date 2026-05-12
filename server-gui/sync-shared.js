const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SHARED_SRC = path.join(PROJECT_ROOT, 'shared')
const TARGET_DIR = path.join(PROJECT_ROOT, 'server-gui', 'shared')

function getAllFiles(dir, baseDir = dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(path.relative(baseDir, fullPath))
    }
  }
  return results
}

console.log('=== 同步 shared/ 到 server-gui/shared ===')
const sourceFiles = getAllFiles(SHARED_SRC)
let copied = 0

for (const relPath of sourceFiles) {
  const srcFile = path.join(SHARED_SRC, relPath)
  const destFile = path.join(TARGET_DIR, relPath)
  const destDir = path.dirname(destFile)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  let needCopy = true
  if (fs.existsSync(destFile)) {
    needCopy = fs.readFileSync(srcFile, 'utf8') !== fs.readFileSync(destFile, 'utf8')
  }
  if (needCopy) {
    fs.copyFileSync(srcFile, destFile)
    copied++
  }
}

console.log('同步完成: ' + copied + ' 个文件已更新')
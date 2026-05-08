const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SHARED_SRC = path.join(PROJECT_ROOT, 'shared')

const SYNC_TARGETS = [
  {
    name: 'windows/shared',
    dir: path.join(PROJECT_ROOT, 'windows', 'shared'),
    filter: (relPath) => {
      const normalized = relPath.replace(/\\/g, '/')
      const exclude = [
        'core/',
        'managers/',
        'platform/',
        'utils/',
        'video/',
        'gestures/',
        'input-manager.js',
        'input-protocol-usage.js',
        'components/matrix-transformer-dom.js'
      ]
      if (exclude.some(e => normalized.includes(e))) return false
      if (normalized.endsWith('.test.js')) return false
      return true
    }
  },
  {
    name: 'android/shared',
    dir: path.join(PROJECT_ROOT, 'android', 'shared'),
    filter: () => true
  }
]

function getAllFiles(dir, baseDir = dir) {
  const results = []
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

function syncShared() {
  console.log('=== 同步 shared/ 到各平台目录 ===')
  console.log('源目录:', SHARED_SRC)
  console.log('')

  const sourceFiles = getAllFiles(SHARED_SRC)
  let totalCopied = 0
  let totalSkipped = 0

  for (const target of SYNC_TARGETS) {
    console.log(`--- 同步到 ${target.name} ---`)
    let copied = 0
    let skipped = 0

    for (const relPath of sourceFiles) {
      if (!target.filter(relPath)) {
        skipped++
        continue
      }

      const srcFile = path.join(SHARED_SRC, relPath)
      const destFile = path.join(target.dir, relPath)

      const destDir = path.dirname(destFile)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }

      const srcContent = fs.readFileSync(srcFile, 'utf8')
      let needCopy = true

      if (fs.existsSync(destFile)) {
        const destContent = fs.readFileSync(destFile, 'utf8')
        if (srcContent === destContent) {
          needCopy = false
        }
      }

      if (needCopy) {
        fs.copyFileSync(srcFile, destFile)
        console.log(`  已同步: ${relPath}`)
        copied++
      }
    }

    console.log(`  结果: ${copied} 个文件已更新, ${skipped} 个文件已跳过`)
    totalCopied += copied
    totalSkipped += skipped
    console.log('')
  }

  console.log(`=== 同步完成: ${totalCopied} 个文件已更新, ${totalSkipped} 个文件已跳过 ===`)
}

syncShared()

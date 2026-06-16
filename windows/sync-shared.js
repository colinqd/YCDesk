const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SHARED_SRC = path.join(PROJECT_ROOT, 'shared')
const SHARED_RENDERER_SRC = path.join(PROJECT_ROOT, 'shared', 'renderer')

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
  },
  {
    name: 'windows/shared/renderer',
    dir: path.join(PROJECT_ROOT, 'windows', 'shared', 'renderer'),
    filter: () => true
  },
  {
    name: 'android/shared/renderer',
    dir: path.join(PROJECT_ROOT, 'android', 'shared', 'renderer'),
    filter: () => true
  },
  {
    name: 'linux/shared',
    dir: path.join(PROJECT_ROOT, 'linux', 'shared'),
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
    name: 'linux/shared/renderer',
    dir: path.join(PROJECT_ROOT, 'linux', 'shared', 'renderer'),
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
  const rendererSourceFiles = getAllFiles(SHARED_RENDERER_SRC)
  let totalCopied = 0
  let totalSkipped = 0

  for (const target of SYNC_TARGETS) {
    const isRenderer = target.name.includes('renderer')
    const files = isRenderer ? rendererSourceFiles : sourceFiles

    console.log(`--- 同步到 ${target.name} ---`)
    let copied = 0
    let skipped = 0

    for (const relPath of files) {
      if (!target.filter(relPath)) {
        skipped++
        continue
      }

      const srcBase = isRenderer ? SHARED_RENDERER_SRC : SHARED_SRC
      const srcFile = path.join(srcBase, relPath)
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
        let content = fs.readFileSync(srcFile, 'utf8')

        // 非 Android 平台（Windows/Linux）移除 ESM export 语法，兼容 <script> 加载
        if (target.name !== 'android/shared' && (relPath.endsWith('.js'))) {
          // 先移除完整的 export { ... } 块（多行）
          content = content.replace(/^export\s*\{[\s\S]*?^\}/gm, '/* ESM exports removed for CommonJS compatibility */')
          // 再处理单行 export 语句（如 export default function, export class 等）
          content = content.replace(/^export\s+(default\s+)?\S+/gm, '// $& (removed for non-module script)')
        }

        // 如果是同步到 Android 并且是 matrix-transformer.js，我们需要添加 export default
        if (target.name === 'android/shared' && relPath === 'components/matrix-transformer.js') {
          // 检查是否已经有 export default
          if (!content.includes('export default MatrixTransformer')) {
            // 在文件末尾添加 export default
            content = content + '\n\n// ES 模块导出 (用于 Android Vite 构建)\nexport default MatrixTransformer\n'
          }
        }

        fs.writeFileSync(destFile, content, 'utf8')
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

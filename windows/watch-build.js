const chokidar = require('chokidar')
const { exec } = require('child_process')
const path = require('path')

console.log('🚀 监听文件变化，自动构建...')
console.log('📂 监听目录: src/, shared/')
console.log('⏹️  按 Ctrl+C 停止\n')

let isBuilding = false
let buildTimer = null

function runBuild() {
  if (isBuilding) {
    console.log('⏳ 构建进行中，跳过本次触发...')
    return
  }

  isBuilding = true
  console.log('\n🔨 开始构建...')
  console.log('='.repeat(60))

  const buildProcess = exec('npm run build', {
    cwd: __dirname,
    stdio: 'inherit'
  })

  buildProcess.on('close', (code) => {
    isBuilding = false
    console.log('='.repeat(60))
    if (code === 0) {
      console.log('✅ 构建成功！\n')
    } else {
      console.log('❌ 构建失败，退出码:', code, '\n')
    }
  })
}

// 防抖处理，避免短时间内多次触发
function debouncedBuild() {
  if (buildTimer) {
    clearTimeout(buildTimer)
  }
  buildTimer = setTimeout(() => {
    runBuild()
  }, 1000)
}

// 监听文件变化
const watcher = chokidar.watch(
  ['src/**/*.js', 'src/**/*.html', 'src/**/*.css', 'shared/**/*.js', 'index.html', 'remote.html', 'preload.js'],
  {
    ignored: /node_modules|dist|\.git/,
    persistent: true,
    ignoreInitial: true
  }
)

watcher
  .on('add', (filePath) => {
    console.log(`📄 新增文件: ${path.relative(__dirname, filePath)}`)
    debouncedBuild()
  })
  .on('change', (filePath) => {
    console.log(`✏️  修改文件: ${path.relative(__dirname, filePath)}`)
    debouncedBuild()
  })
  .on('unlink', (filePath) => {
    console.log(`🗑️  删除文件: ${path.relative(__dirname, filePath)}`)
    debouncedBuild()
  })

process.on('SIGINT', () => {
  console.log('\n👋 停止监听')
  watcher.close()
  process.exit(0)
})

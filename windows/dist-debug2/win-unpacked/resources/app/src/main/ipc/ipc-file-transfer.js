/**
 * YCDesk 文件传输 IPC 模块
 * 
 * 处理主进程中的文件操作（读取、写入、对话框）
 * 支持大文件分块传输（Base64 编码）
 */

const { ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const fsPromises = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const os = require('os')

const CHUNK_SIZE = 16 * 1024 // 16KB per chunk
const DEFAULT_SAVE_DIR = path.join(os.homedir(), 'YCDesk_Files')

// 文件句柄缓存（用于分块写入）
const fileWriters = new Map()

/**
 * 确保默认保存目录存在
 */
function ensureSaveDir() {
    if (!fs.existsSync(DEFAULT_SAVE_DIR)) {
        fs.mkdirSync(DEFAULT_SAVE_DIR, { recursive: true })
    }
    return DEFAULT_SAVE_DIR
}

/**
 * 打开文件选择对话框
 */
async function selectFiles(options = {}) {
    const result = await dialog.showOpenDialog({
        title: '选择要传输的文件',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: '所有文件', extensions: ['*'] }
        ]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, files: [] }
    }

    const files = await Promise.all(result.filePaths.map(async (filePath, index) => {
        const stat = fs.statSync(filePath)
        const totalChunks = Math.ceil(stat.size / CHUNK_SIZE)
        
        // 计算文件 SHA-256 哈希（用于接收端完整性校验）
        const sha256 = await computeFileHash(filePath)
        
        return {
            id: 'file_' + Date.now() + '_' + index,
            name: path.basename(filePath),
            path: filePath,
            size: stat.size,
            totalChunks: totalChunks,
            chunkSize: CHUNK_SIZE,
            sha256: sha256
        }
    }))

    return { canceled: false, files }
}

/**
 * 计算文件的 SHA-256 哈希
 */
function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', (e) => reject(e))
    })
}

/**
 * 读取文件的指定数据块（返回 Base64）— 异步版本
 */
async function readChunk(filePath, offset, size = CHUNK_SIZE) {
    let fileHandle
    try {
        fileHandle = await fsPromises.open(filePath, 'r')
        const buffer = Buffer.alloc(size)
        const { bytesRead } = await fileHandle.read(buffer, 0, size, offset)
        return {
            data: buffer.slice(0, bytesRead).toString('base64'),
            bytesRead: bytesRead,
            offset: offset
        }
    } finally {
        if (fileHandle) await fileHandle.close()
    }
}

/**
 * 打开文件保存对话框
 */
async function selectSavePath(options = {}) {
    const defaultPath = path.join(ensureSaveDir(), options.suggestedName || 'received_file')
    
    const result = await dialog.showSaveDialog({
        title: '保存接收到的文件',
        defaultPath: defaultPath,
        filters: [
            { name: '所有文件', extensions: ['*'] }
        ]
    })
    
    if (result.canceled) {
        return { canceled: true, savePath: null }
    }

    return { canceled: false, savePath: result.filePath }
}

/**
 * 创建文件写入句柄 — 异步版本
 */
async function createFileWriter(fileId, savePath) {
    let fileHandle
    try {
        fileHandle = await fsPromises.open(savePath, 'w')
        const writer = { fileHandle, savePath, writtenBytes: 0 }
        fileWriters.set(fileId, writer)
        return { success: true, fileId }
    } catch (e) {
        if (fileHandle) {
            try { await fileHandle.close() } catch (_) {}
        }
        throw e
    }
}

/**
 * 写入数据块到文件 — 异步版本
 */
async function writeChunk(fileId, base64Data, offset) {
    const writer = fileWriters.get(fileId)
    if (!writer) {
        throw new Error('文件写入器不存在: ' + fileId)
    }
    
    const buffer = Buffer.from(base64Data, 'base64')
    const { bytesWritten } = await writer.fileHandle.write(buffer, 0, buffer.length, offset)
    writer.writtenBytes += bytesWritten
    
    return { bytesWritten, totalWritten: writer.writtenBytes }
}

/**
 * 关闭文件写入句柄并验证完整性 — 异步版本
 */
async function closeFileWriter(fileId, expectedSize, expectedSha256 = null) {
    const writer = fileWriters.get(fileId)
    if (!writer) {
        throw new Error('文件写入器不存在: ' + fileId)
    }
    
    try {
        await writer.fileHandle.close()
    } finally {
        fileWriters.delete(fileId)
    }
    
    const stat = await fsPromises.stat(writer.savePath)
    const sizeValid = stat.size === expectedSize
    
    // 计算接收文件的 SHA-256 哈希
    let sha256 = null
    let hashValid = true
    try {
        sha256 = await computeFileHash(writer.savePath)
        if (expectedSha256 && sha256 !== expectedSha256) {
            hashValid = false
        }
    } catch (e) {
        // 哈希计算失败不影响文件传输结果
        sha256 = null
    }
    
    return {
        success: true,
        savePath: writer.savePath,
        fileSize: stat.size,
        isValid: sizeValid && hashValid,
        totalWritten: writer.writtenBytes,
        sha256: sha256
    }
}

/**
 * 校验接收到的文件
 */
function verifyFile(filePath, expectedSize) {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(filePath)) {
                resolve({ valid: false, reason: '文件不存在' })
                return
            }
            
            const stat = fs.statSync(filePath)
            if (stat.size !== expectedSize) {
                resolve({ valid: false, reason: '文件大小不匹配: expected=' + expectedSize + ', actual=' + stat.size })
                return
            }
            
            resolve({ valid: true, size: stat.size })
        } catch (e) {
            resolve({ valid: false, reason: e.message })
        }
    })
}

/**
 * 获取默认接收目录
 */
function getSaveDir() {
    ensureSaveDir()
    return DEFAULT_SAVE_DIR
}

/**
 * 打开文件所在文件夹
 */
function showItemInFolder(filePath) {
    shell.showItemInFolder(filePath)
}

function register(safeHandler, logFn) {
    ipcMain.handle('file-transfer:selectFiles', safeHandler(async () => {
        return selectFiles()
    }, 'file-transfer:selectFiles'))

    ipcMain.handle('file-transfer:readChunk', safeHandler(async (event, { filePath, offset, size }) => {
        return readChunk(filePath, offset, size || CHUNK_SIZE)
    }, 'file-transfer:readChunk'))

    ipcMain.handle('file-transfer:saveFile', safeHandler(async (event, options) => {
        return selectSavePath(options)
    }, 'file-transfer:saveFile'))

    ipcMain.handle('file-transfer:createWriter', safeHandler(async (event, { fileId, savePath }) => {
        return createFileWriter(fileId, savePath)
    }, 'file-transfer:createWriter'))

    ipcMain.handle('file-transfer:writeChunk', safeHandler(async (event, { fileId, data, offset }) => {
        return writeChunk(fileId, data, offset)
    }, 'file-transfer:writeChunk'))

    ipcMain.handle('file-transfer:closeWriter', safeHandler(async (event, { fileId, expectedSize, expectedSha256 }) => {
        return closeFileWriter(fileId, expectedSize, expectedSha256)
    }, 'file-transfer:closeWriter'))

    ipcMain.handle('file-transfer:verifyFile', safeHandler(async (event, { filePath, expectedSize }) => {
        return verifyFile(filePath, expectedSize)
    }, 'file-transfer:verifyFile'))

    ipcMain.handle('file-transfer:getSaveDir', safeHandler(async () => {
        return { saveDir: getSaveDir() }
    }, 'file-transfer:getSaveDir'))

    ipcMain.handle('file-transfer:showInFolder', safeHandler(async (event, filePath) => {
        showItemInFolder(filePath)
        return { success: true }
    }, 'file-transfer:showInFolder'))
}

module.exports = { register, CHUNK_SIZE, DEFAULT_SAVE_DIR }
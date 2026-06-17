/**
 * YCDesk 剪贴板 IPC 模块
 * 
 * 将剪贴板操作下沉到主进程，使用 Electron 原生 clipboard 模块
 * 支持 text, HTML, image, RTF 等多种格式
 */

const { ipcMain, clipboard, nativeImage } = require('electron')
const crypto = require('crypto')

let clipboardMonitor = null
let lastClipboardHash = ''
let monitorCallback = null
let suppressNextMonitorCheck = false

/**
 * 计算剪贴板内容的哈希（用于去重）
 * 支持文本、图片、HTML 格式
 */
function getClipboardHash() {
    // 优先检查图片（图片复制时可能没有文本）
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
        const pngBuffer = image.toPNG()
        return crypto.createHash('md5').update(pngBuffer).digest('hex')
    }
    
    const text = clipboard.readText()
    if (text) {
        return crypto.createHash('md5').update(text).digest('hex')
    }
    
    // 检查 HTML 格式
    const html = clipboard.readHTML()
    if (html) {
        return crypto.createHash('md5').update(html).digest('hex')
    }
    
    return ''
}

/**
 * 读取剪贴板内容（多格式）
 */
function readClipboard() {
    const result = {
        text: clipboard.readText() || '',
        html: clipboard.readHTML() || '',
        rtf: clipboard.readRTF() || '',
        hasImage: !clipboard.readImage().isEmpty(),
        hash: getClipboardHash()
    }
    
    // 如果有图片，转为 Base64 data URL
    if (result.hasImage) {
        const img = clipboard.readImage()
        const pngData = img.toPNG()
        result.imageDataUrl = 'data:image/png;base64,' + pngData.toString('base64')
        result.imageSize = img.getSize()
    }
    
    return result
}

/**
 * 写入剪贴板内容（带回环抑制）
 */
function writeClipboard(data) {
    try {
        let contentUpdated = false
        
        // 优先写入图片（如果同时有文本和图片，图片可覆盖文本）
        if (data.imageDataUrl) {
            const img = nativeImage.createFromDataURL(data.imageDataUrl)
            clipboard.writeImage(img)
            contentUpdated = true
        }
        
        if (data.text) {
            clipboard.writeText(data.text)
            contentUpdated = true
        }
        
        if (data.html) {
            clipboard.writeHTML(data.html)
            contentUpdated = true
        }
        
        if (contentUpdated) {
            // 设置抑制标志，防止 monitor 将此写入误检测为外部变化
            suppressNextMonitorCheck = true
            lastClipboardHash = getClipboardHash()
        }
        
        return { success: contentUpdated }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

function stopMonitor() {
    if (clipboardMonitor) {
        clearInterval(clipboardMonitor)
        clipboardMonitor = null
    }
}

function register(safeHandler, logFn) {
    ipcMain.handle('clipboard:read', safeHandler(async () => {
        return readClipboard()
    }, 'clipboard:read'))

    ipcMain.handle('clipboard:write', safeHandler(async (event, data) => {
        return writeClipboard(data)
    }, 'clipboard:write'))

    ipcMain.handle('clipboard:hasFormat', safeHandler(async (event, format) => {
        const available = clipboard.availableFormats()
        return { hasFormat: available.includes(format), availableFormats: available }
    }, 'clipboard:hasFormat'))

    ipcMain.handle('clipboard:startMonitor', safeHandler(async (event, interval = 500) => {
        stopMonitor()  // 先停止旧监控
        
        lastClipboardHash = getClipboardHash()
        
        clipboardMonitor = setInterval(() => {
            if (suppressNextMonitorCheck) {
                suppressNextMonitorCheck = false
                return  // 跳过本次检查（自己的写入）
            }
            const currentHash = getClipboardHash()
            if (currentHash && currentHash !== lastClipboardHash) {
                lastClipboardHash = currentHash
                const content = readClipboard()
                // 通知所有窗口剪贴板已更改
                const { BrowserWindow } = require('electron')
                BrowserWindow.getAllWindows().forEach(win => {
                    if (!win.isDestroyed()) {
                        try { win.webContents.send('clipboard-changed', content) } catch (e) {}
                    }
                })
            }
        }, interval)
        
        logFn('info', '剪贴板监测已启动（间隔=' + interval + 'ms）')
        return { success: true }
    }, 'clipboard:startMonitor'))

    ipcMain.handle('clipboard:stopMonitor', safeHandler(async () => {
        stopMonitor()
        logFn('info', '剪贴板监测已停止')
        return { success: true }
    }, 'clipboard:stopMonitor'))

    // 应用退出时自动清理剪贴板定时器
    const { app } = require('electron')
    app.on('before-quit', () => {
        stopMonitor()
    })
}

module.exports = { register, readClipboard, writeClipboard, stopMonitor }
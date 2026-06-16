const fs = require('fs')
const path = require('path')

const pngPath = path.join(__dirname, 'assets', 'icon.png')
const icoPath = path.join(__dirname, 'assets', 'icon.ico')

const pngData = fs.readFileSync(pngPath)

const width = 0  // 0 means 256
const height = 0 // 0 means 256
const bpp = 32

// ICO header: reserved(2) + type(2) + count(2) = 6 bytes
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)  // reserved
header.writeUInt16LE(1, 2)  // type: 1 = ICO
header.writeUInt16LE(1, 4)  // count: 1 image

// ICO entry: 16 bytes
const entry = Buffer.alloc(16)
entry.writeUInt8(width, 0)        // width (0 = 256)
entry.writeUInt8(height, 1)       // height (0 = 256)
entry.writeUInt8(0, 2)            // color palette
entry.writeUInt8(0, 3)            // reserved
entry.writeUInt16LE(1, 4)         // color planes
entry.writeUInt16LE(bpp, 6)       // bits per pixel
entry.writeUInt32LE(pngData.length, 8) // image size
entry.writeUInt32LE(22, 12)       // offset (6 + 16 = 22)

const icoData = Buffer.concat([header, entry, pngData])
fs.writeFileSync(icoPath, icoData)

console.log(`icon.ico created (${icoData.length} bytes)`)
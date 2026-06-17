// Web Worker: 离屏帧捕获
// 在主线程外执行 drawImage + getImageData，避免阻塞 UI

var offscreenCanvas = null
var offscreenCtx = null
var videoWidth = 0
var videoHeight = 0

self.onmessage = function(e) {
  var msg = e.data

  switch (msg.type) {
    case 'init':
      // 接收 OffscreenCanvas
      offscreenCanvas = msg.canvas
      offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true })
      videoWidth = msg.width
      videoHeight = msg.height
      break

    case 'capture':
      // 收到视频帧的 ImageBitmap，绘制到 canvas 并提取 ImageData
      if (!offscreenCtx || !msg.frame) {
        self.postMessage({ type: 'error', error: 'not initialized' })
        return
      }

      try {
        offscreenCtx.drawImage(msg.frame, 0, 0)
        var imageData = offscreenCtx.getImageData(0, 0, videoWidth, videoHeight)

        // 将 ImageData 传回主线程（Transferable）
        self.postMessage({
          type: 'frame',
          imageData: imageData,
          width: videoWidth,
          height: videoHeight,
          timestamp: msg.timestamp || Date.now()
        }, [imageData.data.buffer])
      } catch (err) {
        self.postMessage({ type: 'error', error: err.message })
      }
      break

    case 'resize':
      videoWidth = msg.width
      videoHeight = msg.height
      if (offscreenCanvas) {
        offscreenCanvas.width = videoWidth
        offscreenCanvas.height = videoHeight
      }
      break
  }
}
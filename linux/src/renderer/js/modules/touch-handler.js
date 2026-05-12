(function () {
  window.TouchHandler = {
    setup: function (element, getMatrixTransformer) {
      if (!element) return

      var touchStartDistance = 0, touchStartScale = 1
      var touchStartX = 0, touchStartY = 0
      var touchStartPanX = 0, touchStartPanY = 0

      function getMt() { return typeof getMatrixTransformer === 'function' ? getMatrixTransformer() : getMatrixTransformer }

      function getTouchDistance(touches) {
        var dx = touches[0].clientX - touches[1].clientX
        var dy = touches[0].clientY - touches[1].clientY
        return Math.sqrt(dx * dx + dy * dy)
      }

      function getTouchCenter(touches) {
        return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2
        }
      }

      element.addEventListener('touchstart', function (e) {
        var mt = getMt()
        if (!mt) return
        if (e.touches.length === 2) {
          e.preventDefault()
          touchStartDistance = getTouchDistance(e.touches)
          touchStartScale = mt.scale
          var center = getTouchCenter(e.touches)
          touchStartX = center.x; touchStartY = center.y
          touchStartPanX = mt.panX; touchStartPanY = mt.panY
        } else if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX
          touchStartY = e.touches[0].clientY
          touchStartPanX = mt.panX; touchStartPanY = mt.panY
        }
      }, { passive: false })

      element.addEventListener('touchmove', function (e) {
        var mt = getMt()
        if (!mt) return
        if (e.touches.length === 2) {
          e.preventDefault()
          var currentDistance = getTouchDistance(e.touches)
          var scale = touchStartScale * (currentDistance / touchStartDistance)
          var clampedScale = Math.max(0.5, Math.min(3.0, scale))
          mt.scale = clampedScale
          mt._matrixDirty = true
          mt.applyTransform(element)
        } else if (e.touches.length === 1) {
          e.preventDefault()
          var deltaX = e.touches[0].clientX - touchStartX
          var deltaY = e.touches[0].clientY - touchStartY
          mt.panX = touchStartPanX + deltaX
          mt.panY = touchStartPanY + deltaY
          mt._matrixDirty = true
          mt.applyTransform(element)
        }
      }, { passive: false })
    }
  }
})()

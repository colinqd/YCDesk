/**
 * YCDesk MatrixTransformer 单元测试
 *
 * 测试矩阵变换器的初始化、坐标变换、缩放、平移等功能
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MatrixTransformer } from './matrix-transformer.js'

describe('MatrixTransformer 初始化', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
  })

  it('初始缩放为 1.0', () => {
    expect(transformer.scale).toBe(1.0)
  })

  it('初始平移 X 为 0', () => {
    expect(transformer.panX).toBe(0)
  })

  it('初始平移 Y 为 0', () => {
    expect(transformer.panY).toBe(0)
  })

  it('默认远程宽度为 1920', () => {
    expect(transformer.remoteScreenWidth).toBe(1920)
  })

  it('默认远程高度为 1080', () => {
    expect(transformer.remoteScreenHeight).toBe(1080)
  })
})

describe('setScreenSize', () => {
  it('设置屏幕宽度和高度', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    expect(transformer.screenWidth).toBe(800)
    expect(transformer.screenHeight).toBe(600)
  })
})

describe('setRemoteScreenSize', () => {
  it('设置远程屏幕宽度和高度', () => {
    const transformer = new MatrixTransformer()
    transformer.setRemoteScreenSize(1920, 1080)
    expect(transformer.remoteScreenWidth).toBe(1920)
    expect(transformer.remoteScreenHeight).toBe(1080)
  })
})

describe('显示区域计算', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
  })

  it('显示宽度等于屏幕宽度（远程更宽场景）', () => {
    expect(transformer.displayWidth).toBe(800)
  })

  it('显示高度按比例计算', () => {
    // 远程屏幕更宽 (16:9 > 4:3)，以宽度为基准
    // displayHeight = screenWidth / remoteAspect = 800 / (1920/1080) = 450
    expect(Math.abs(transformer.displayHeight - 450)).toBeLessThan(1)
  })

  it('显示 X 为 0', () => {
    expect(transformer.displayX).toBe(0)
  })

  it('显示 Y 大于 0（垂直居中）', () => {
    expect(transformer.displayY).toBeGreaterThan(0)
  })
})

describe('containerToRemote 坐标变换', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
  })

  it('屏幕中心点映射到远程中心', () => {
    const center = transformer.containerToRemote(400, 300)
    expect(center).not.toBeNull()
    expect(Math.abs(center.x - 0.5)).toBeLessThan(0.01)
    expect(Math.abs(center.y - 0.5)).toBeLessThan(0.01)
  })

  it('左上角映射', () => {
    // display area starts at y=75, so top-left of display is (0, 75)
    const topLeft = transformer.containerToRemote(0, 75)
    expect(topLeft).not.toBeNull()
    expect(topLeft.x).toBeGreaterThanOrEqual(0)
    expect(topLeft.y).toBeGreaterThanOrEqual(0)
  })

  it('右下角映射', () => {
    // display area: x[0,800], y[75,525], so bottom-right is (800, 525)
    const bottomRight = transformer.containerToRemote(800, 525)
    expect(bottomRight).not.toBeNull()
    expect(Math.abs(bottomRight.x - 1)).toBeLessThan(0.01)
    expect(Math.abs(bottomRight.y - 1)).toBeLessThan(0.01)
  })
})

describe('边界检查', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
  })

  it('超出左边界返回 null', () => {
    expect(transformer.containerToRemote(-10, 300)).toBeNull()
  })

  it('超出右边界返回 null', () => {
    expect(transformer.containerToRemote(810, 300)).toBeNull()
  })
})

describe('updateScale 缩放更新', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
  })

  it('缩放比例更新为 2.0', () => {
    transformer.updateScale(2.0, 400, 300)
    expect(transformer.scale).toBe(2.0)
  })

  it('缩放更新后矩阵标记为 dirty', () => {
    transformer.updateScale(2.0, 400, 300)
    expect(transformer._matrixDirty).toBe(true)
  })

  it('最大缩放限制为 3.0', () => {
    transformer.updateScale(4.0, 400, 300)
    expect(transformer.scale).toBe(3.0)
  })

  it('最小缩放限制为 0.5', () => {
    transformer.updateScale(0.2, 400, 300)
    expect(transformer.scale).toBe(0.5)
  })
})

describe('updatePan 平移更新', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
  })

  it('平移 X 累加正确', () => {
    transformer.updatePan(10, 20)
    expect(transformer.panX).toBe(10)
    expect(transformer.panY).toBe(20)
  })

  it('平移量可累加', () => {
    transformer.updatePan(10, 20)
    transformer.updatePan(-5, -10)
    expect(transformer.panX).toBe(5)
    expect(transformer.panY).toBe(10)
  })
})

describe('reset 重置', () => {
  let transformer

  beforeEach(() => {
    transformer = new MatrixTransformer()
    transformer.updateScale(2.0, 400, 300)
    transformer.updatePan(10, 20)
  })

  it('重置后缩放为 1.0', () => {
    transformer.reset()
    expect(transformer.scale).toBe(1.0)
  })

  it('重置后平移 X 为 0', () => {
    transformer.reset()
    expect(transformer.panX).toBe(0)
  })

  it('重置后平移 Y 为 0', () => {
    transformer.reset()
    expect(transformer.panY).toBe(0)
  })
})

describe('fullReset 完全重置', () => {
  it('完全重置后屏幕宽度为 0', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    transformer.fullReset()
    expect(transformer.screenWidth).toBe(0)
  })

  it('完全重置后远程宽度恢复默认', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    transformer.fullReset()
    expect(transformer.remoteScreenWidth).toBe(1920)
  })
})

describe('getState 获取状态', () => {
  it('返回完整的状态信息', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    transformer.updateScale(1.5, 400, 300)
    const state = transformer.getState()
    expect(state.scale).toBe(1.5)
    expect(state.screenWidth).toBe(800)
    expect(state.screenHeight).toBe(600)
    expect(state.remoteScreenWidth).toBe(1920)
    expect(state.remoteScreenHeight).toBe(1080)
  })
})

describe('displayToRemote', () => {
  it('Display 坐标正确映射到 Remote 归一化坐标', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)
    const display = transformer.displayToRemote(400, 225)
    expect(display).not.toBeNull()
    expect(display.x).toBeCloseTo(0.5, 1)
    expect(display.y).toBeCloseTo(0.5, 1)
  })
})

describe('viewToVideo', () => {
  it('View 坐标正确映射', () => {
    const transformer = new MatrixTransformer()
    transformer.updateScale(2.0, 0, 0)
    transformer.updatePan(100, 50)
    const video = transformer.viewToVideo(200, 150)
    expect(video).not.toBeNull()
    expect(typeof video.x).toBe('number')
    expect(typeof video.y).toBe('number')
  })
})

describe('完整流程', () => {
  it('设置 → 应用容器尺寸 → 应用变换 → 坐标变换完整链路', () => {
    const transformer = new MatrixTransformer()
    transformer.setScreenSize(800, 600)
    transformer.setRemoteScreenSize(1920, 1080)

    const container = {
      style: { width: '', height: '', left: '', top: '' }
    }
    transformer.applyContainerSize(container)

    expect(container.style.width).toBe(transformer.displayWidth + 'px')
    expect(container.style.height).toBe(transformer.displayHeight + 'px')

    const element = {
      style: { transform: '', transformOrigin: '', left: '', top: '' }
    }
    // Pre-set element dimensions so applyTransform doesn't need getBoundingClientRect
    transformer.elementWidth = 800
    transformer.elementHeight = 450
    transformer.applyTransform(element)

    expect(element.style.transform).toContain('scale')
    expect(element.style.left).toContain('px')
    expect(element.style.top).toContain('px')

    const remote = transformer.containerToRemote(400, 300)
    expect(remote).not.toBeNull()
  })
})

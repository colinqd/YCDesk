/**
 * YCDesk - Mock for robotjs module
 *
 * robotjs is used in the main process for native input simulation.
 * Since it requires native compilation (node-gyp), we mock it in tests.
 */

/**
 * Create a mock for the robotjs module.
 * Tracks all calls for assertions.
 *
 * Common robotjs functions used in YCDesk:
 *   - moveMouse(x, y)
 *   - moveMouseSmooth(x, y)
 *   - mouseClick(button)
 *   - mouseToggle(down, button)
 *   - scrollMouse(x, y)
 *   - keyTap(key, modifier)
 *   - keyToggle(key, down)
 *   - typeString(text)
 *   - getMousePos()
 *   - getScreenSize()
 *
 * @returns {Object} Mock robotjs
 */

const { createSpyFn } = require('./spy-fn.js')
function createRobotjsMock() {
  const mock = {
    // Track all calls
    _calls: [],

    moveMouse: createSpyFn((x, y) => {
      mock._calls.push({ method: 'moveMouse', args: [x, y] })
      mock._mousePos = { x, y }
    }),

    moveMouseSmooth: createSpyFn((x, y) => {
      mock._calls.push({ method: 'moveMouseSmooth', args: [x, y] })
      mock._mousePos = { x, y }
    }),

    mouseClick: createSpyFn((button) => {
      mock._calls.push({ method: 'mouseClick', args: [button] })
    }),

    mouseToggle: createSpyFn((down, button) => {
      mock._calls.push({ method: 'mouseToggle', args: [down, button] })
      mock._mouseButton = button
      mock._mouseDown = down === 'down'
    }),

    scrollMouse: createSpyFn((x, y) => {
      mock._calls.push({ method: 'scrollMouse', args: [x, y] })
    }),

    keyTap: createSpyFn((key, modifier) => {
      mock._calls.push({ method: 'keyTap', args: [key, modifier] })
    }),

    keyToggle: createSpyFn((key, down) => {
      mock._calls.push({ method: 'keyToggle', args: [key, down] })
    }),

    typeString: createSpyFn((text) => {
      mock._calls.push({ method: 'typeString', args: [text] })
    }),

    getMousePos: createSpyFn(() => {
      return mock._mousePos || { x: 0, y: 0 }
    }),

    getScreenSize: createSpyFn(() => {
      return { width: 1920, height: 1080 }
    }),

    /**
     * Reset call history and state.
     */
    _reset() {
      mock._calls = []
      mock._mousePos = { x: 0, y: 0 }
      mock._mouseButton = 'left'
      mock._mouseDown = false
      // Reset all createSpyFn() call counts
      Object.keys(mock).forEach((key) => {
        if (typeof mock[key] === 'function' && mock[key].mock) {
          mock[key].mockReset()
          // Restore default implementation
          const defaultImpl = {
            moveMouse: () => { mock._mousePos = { x: arguments?.[0] || 0, y: arguments?.[1] || 0 } },
            moveMouseSmooth: () => { mock._mousePos = { x: arguments?.[0] || 0, y: arguments?.[1] || 0 } },
            mouseClick: () => {},
            mouseToggle: () => {},
            scrollMouse: () => {},
            keyTap: () => {},
            keyToggle: () => {},
            typeString: () => {},
            getMousePos: () => mock._mousePos || { x: 0, y: 0 },
            getScreenSize: () => ({ width: 1920, height: 1080 }),
          }[key]
          if (defaultImpl) {
            mock[key].mockImplementation(defaultImpl)
          }
        }
      })
    },
  }

  return mock
}

module.exports = { createRobotjsMock }

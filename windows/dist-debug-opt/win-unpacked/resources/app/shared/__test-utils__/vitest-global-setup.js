/**
 * YCDesk - Global polyfills for integration tests
 *
 * Sets up browser-like globals that integration tests need but Node.js
 * doesn't provide natively.
 *
 * This file is loaded via vitest.config.js `setupFiles`.
 */

const WebSocket = require('ws')

// Polyfill WebSocket for Node environment
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket
}

// Polyfill navigator.mediaDevices (for video pipeline tests)
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {}
}
if (!globalThis.navigator.mediaDevices) {
  globalThis.navigator.mediaDevices = {
    getUserMedia: vi.fn(async () => {
      throw new Error('getUserMedia not mocked in this test')
    }),
    enumerateDevices: vi.fn(async () => []),
  }
}

// Polyfill window and document for modules that reference them
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: vi.fn(() => ({})),
    getElementById: vi.fn(() => null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    documentElement: { style: {} },
    body: { style: {}, appendChild: vi.fn(), removeChild: vi.fn() },
    head: { appendChild: vi.fn() },
    createTextNode: vi.fn(() => ({})),
  }
}

// Polyfill performance.now
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = {
    now: vi.fn(() => Date.now()),
  }
}

// Polyfill devicePixelRatio
if (typeof globalThis.devicePixelRatio === 'undefined') {
  globalThis.devicePixelRatio = 1
}

// Polyfill Image for canvas-related tests
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class Image {
    constructor(w, h) { this.width = w; this.height = h; this.naturalWidth = w; this.naturalHeight = h }
    set onload(cb) { this._onload = cb }
    set onerror(cb) { this._onerror = cb }
    _simulateLoad() { if (this._onload) this._onload() }
    _simulateError(err) { if (this._onerror) this._onerror(err) }
  }
}

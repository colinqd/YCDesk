/**
 * YCDesk - Test mock utilities
 *
 * Provides a cross-environment spy/ mock function factory
 * that works both inside Vitest (delegates to vi.fn()) and standalone
 * (creates a simple call-tracking function).
 */

/**
 * Create a spy function. Inside Vitest, delegates to vi.fn().
 * Standalone, creates a simple Function with mockReset/mockClear.
 *
 * @param {Function} [impl] - Optional implementation.
 * @returns {Function} Spy function with .mock.calls, .mockClear(), .mockReset()
 */
function createSpyFn(impl) {
  const hasGlobalVi = typeof vi !== 'undefined' && typeof vi.fn === 'function'

  if (hasGlobalVi) {
    return impl ? vi.fn(impl) : vi.fn()
  }

  // Standalone spy
  function fn(...args) {
    fn.mock.calls.push(args)
    fn._lastArgs = args
    if (typeof impl === 'function') {
      return impl.apply(this, args)
    }
  }

  fn.mock = { calls: [] }
  fn.mockClear = function () {
    fn.mock.calls = []
    fn._lastArgs = undefined
  }
  fn.mockReset = function () {
    fn.mock.calls = []
    fn._lastArgs = undefined
    if (typeof impl !== 'function') {
      fn.mockImplementation = () => {}
    }
  }
  fn.mockImplementation = function (newImpl) {
    impl = newImpl
    // Re-wrap
    const wrapped = function (...args) {
      wrapped.mock.calls.push(args)
      if (typeof impl === 'function') {
        return impl.apply(this, args)
      }
    }
    wrapped.mock = fn.mock
    wrapped.mockClear = fn.mockClear
    wrapped.mockReset = fn.mockReset
    wrapped.mockImplementation = fn.mockImplementation
    return wrapped
  }

  return fn
}

module.exports = { createSpyFn }

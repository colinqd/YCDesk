/**
 * YCDesk - Async test helpers for integration tests
 *
 * Provides utilities for waiting on async conditions with timeouts.
 */

/**
 * Retry a predicate function until it returns truthy or timeout.
 *
 * @param {Function} fn - Predicate to evaluate. Return truthy to resolve.
 * @param {Object} [options]
 * @param {number} [options.timeout=5000] - Max ms to wait.
 * @param {number} [options.interval=50] - Poll interval ms.
 * @returns {Promise<*>} The truthy value returned by fn.
 */
async function eventually(fn, { timeout = 5000, interval = 50 } = {}) {
  const start = Date.now()
  let lastError

  while (Date.now() - start < timeout) {
    try {
      const result = await fn()
      if (result) return result
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, interval))
  }

  // One final try before throwing
  const result = await fn()
  if (result) return result

  throw new Error(
    `eventually() timed out after ${timeout}ms` +
      (lastError ? `\n  Last error: ${lastError.message}` : '')
  )
}

/**
 * Wait for a specified number of milliseconds.
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait for a specific event to be emitted from an EventEmitter-like object.
 *
 * @param {Object} emitter - Object with on/off or addEventListener/removeEventListener.
 * @param {string} event - Event name.
 * @param {number} [timeout=5000] - Timeout in ms.
 * @returns {Promise<*>} The event payload.
 */
function waitForEvent(emitter, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`waitForEvent('${event}') timed out after ${timeout}ms`))
    }, timeout)

    function handler(...args) {
      cleanup()
      resolve(args.length <= 1 ? args[0] : args)
    }

    function cleanup() {
      clearTimeout(timer)
      if (typeof emitter.off === 'function') {
        emitter.off(event, handler)
      } else if (typeof emitter.removeEventListener === 'function') {
        emitter.removeEventListener(event, handler)
      }
    }

    if (typeof emitter.on === 'function') {
      emitter.on(event, handler)
    } else if (typeof emitter.addEventListener === 'function') {
      emitter.addEventListener(event, handler)
    } else {
      clearTimeout(timer)
      reject(new Error('Emitter does not support on/off or addEventListener/removeEventListener'))
    }
  })
}

module.exports = { eventually, delay, waitForEvent }

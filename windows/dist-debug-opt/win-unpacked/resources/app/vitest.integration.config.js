/**
 * YCDesk - Vitest configuration for integration tests
 *
 * Separate config for simulation/integration tests with:
 *   - Longer timeouts (30s for async flows)
 *   - Retry on flaky tests
 *   - Global polyfills for WebRTC/WebSocket in Node.js
 *   - Thread pool for parallel execution
 */
const { defineConfig } = require('vitest/config')
const path = require('path')

module.exports = defineConfig({
  test: {
    // Integration tests need more time for async flows
    testTimeout: 30000,
    hookTimeout: 15000,

    // Retry flaky tests once
    retry: 1,

    // Include patterns for integration tests
    include: [
      '../shared/__integration__/**/*.test.js',
      '../shared/__tests__/**/*.test.js',
      '../shared/**/*.test.js',
      'src/**/__tests__/**/*.test.js',
      'src/**/*.test.js',
    ],

    // Exclude existing unit tests from integration runs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
    ],

    // Setup file for global polyfills
    setupFiles: [
      '../shared/__test-utils__/vitest-global-setup.js',
    ],

    // Use single thread to avoid port conflicts in signaling tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },

    // Global test utilities (describe, it, expect, vi, etc.)
    globals: true,

    // Environment
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: [
        '../shared/**/*.js',
        'src/**/*.js',
      ],
      exclude: [
        '**/__test-utils__/**',
        '**/__integration__/**',
        '**/__tests__/**',
        '**/*.test.js',
        '**/node_modules/**',
      ],
      reportsDirectory: './coverage-integration',
    },
  },

  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})

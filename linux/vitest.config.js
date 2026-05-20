import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['**/renderer/**/*.test.js', 'jsdom'],
      ['**/*.dom.test.js', 'jsdom']
    ],
    include: [
      '../shared/**/__tests__/**/*.test.js',
      '../shared/**/*.test.js',
      'src/**/__tests__/**/*.test.js',
      'src/**/*.test.js'
    ],
    exclude: [
      'node_modules/**',
      'dist/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        '../shared/**/*.js',
        'src/main/**/*.js',
        'src/renderer/**/*.js'
      ],
      exclude: [
        '**/*.test.js',
        '**/__tests__/**',
        'node_modules/**',
        'dist/**'
      ]
    },
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  }
})

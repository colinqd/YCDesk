import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared')
    }
  }
})

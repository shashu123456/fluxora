import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Electron main-process suites need the Node environment for native `sqlite3`.
    environmentMatchGlobs: [
      ['tests/electron/**', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'electron/services/ai/**/*.ts', 'electron/ipc/shared.ts'],
      exclude: ['**/*.test.*', '**/node_modules/**'],
    },
    server: {
      deps: {
        external: ['sqlite3'],
      },
    },
  },
})

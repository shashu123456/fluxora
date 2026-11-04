import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        splash: path.resolve(__dirname, 'splash.html'),
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'state-vendor': ['zustand'],
          'markdown-vendor': ['react-markdown', 'remark-gfm'],
          'highlight-vendor': ['highlight.js'],
          'radix-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
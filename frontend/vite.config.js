import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          // React core libraries
          'react-vendor': ['react', 'react-dom'],
          // Redux
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],
          // Router
          'router-vendor': ['react-router-dom'],
          // Axios
          'axios-vendor': ['axios'],
          // XTerm terminal
          'xterm-vendor': ['@xterm/xterm', '@xterm/addon-fit'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increased to suppress warnings for large chunks
  },
})

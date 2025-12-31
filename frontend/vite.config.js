import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Enable minification and compression
    minify: 'esbuild', // Faster than terser
    cssMinify: true,
    // Source maps for production debugging (optional, can be disabled for smaller bundle)
    sourcemap: false,
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
        // Optimize chunk file names for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000, // Increased to suppress warnings for large chunks
    // Target modern browsers for smaller bundle size
    target: 'esnext',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@reduxjs/toolkit', 'react-redux'],
  },
})

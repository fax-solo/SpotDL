import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/download/log': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/avatars': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    cssMinify: 'lightningcss',
    minify: 'esbuild',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        hoistTransitiveImports: false,
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor'
          }
          if (id.includes('node_modules/zustand')) {
            return 'zustand'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
          if (id.includes('node_modules/@ffmpeg')) {
            return 'ffmpeg'
          }
          if (id.includes('node_modules/browser-id3-writer')) {
            return 'id3'
          }
          if (id.includes('node_modules/@capacitor')) {
            return 'capacitor'
          }
        },
      },
    },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 400,
  },
  esbuild: {
    target: 'esnext',
  },
})

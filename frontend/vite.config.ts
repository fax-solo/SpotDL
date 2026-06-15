import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssMinify: 'lightningcss',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion'
          }
          if (id.includes('node_modules/@ffmpeg')) {
            return 'ffmpeg'
          }
          if (id.includes('node_modules/browser-id3-writer')) {
            return 'id3'
          }
        },
      },
    },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 500,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/webapp/',
  build: { 
    outDir: 'dist',
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'chess.js', 'react-chessboard', '@twa-dev/sdk']
  },
  define: {
    'process.env.ROLLUP_NATIVE_BINARY': 'false'
  }
})

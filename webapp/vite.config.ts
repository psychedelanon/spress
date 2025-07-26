import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
const basePath = process.env.VERCEL ? '/' : '/webapp/';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  base: basePath,
  build: { 
    outDir: 'dist',
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      external: [],
      output: {
        manualChunks: (id) => {
          // Vendor chunk for large libraries
          if (id.includes('node_modules')) {
            // Chess-related libraries
            if (id.includes('chess.js') || id.includes('react-chessboard')) {
              return 'chess-vendor';
            }
            // Socket.io and WebSocket libraries
            if (id.includes('socket.io-client') || id.includes('reconnecting-websocket')) {
              return 'websocket-vendor';
            }
            // Telegram SDK
            if (id.includes('@twa-dev/sdk')) {
              return 'telegram-vendor';
            }
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Other vendor libraries
            return 'vendor';
          }
          // App chunks
          if (id.includes('src/Board.tsx') || id.includes('src/pieceRenderers.tsx')) {
            return 'board';
          }
          if (id.includes('src/TelegramBridge.ts')) {
            return 'telegram';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    },
    // Enable gzip compression
    cssCodeSplit: true,
    sourcemap: false, // Disable sourcemaps for production
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'chess.js', 'react-chessboard', '@twa-dev/sdk'],
    exclude: ['socket.io-client'], // Lazy load socket.io
  },
  define: {
    'process.env.ROLLUP_NATIVE_BINARY': 'false'
  },
  // Performance optimizations
  server: {
    hmr: {
      overlay: false,
    },
  },

})

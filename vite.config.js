import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      // Yahoo Finance proxy — must come before the general /api proxy
      // so that /api/yahoo/* is matched first (Vite matches in order).
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
      },
      // General API proxy — in production, /api/* routes go through
      // API Gateway via CloudFront. In dev, proxy to a local mock
      // server or a real API Gateway URL set via VITE_API_URL.
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8246',
        changeOrigin: true,
      },
    },
  },
})

import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/wiki/',
  plugins: [reactRouter()],
  server: {
    host: '127.0.0.1',
    port: 8082,
    strictPort: true,
    hmr: { clientPort: 8787 },
    proxy: { '/api/v1': 'http://127.0.0.1:8788' },
  },
})

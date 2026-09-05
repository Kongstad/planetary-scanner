import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/reference': 'http://127.0.0.1:8000',
      '/retrieval': 'http://127.0.0.1:8000',
      '/answers': 'http://127.0.0.1:8000',
    },
  },
})

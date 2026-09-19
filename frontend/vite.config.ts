import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Assets/**/*',
          dest: 'cesium/Assets',
          rename: { stripBase: 5 },
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty/**/*',
          dest: 'cesium/ThirdParty',
          rename: { stripBase: 5 },
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets/**/*',
          dest: 'cesium/Widgets',
          rename: { stripBase: 5 },
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Workers/**/*',
          dest: 'cesium/Workers',
          rename: { stripBase: 5 },
        },
      ],
    }),
  ],
  server: {
    proxy: {
      '/reference': 'http://127.0.0.1:8000',
      '/retrieval': 'http://127.0.0.1:8000',
      '/answers': 'http://127.0.0.1:8000',
      '/imagery': 'http://127.0.0.1:8000',
    },
  },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode }) => {
  const configuredBase =
    process.env.PAGES_BASE_PATH ??
    (mode === 'demo' ? '/planetary-scanner/' : '/')
  const base = configuredBase.endsWith('/')
    ? configuredBase
    : `${configuredBase}/`
  return {
    base,
    define: {
      CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          ...['Assets', 'ThirdParty', 'Widgets', 'Workers'].map(
            (directory) => ({
              src: `node_modules/cesium/Build/Cesium/${directory}/**/*`,
              dest: `cesium/${directory}`,
              rename: { stripBase: 5 },
            }),
          ),
          {
            src: 'node_modules/cesium/LICENSE.md',
            dest: 'third-party-licenses',
            rename: { stripBase: true, name: 'cesium-LICENSE.md' },
          },
        ],
      }),
    ],
    server: {
      proxy: Object.fromEntries(
        ['/reference', '/retrieval', '/answers', '/health', '/imagery'].map(
          (path) => [path, 'http://127.0.0.1:8000'],
        ),
      ),
    },
  }
})

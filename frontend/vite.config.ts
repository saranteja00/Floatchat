import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  define: { CESIUM_BASE_URL: JSON.stringify('./cesium') },
  plugins: [react(), viteStaticCopy({ targets: ['Workers', 'Assets', 'ThirdParty', 'Widgets'].map(name => ({ src: `node_modules/cesium/Build/Cesium/${name}`, dest: 'cesium', rename: { stripBase: 4 } })) })],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/cesium')) return 'vendor-cesium';
          if (id.includes('plotly')) return 'vendor-plotly';
        },
      },
    },
    chunkSizeWarningLimit: 5000,
  },
  server: {
    port: 5177,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8017' },
  },
});


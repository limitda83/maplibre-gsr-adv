import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'MapLibreGsrAdv',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'maplibre-gsr-adv.js' : 'maplibre-gsr-adv.cjs'),
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        '@deck.gl/core',
        '@deck.gl/layers',
        '@deck.gl/mapbox',
        '@luma.gl/core',
        'maplibre-gl',
        'deck.gl-particle',
      ],
    },
  },
});

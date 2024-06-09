import react from '@vitejs/plugin-react-swc';
import zigar from 'rollup-plugin-zigar';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), zigar({ topLevelAwait: false })],
  build: {
    outDir: '../../../../docs/demos/vite/hello',
    emptyOutDir: true,
  },
})
import { defineConfig } from 'vite';
import path from 'path';

const buildTag = process.env.VITE_BUILD_TAG ? `-${process.env.VITE_BUILD_TAG}` : '';

export default defineConfig({
  root: '.',
  base: '/',
  publicDir: 'public',
  build: {
    outDir: '../wyniki/static',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]${buildTag}.js`,
        chunkFileNames: `assets/[name]-[hash]${buildTag}.js`,
        assetFileNames: ({ name }) => {
          const ext = path.extname(name || '');
          const baseName = path.basename(name || 'asset', ext);
          return `assets/${baseName}-[hash]${buildTag}${ext}`;
        }
      },
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
        embed: path.resolve(__dirname, 'embed.html'),
        office: path.resolve(__dirname, 'office.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true
  }
});

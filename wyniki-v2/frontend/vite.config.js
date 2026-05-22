import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: '/',
  publicDir: 'public',
  build: {
    outDir: '../wyniki/static',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
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

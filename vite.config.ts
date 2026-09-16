import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * base: './' → assets relativos, funciona em subpasta no Apache
 * (ex.: https://servidor/.../estruturas/)
 */
export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    envPrefix: 'VITE_',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: false,
    },
    optimizeDeps: {
      include: ['pdfjs-dist'],
    },
    server: {
      host: 'localhost',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: 'localhost',
      port: 3000,
    },
  };
});

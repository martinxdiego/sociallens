import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { sociallensLicenses } from './scripts/sociallens-licenses';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Compile out all upstream service integrations even if a shell inherits VITE_* values.
const disabledServices = ['UMAMI_WEBSITE_ID', 'UMAMI_SRC', 'UMAMI_HOST_URL', 'UMAMI_RECORDER_SRC',
  'DODO_CHECKOUT_URL', 'ADSENSE_CLIENT', 'ADSENSE_SLOT_UPLOAD', 'ADSENSE_SLOT_RESULTS', 'ADSENSE_SLOT_RESULTS_END'];
export default defineConfig({
  root: path.join(directory, 'app'),
  publicDir: path.join(directory, 'public-sociallens'),
  resolve: { alias: { '@': path.join(directory, 'src'), '@tests': path.join(directory, 'src/__tests__') } },
  define: {
    __APP_VERSION__: JSON.stringify('sociallens-0.1.0'),
    __PKG_VERSION__: JSON.stringify('1.6.0'),
    ...Object.fromEntries(disabledServices.map(name => [`import.meta.env.VITE_${name}`, 'undefined'])),
  },
  plugins: [react(), sociallensLicenses(directory), viteStaticCopy({ targets: [{ src: path.join(directory, 'public/sample-data.json'), dest: '.' }, { src: path.join(directory, 'public/logo.svg'), dest: '.' }, { src: path.join(directory, 'public/wizard'), dest: '.' }] }), VitePWA({
    registerType: 'prompt',
    injectRegister: 'script',
    manifest: {
      name: 'SocialLens', short_name: 'SocialLens', lang: 'de', start_url: '/', scope: '/',
      description: 'Deine Instagram-Beziehungen lokal verstehen.', display: 'standalone',
      theme_color: '#245ec7', background_color: '#f5f7fa',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2,svg,png,jpg,mp4,webm,json,txt}'],
      maximumFileSizeToCacheInBytes: 5000000,
      navigateFallback: '/index.html', cleanupOutdatedCaches: true,
      // No imported data or outbound requests are cached. Only build assets are precached.
    },
  })],
  build: { outDir: path.join(directory, 'dist-sociallens'), emptyOutDir: true, target: 'es2020' },
  server: { host: '127.0.0.1', port: 5173, fs: { allow: [directory] } },
  preview: { host: '127.0.0.1', port: 5173 },
});

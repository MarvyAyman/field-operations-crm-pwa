import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // the user taps "تحديث" (see components/UpdatePrompt.jsx)
      includeAssets: ['favicon.svg', 'church-visitation-logo.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'الافتقاد الميداني',
        short_name: 'افتقاد',
        description: 'تطبيق خدمة الافتقاد — يعمل بدون اتصال',
        theme_color: '#243F66',
        background_color: '#F7F5F2',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Keep the service worker ON in `npm run dev` too, so offline refresh can be
      // tested without building. (dev-dist/ is generated: add it to .gitignore)
      devOptions: { enabled: true, type: 'module', navigateFallback: '/index.html' },
      workbox: {
        // the whole app shell is cached on first visit -> opens with no internet
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        // any page URL opened offline falls back to the React app (but never /api or /admin)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//, /^\/static\//],
        // NOTE: /api responses are NOT cached by the service worker.
        // Data lives in IndexedDB (src/db.js) and is filled by src/sync.js,
        // so nothing private stays in a cache after logout.
        runtimeCaching: [
          // `npm run dev` only: the dev server sends every source file separately
          // (/src/*.jsx, /node_modules/.vite/...). Save each one the first time it is
          // loaded online, so a refresh with no internet still opens the app.
          // /api is never cached (private data lives in IndexedDB instead).
          ...(command === 'serve'
            ? [{
                urlPattern: ({ url, sameOrigin }) =>
                  sameOrigin && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/admin'),
                handler: 'NetworkFirst',
                options: { cacheName: 'dev-files', networkTimeoutSeconds: 3 },
              }]
            : []),
          {
            // Tajawal font (loaded from Google Fonts in index.css)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
}))

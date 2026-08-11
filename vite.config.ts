import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Musik & Podcasts',
        short_name: 'Musik',
        description: 'Musik und Podcasts über die Boxen hören.',
        lang: 'de',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Any unknown path should boot the SPA, but /callback must reach the
        // app fresh rather than being served a cached shell mid-OAuth.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/callback/],
        runtimeCaching: [
          {
            // Cover art is immutable and by far the heaviest traffic.
            urlPattern: /^https:\/\/i\.scdn\.co\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'spotify-artwork',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Spotify bans `localhost` as a redirect URI but permits the 127.0.0.1
    // loopback form, so develop on that host to match what is registered.
    host: '127.0.0.1',
    port: 5173,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Set by the deploy workflow, and only there — a local `npm run dev` or `npm
 * run build` has it unset and so builds exactly what production builds.
 *
 * Not `VITE_`-prefixed on purpose: it is read here, in Node, and never inlined
 * into client code.
 */
const TITLE_PREFIX = process.env.DEPLOY_TARGET === 'preview' ? 'Prev-' : '';

export default defineConfig({
  plugins: [
    react(),
    {
      // A preview and the live site are otherwise identical in the tab strip,
      // which is how you end up checking a fix on the wrong one.
      name: 'deploy-title-prefix',
      transformIndexHtml(html) {
        if (!TITLE_PREFIX) return html;
        const out = html.replace(/<title>/, `<title>${TITLE_PREFIX}`);
        // Failing the build beats shipping a preview that reads as production
        // — the one confusion this plugin exists to prevent.
        if (out === html) {
          throw new Error('deploy-title-prefix: no <title> in index.html');
        }
        return out;
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        // Prefixed too, so an installed preview keeps its own home-screen
        // identity rather than shadowing the installed live app.
        name: `${TITLE_PREFIX}Musik & Podcasts`,
        short_name: `${TITLE_PREFIX}Musik`,
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
